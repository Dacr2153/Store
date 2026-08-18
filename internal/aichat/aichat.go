// Package aichat implements a ChatGPT-style shopping assistant. It is a
// fully self-contained engine: no external LLM is required. The assistant:
//
//  1. Parses the user's natural-language query into structured filters
//     (brand, color, size, category, price range, gender, free-text keywords).
//  2. Runs a single SQL query against the products table using Postgres'
//     full-text search + structured filters.
//  3. Re-uses an in-memory LRU cache to avoid hitting the DB for repeated
//     queries (massively reduces load and is what the user explicitly asked for).
//  4. Persists the conversation (sessions + messages) per user so the
//     frontend can show ChatGPT-style history.
//
// Image and camera analysis: the frontend extracts a dominant color from the
// uploaded image / camera frame and sends it as a hint string. We treat it as
// an extra keyword in the parsed filters.
package aichat

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v4"
	"github.com/gorilla/mux"
	"github.com/kevintovar01/Store/middleware"
	"github.com/kevintovar01/Store/models"
	"github.com/kevintovar01/Store/server"
)

func userIDFrom(s server.Server, r *http.Request) (string, error) {
	tok, err := middleware.TokenAuth(s, nil, *r)
	if err != nil || tok == nil {
		return "", err
	}
	claims, ok := tok.Claims.(*models.AppClaims)
	if !ok || claims == nil {
		return "", jwt.ErrSignatureInvalid
	}
	return claims.UserId, nil
}

// ----------------------------------------------------------------------------
// Service wiring
// ----------------------------------------------------------------------------

type Service struct {
	db    *sql.DB
	s     server.Server
	cache *queryCache
}

func New(s server.Server) *Service {
	return &Service{
		db:    s.DB(),
		s:     s,
		cache: newQueryCache(200, 5*time.Minute),
	}
}

// ----------------------------------------------------------------------------
// DTOs
// ----------------------------------------------------------------------------

type ProductHit struct {
	ID    string  `json:"id"`
	Name  string  `json:"name"`
	Price float64 `json:"price"`
	Stock int     `json:"stock"`
	Image string  `json:"image,omitempty"`
}

type ParsedQuery struct {
	Keywords []string `json:"keywords,omitempty"`
	Brand    string   `json:"brand,omitempty"`
	Color    string   `json:"color,omitempty"`
	Size     string   `json:"size,omitempty"`
	Category string   `json:"category,omitempty"`
	Gender   string   `json:"gender,omitempty"`
	MinPrice float64  `json:"min_price,omitempty"`
	MaxPrice float64  `json:"max_price,omitempty"`
}

type AssistantPayload struct {
	Products []ProductHit `json:"products"`
	Parsed   ParsedQuery  `json:"parsed"`
	ShopURL  string       `json:"shop_url,omitempty"`
	ImageURL string       `json:"image_url,omitempty"`
}

type Session struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	UpdatedAt time.Time `json:"updated_at"`
	CreatedAt time.Time `json:"created_at"`
}

type Message struct {
	ID        string          `json:"id"`
	Role      string          `json:"role"`
	Content   string          `json:"content"`
	Payload   json.RawMessage `json:"payload,omitempty"`
	CreatedAt time.Time       `json:"created_at"`
}

// ----------------------------------------------------------------------------
// HTTP handlers
// ----------------------------------------------------------------------------

// GET /chat/sessions — list current user's sessions (most recent first).
func (svc *Service) HandleListSessions() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, err := userIDFrom(svc.s, r)
		if err != nil || uid == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		rows, err := svc.db.QueryContext(r.Context(),
			`SELECT id, title, created_at, updated_at FROM chat_sessions
			 WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 100`, uid)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		out := []Session{}
		for rows.Next() {
			var s Session
			if err := rows.Scan(&s.ID, &s.Title, &s.CreatedAt, &s.UpdatedAt); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			out = append(out, s)
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// POST /chat/sessions — create a new empty session.
func (svc *Service) HandleCreateSession() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, err := userIDFrom(svc.s, r)
		if err != nil || uid == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		var body struct {
			Title string `json:"title"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if strings.TrimSpace(body.Title) == "" {
			body.Title = "New chat"
		}
		var s Session
		err = svc.db.QueryRowContext(r.Context(),
			`INSERT INTO chat_sessions(user_id, title) VALUES($1,$2)
			 RETURNING id, title, created_at, updated_at`,
			uid, body.Title).Scan(&s.ID, &s.Title, &s.CreatedAt, &s.UpdatedAt)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusCreated, s)
	}
}

// DELETE /chat/sessions/{id}
func (svc *Service) HandleDeleteSession() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, err := userIDFrom(svc.s, r)
		if err != nil || uid == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		id := mux.Vars(r)["id"]
		if _, err := svc.db.ExecContext(r.Context(),
			`DELETE FROM chat_sessions WHERE id=$1 AND user_id=$2`, id, uid); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// GET /chat/sessions/{id}/messages
func (svc *Service) HandleListMessages() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, err := userIDFrom(svc.s, r)
		if err != nil || uid == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		id := mux.Vars(r)["id"]
		// ownership check
		var owner string
		if err := svc.db.QueryRowContext(r.Context(),
			`SELECT user_id FROM chat_sessions WHERE id=$1`, id).Scan(&owner); err != nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		if owner != uid {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		rows, err := svc.db.QueryContext(r.Context(),
			`SELECT id, role, content, COALESCE(payload, 'null'::jsonb), created_at
			 FROM chat_messages WHERE session_id=$1 ORDER BY created_at ASC`, id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		out := []Message{}
		for rows.Next() {
			var m Message
			var payload []byte
			if err := rows.Scan(&m.ID, &m.Role, &m.Content, &payload, &m.CreatedAt); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			if len(payload) > 0 && string(payload) != "null" {
				m.Payload = payload
			}
			out = append(out, m)
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// POST /chat/sessions/{id}/messages — append a user message and get assistant reply.
//
// Request body: { "content": "...", "image_hint": "white", "image_url": "..." }
// Response: { "user": Message, "assistant": Message }
func (svc *Service) HandleSendMessage() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, err := userIDFrom(svc.s, r)
		if err != nil || uid == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		sessionID := mux.Vars(r)["id"]

		// ownership check
		var owner, currentTitle string
		if err := svc.db.QueryRowContext(r.Context(),
			`SELECT user_id, title FROM chat_sessions WHERE id=$1`, sessionID).
			Scan(&owner, &currentTitle); err != nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		if owner != uid {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}

		var body struct {
			Content   string `json:"content"`
			ImageHint string `json:"image_hint"`
			ImageURL  string `json:"image_url"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}
		body.Content = strings.TrimSpace(body.Content)
		if body.Content == "" && body.ImageHint == "" {
			http.Error(w, "empty message", http.StatusBadRequest)
			return
		}

		// 1) Persist user message
		var userMsg Message
		userPayload, _ := json.Marshal(map[string]string{"image_url": body.ImageURL})
		if body.ImageURL == "" {
			userPayload = nil
		}
		if err := svc.db.QueryRowContext(r.Context(),
			`INSERT INTO chat_messages(session_id, role, content, payload)
			 VALUES($1,'user',$2,$3)
			 RETURNING id, role, content, COALESCE(payload,'null'::jsonb), created_at`,
			sessionID, body.Content, nullableJSON(userPayload)).
			Scan(&userMsg.ID, &userMsg.Role, &userMsg.Content,
				(*rawJSONScanner)(&userMsg.Payload), &userMsg.CreatedAt); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// 2) Generate assistant reply
		parsed := ParseQuery(body.Content + " " + body.ImageHint)
		hits, err := svc.searchProducts(r.Context(), parsed, 8)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		reply, shopURL := buildReply(body.Content, parsed, hits)
		assistPayload := AssistantPayload{
			Products: hits,
			Parsed:   parsed,
			ShopURL:  shopURL,
			ImageURL: body.ImageURL,
		}
		assistJSON, _ := json.Marshal(assistPayload)

		var asMsg Message
		if err := svc.db.QueryRowContext(r.Context(),
			`INSERT INTO chat_messages(session_id, role, content, payload)
			 VALUES($1,'assistant',$2,$3)
			 RETURNING id, role, content, COALESCE(payload,'null'::jsonb), created_at`,
			sessionID, reply, assistJSON).
			Scan(&asMsg.ID, &asMsg.Role, &asMsg.Content,
				(*rawJSONScanner)(&asMsg.Payload), &asMsg.CreatedAt); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// 3) Bump session updated_at, set title from first user prompt
		newTitle := currentTitle
		if currentTitle == "" || currentTitle == "New chat" {
			newTitle = truncateTitle(body.Content)
		}
		_, _ = svc.db.ExecContext(r.Context(),
			`UPDATE chat_sessions SET updated_at=NOW(), title=$2 WHERE id=$1`,
			sessionID, newTitle)

		writeJSON(w, http.StatusOK, map[string]any{
			"user":      userMsg,
			"assistant": asMsg,
		})
	}
}

// ----------------------------------------------------------------------------
// Natural-language parser
// ----------------------------------------------------------------------------

var (
	colorWords = map[string]string{
		"blanco": "white", "white": "white",
		"negro": "black", "black": "black",
		"rojo": "red", "red": "red",
		"azul": "blue", "blue": "blue",
		"verde": "green", "green": "green",
		"amarillo": "yellow", "yellow": "yellow",
		"gris": "gray", "gray": "gray", "grey": "gray",
		"morado": "purple", "purple": "purple", "violeta": "purple",
		"rosa": "pink", "pink": "pink",
		"naranja": "orange", "orange": "orange",
		"cafe": "brown", "brown": "brown", "marron": "brown",
		"beige": "beige",
	}
	brandWords = map[string]bool{
		"adidas": true, "nike": true, "puma": true, "reebok": true,
		"zara": true, "h&m": true, "gucci": true, "prada": true,
		"levis": true, "tommy": true, "calvin": true, "lacoste": true,
		"under": true, "armour": true, "new": true, "balance": true,
		"converse": true, "vans": true, "fila": true, "champion": true,
	}
	categoryHints = map[string]string{
		// Fashion
		"camisa": "fashion", "shirt": "fashion", "blusa": "fashion", "camiseta": "fashion", "playera": "fashion", "tshirt": "fashion",
		"pantalon": "fashion", "pants": "fashion", "jeans": "fashion",
		"zapato": "fashion", "shoes": "fashion", "tenis": "fashion", "sneaker": "fashion", "sneakers": "fashion",
		"vestido": "fashion", "dress": "fashion",
		"chaqueta": "fashion", "jacket": "fashion", "abrigo": "fashion",
		"falda": "fashion", "skirt": "fashion",
		"sombrero": "fashion", "hat": "fashion", "gorra": "fashion", "cap": "fashion",
		"reloj": "fashion", "watch": "fashion",
		"bolso": "fashion", "bag": "fashion", "mochila": "fashion", "backpack": "fashion",
		"ropa": "fashion", "clothing": "fashion", "moda": "fashion",
		// Electronics
		"telefono": "electronics", "celular": "electronics", "phone": "electronics", "smartphone": "electronics", "movil": "electronics",
		"laptop": "electronics", "computadora": "electronics", "computer": "electronics", "pc": "electronics", "ordenador": "electronics",
		"tablet": "electronics", "ipad": "electronics",
		"audifonos": "electronics", "auriculares": "electronics", "headphones": "electronics", "earbuds": "electronics", "earphones": "electronics",
		"camara": "electronics", "camera": "electronics",
		"tv": "electronics", "television": "electronics", "monitor": "electronics", "pantalla": "electronics",
		"consola": "electronics", "console": "electronics",
		"electronica": "electronics", "electronics": "electronics",
		// Home & kitchen
		"cocina": "home-kitchen", "kitchen": "home-kitchen",
		"cama": "home-kitchen", "bed": "home-kitchen", "colchon": "home-kitchen",
		"sofa": "home-kitchen", "couch": "home-kitchen", "mueble": "home-kitchen", "furniture": "home-kitchen",
		"lampara": "home-kitchen", "lamp": "home-kitchen",
		"sarten": "home-kitchen", "olla": "home-kitchen", "pot": "home-kitchen", "pan": "home-kitchen",
		"casa": "home-kitchen", "hogar": "home-kitchen", "home": "home-kitchen",
		// Beauty
		"maquillaje": "beauty", "makeup": "beauty",
		"perfume": "beauty", "fragancia": "beauty",
		"crema": "beauty", "cream": "beauty", "lotion": "beauty",
		"shampoo": "beauty", "champu": "beauty",
		"belleza": "beauty", "beauty": "beauty", "cosmetic": "beauty", "cosmetico": "beauty",
		// Sports
		"deporte": "sports", "sport": "sports", "sports": "sports",
		"pelota": "sports", "balon": "sports", "ball": "sports",
		"yoga": "sports", "gimnasio": "sports", "gym": "sports",
		"mancuerna": "sports", "dumbbell": "sports", "pesa": "sports",
		"bicicleta": "sports", "bike": "sports", "bicycle": "sports",
		"correr": "sports", "running": "sports",
		// Books
		"libro": "books", "book": "books", "libros": "books", "books": "books",
		"novela": "books", "novel": "books",
		"lectura": "books",
		// Toys
		"juguete": "toys", "toy": "toys", "toys": "toys", "juguetes": "toys",
		"lego": "toys", "muneca": "toys", "doll": "toys",
		"puzzle": "toys", "rompecabezas": "toys",
		// Automotive
		"carro": "automotive", "auto": "automotive", "car": "automotive", "coche": "automotive",
		"llanta": "automotive", "tire": "automotive", "rueda": "automotive",
		"motor": "automotive", "engine": "automotive",
		"automotriz": "automotive", "automotive": "automotive",
	}
	genderWords = map[string]string{
		"hombre": "men", "men": "men", "masculino": "men",
		"mujer": "women", "women": "women", "femenino": "women",
		"niño": "kids", "niña": "kids", "kids": "kids", "child": "kids",
	}
	sizeRegex  = regexp.MustCompile(`(?i)\b(talla|size)\s*([xs|s|m|l|xl|xxl|xxxl]+|\d{2,3})\b|\b(xs|xxxl|xxl|xl|s|m|l)\b(?:\s+size|\s+talla)?`)
	priceRegex = regexp.MustCompile(`(?i)(?:menos\s+de|under|less\s+than|debajo\s+de)\s*\$?\s*(\d+(?:\.\d+)?)|(?:m[áa]s\s+de|over|more\s+than|encima\s+de)\s*\$?\s*(\d+(?:\.\d+)?)|(?:entre|between)\s*\$?\s*(\d+(?:\.\d+)?)\s*(?:y|and|-)\s*\$?\s*(\d+(?:\.\d+)?)`)
)

// ParseQuery extracts structured filters from a free-text user prompt.
// It is intentionally simple, deterministic, fast and offline.
func ParseQuery(input string) ParsedQuery {
	s := strings.ToLower(input)
	out := ParsedQuery{}

	// price ranges
	if m := priceRegex.FindStringSubmatch(s); m != nil {
		switch {
		case m[1] != "":
			out.MaxPrice, _ = strconv.ParseFloat(m[1], 64)
		case m[2] != "":
			out.MinPrice, _ = strconv.ParseFloat(m[2], 64)
		case m[3] != "" && m[4] != "":
			out.MinPrice, _ = strconv.ParseFloat(m[3], 64)
			out.MaxPrice, _ = strconv.ParseFloat(m[4], 64)
		}
	}

	// size
	if m := sizeRegex.FindStringSubmatch(s); m != nil {
		// pick first non-empty capture
		for _, g := range m[1:] {
			if g != "" {
				out.Size = strings.ToUpper(g)
				break
			}
		}
	}

	// tokenize on word boundaries
	tokens := regexp.MustCompile(`[a-záéíóúñü]+`).FindAllString(s, -1)
	keywordSet := map[string]bool{}
	for _, t := range tokens {
		if c, ok := colorWords[t]; ok && out.Color == "" {
			out.Color = c
			continue
		}
		if cat, ok := categoryHints[t]; ok && out.Category == "" {
			out.Category = cat
			continue
		}
		if g, ok := genderWords[t]; ok && out.Gender == "" {
			out.Gender = g
			continue
		}
		if brandWords[t] && out.Brand == "" {
			out.Brand = t
			continue
		}
		// stopwords
		if isStopword(t) {
			continue
		}
		if len(t) >= 3 {
			keywordSet[t] = true
		}
	}
	for k := range keywordSet {
		out.Keywords = append(out.Keywords, k)
	}
	return out
}

func isStopword(t string) bool {
	switch t {
	case "una", "uno", "unos", "unas", "el", "la", "los", "las", "de", "del", "para", "con", "sin",
		"que", "quiero", "busco", "necesito", "mostrar", "ver", "show", "want", "need",
		"the", "a", "an", "of", "for", "with", "without", "and", "or", "in", "on", "to",
		"is", "are", "me", "mi", "my", "talla", "size", "color":
		return true
	}
	return false
}

// ----------------------------------------------------------------------------
// Product search with caching
// ----------------------------------------------------------------------------

func (svc *Service) searchProducts(ctx context.Context, p ParsedQuery, limit int) ([]ProductHit, error) {
	cacheKey := p.cacheKey() + fmt.Sprintf("|lim=%d", limit)
	if hit, ok := svc.cache.get(cacheKey); ok {
		return hit, nil
	}

	// Strategy: build a SOFT, ranked search. We never AND keywords together
	// (the previous behaviour required ALL terms in name+description, so a
	// query like "phone" would miss a "Smartphone" product). Instead we:
	//   - OR every keyword/brand/color into a tsquery
	//   - additionally OR an ILIKE per term against name+description so we
	//     still match when the FTS lexer drops or stems a token
	//   - rank by ts_rank + a small boost when the term appears in the name
	//   - apply price filters as hard constraints (user explicitly asked for them)
	//   - apply category as a SOFT preference: try with the category filter first;
	//     if 0 results come back, retry without it so the user always sees something.
	terms := make([]string, 0, 8)
	addTerm := func(t string) {
		t = strings.TrimSpace(t)
		if t == "" {
			return
		}
		// dedupe and skip very short tokens
		for _, x := range terms {
			if strings.EqualFold(x, t) {
				return
			}
		}
		terms = append(terms, t)
	}
	if p.Brand != "" {
		addTerm(p.Brand)
	}
	if p.Color != "" {
		addTerm(p.Color)
	}
	for _, k := range p.Keywords {
		addTerm(k)
	}

	run := func(useCategory bool) ([]ProductHit, error) {
		var (
			where []string
			args  []any
			idx   = 1
		)
		next := func() string {
			s := "$" + strconv.Itoa(idx)
			idx++
			return s
		}

		// Relevance score expression. When there are no terms we fall back to
		// "all products, newest first" which matches the previous behaviour.
		rankExpr := "0::float"
		if len(terms) > 0 {
			tsq := strings.Join(terms, " | ") // OR'd tsquery
			rankPlaceholder := next()
			args = append(args, tsq)
			// ILIKE OR group: any term appearing in name OR description scores points.
			likeFrags := make([]string, 0, len(terms)*2)
			nameLikeFrags := make([]string, 0, len(terms))
			for _, t := range terms {
				p1 := next()
				args = append(args, "%"+t+"%")
				likeFrags = append(likeFrags, fmt.Sprintf("(p.name ILIKE %s OR COALESCE(p.description,'') ILIKE %s)", p1, p1))
				p2 := next()
				args = append(args, "%"+t+"%")
				nameLikeFrags = append(nameLikeFrags, fmt.Sprintf("(p.name ILIKE %s)", p2))
			}
			likeOr := strings.Join(likeFrags, " OR ")
			nameOr := strings.Join(nameLikeFrags, " OR ")
			// Score = ts_rank (FTS, handles stemming-ish via 'simple') + 0.5 if any
			// ILIKE in name (boost exact substring matches in product name).
			rankExpr = fmt.Sprintf(
				`(ts_rank(to_tsvector('simple', p.name || ' ' || COALESCE(p.description,'')), to_tsquery('simple', %s))
				  + CASE WHEN %s THEN 0.5 ELSE 0 END
				  + CASE WHEN %s THEN 0.2 ELSE 0 END)`,
				rankPlaceholder, nameOr, likeOr,
			)
			// Match clause: must hit either FTS or any ILIKE so we don't return
			// the entire catalogue when the user typed something specific.
			matchClause := fmt.Sprintf(
				`(to_tsvector('simple', p.name || ' ' || COALESCE(p.description,'')) @@ to_tsquery('simple', %s) OR (%s))`,
				rankPlaceholder, likeOr,
			)
			where = append(where, matchClause)
		}

		if useCategory && p.Category != "" {
			ph := next()
			args = append(args, p.Category)
			where = append(where, fmt.Sprintf(
				"EXISTS (SELECT 1 FROM product_categories pc JOIN categories c ON c.id=pc.category_id WHERE pc.product_id=p.id AND c.slug=%s)",
				ph,
			))
		}
		if p.MinPrice > 0 {
			ph := next()
			args = append(args, p.MinPrice)
			where = append(where, "p.price >= "+ph)
		}
		if p.MaxPrice > 0 {
			ph := next()
			args = append(args, p.MaxPrice)
			where = append(where, "p.price <= "+ph)
		}

		whereSQL := ""
		if len(where) > 0 {
			whereSQL = "WHERE " + strings.Join(where, " AND ")
		}

		limitPh := next()
		args = append(args, limit)

		sqlStr := fmt.Sprintf(`
			SELECT p.id, p.name, p.price, p.stock,
			       COALESCE((SELECT i.url FROM product_images pi2
			                 JOIN images i ON i.id = pi2.image_id
			                 WHERE pi2.product_id = p.id
			                 ORDER BY pi2.created_at LIMIT 1), '') AS image,
			       %s AS score
			FROM products p
			%s
			ORDER BY score DESC, p.created_at DESC
			LIMIT %s`, rankExpr, whereSQL, limitPh)

		rows, err := svc.db.QueryContext(ctx, sqlStr, args...)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		out := []ProductHit{}
		for rows.Next() {
			var h ProductHit
			var score float64
			if err := rows.Scan(&h.ID, &h.Name, &h.Price, &h.Stock, &h.Image, &score); err != nil {
				return nil, err
			}
			out = append(out, h)
		}
		return out, nil
	}

	// First pass: with category filter (if any).
	out, err := run(true)
	if err != nil {
		return nil, err
	}
	// Soft fallback: if we filtered by category and got nothing, drop it so
	// the user sees similar products from other categories instead of an
	// empty result page.
	if len(out) == 0 && p.Category != "" {
		out, err = run(false)
		if err != nil {
			return nil, err
		}
	}
	svc.cache.set(cacheKey, out)
	return out, nil
}

// ----------------------------------------------------------------------------
// Reply builder
// ----------------------------------------------------------------------------

func buildReply(prompt string, p ParsedQuery, hits []ProductHit) (text string, shopURL string) {
	criteria := []string{}
	if p.Brand != "" {
		criteria = append(criteria, "marca **"+p.Brand+"**")
	}
	if p.Color != "" {
		criteria = append(criteria, "color **"+p.Color+"**")
	}
	if p.Size != "" {
		criteria = append(criteria, "talla **"+p.Size+"**")
	}
	if p.Category != "" {
		criteria = append(criteria, "categoría **"+p.Category+"**")
	}
	if p.MinPrice > 0 || p.MaxPrice > 0 {
		switch {
		case p.MinPrice > 0 && p.MaxPrice > 0:
			criteria = append(criteria, fmt.Sprintf("precio entre $%.0f y $%.0f", p.MinPrice, p.MaxPrice))
		case p.MaxPrice > 0:
			criteria = append(criteria, fmt.Sprintf("precio menor a $%.0f", p.MaxPrice))
		case p.MinPrice > 0:
			criteria = append(criteria, fmt.Sprintf("precio mayor a $%.0f", p.MinPrice))
		}
	}

	shopURL = buildShopURL(p)

	if len(hits) == 0 {
		if len(criteria) > 0 {
			return "No encontré coincidencias exactas para " + strings.Join(criteria, ", ") +
				". Te muestro productos relacionados que podrían interesarte; también puedes ajustar tu búsqueda.", shopURL
		}
		return "No encontré productos que coincidan. ¿Puedes darme más detalles (marca, color, talla, precio)?", shopURL
	}

	if len(criteria) == 0 {
		return fmt.Sprintf("Encontré %d productos que pueden interesarte:", len(hits)), shopURL
	}
	return fmt.Sprintf("Encontré %d productos coincidiendo con %s. Aquí están los mejores resultados:",
		len(hits), strings.Join(criteria, ", ")), shopURL
}

func buildShopURL(p ParsedQuery) string {
	q := []string{}
	addP := func(k, v string) {
		if v != "" {
			q = append(q, k+"="+v)
		}
	}
	addP("q", strings.Join(append([]string{p.Brand, p.Color}, p.Keywords...), " "))
	addP("category", p.Category)
	if p.MinPrice > 0 {
		q = append(q, fmt.Sprintf("min_price=%.0f", p.MinPrice))
	}
	if p.MaxPrice > 0 {
		q = append(q, fmt.Sprintf("max_price=%.0f", p.MaxPrice))
	}
	return "/shop?" + strings.Join(q, "&")
}

func truncateTitle(s string) string {
	s = strings.TrimSpace(s)
	if len(s) > 60 {
		return s[:57] + "…"
	}
	if s == "" {
		return "New chat"
	}
	return s
}

// ----------------------------------------------------------------------------
// LRU + TTL cache
// ----------------------------------------------------------------------------

type cacheEntry struct {
	data []ProductHit
	exp  time.Time
}

type queryCache struct {
	mu      sync.Mutex
	max     int
	ttl     time.Duration
	entries map[string]cacheEntry
	order   []string // insertion order for simple LRU
}

func newQueryCache(max int, ttl time.Duration) *queryCache {
	return &queryCache{max: max, ttl: ttl, entries: map[string]cacheEntry{}}
}

func (c *queryCache) get(k string) ([]ProductHit, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.entries[k]
	if !ok {
		return nil, false
	}
	if time.Now().After(e.exp) {
		delete(c.entries, k)
		return nil, false
	}
	return e.data, true
}

func (c *queryCache) set(k string, v []ProductHit) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if _, ok := c.entries[k]; !ok {
		c.order = append(c.order, k)
		for len(c.order) > c.max {
			oldest := c.order[0]
			c.order = c.order[1:]
			delete(c.entries, oldest)
		}
	}
	c.entries[k] = cacheEntry{data: v, exp: time.Now().Add(c.ttl)}
}

func (p ParsedQuery) cacheKey() string {
	kws := make([]string, len(p.Keywords))
	copy(kws, p.Keywords)
	// stable order
	for i := 0; i < len(kws); i++ {
		for j := i + 1; j < len(kws); j++ {
			if kws[j] < kws[i] {
				kws[i], kws[j] = kws[j], kws[i]
			}
		}
	}
	return fmt.Sprintf("b=%s|c=%s|s=%s|cat=%s|g=%s|min=%g|max=%g|kw=%s",
		p.Brand, p.Color, p.Size, p.Category, p.Gender, p.MinPrice, p.MaxPrice,
		strings.Join(kws, ","))
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func nullableJSON(b []byte) any {
	if len(b) == 0 {
		return nil
	}
	return b
}

// rawJSONScanner allows scanning a JSONB column straight into json.RawMessage.
type rawJSONScanner json.RawMessage

func (r *rawJSONScanner) Scan(src any) error {
	if src == nil {
		*r = nil
		return nil
	}
	switch v := src.(type) {
	case []byte:
		if string(v) == "null" {
			*r = nil
			return nil
		}
		cp := make([]byte, len(v))
		copy(cp, v)
		*r = rawJSONScanner(cp)
		return nil
	case string:
		if v == "null" {
			*r = nil
			return nil
		}
		*r = rawJSONScanner([]byte(v))
		return nil
	}
	return errors.New("aichat: unsupported scan source")
}
