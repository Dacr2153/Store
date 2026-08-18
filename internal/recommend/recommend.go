// Package recommend provides recently-viewed (cookie-based) and trending product
// endpoints. It complements internal/catalog.HandleRelated to complete Phase N.
package recommend

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gorilla/mux"
	"github.com/kevintovar01/Store/server"
)

const recentCookie = "recent_viewed"
const recentMax = 20

type Service struct {
	db *sql.DB
	s  server.Server
}

func New(s server.Server) *Service { return &Service{db: s.DB(), s: s} }

type productLite struct {
	ID    string  `json:"id"`
	Name  string  `json:"name"`
	Price float64 `json:"price"`
	Stock int     `json:"stock"`
}

// POST /products/{id}/view — append to recent_viewed cookie (idempotent dedup).
func (s *Service) HandleTrackView() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		if id == "" {
			http.Error(w, "id required", http.StatusBadRequest)
			return
		}
		// validate the product exists to avoid arbitrary cookie pollution.
		var ok bool
		if err := s.db.QueryRowContext(r.Context(),
			`SELECT EXISTS(SELECT 1 FROM products WHERE id=$1)`, id).Scan(&ok); err != nil || !ok {
			http.Error(w, "product not found", http.StatusNotFound)
			return
		}
		current := readRecent(r)
		// move-to-front, dedup
		next := []string{id}
		for _, x := range current {
			if x == id {
				continue
			}
			next = append(next, x)
			if len(next) >= recentMax {
				break
			}
		}
		writeRecentCookie(w, next)
		writeJSON(w, http.StatusOK, map[string]any{"recent": next})
	}
}

// GET /products/recently-viewed — list product details for the cookie list.
func (s *Service) HandleRecentlyViewed() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ids := readRecent(r)
		if len(ids) == 0 {
			writeJSON(w, http.StatusOK, []productLite{})
			return
		}
		// SELECT preserving order using array_position
		rows, err := s.db.QueryContext(r.Context(),
			`SELECT id, name, price, stock FROM products
			 WHERE id = ANY($1)
			 ORDER BY array_position($1, id)`, pqStringArray(ids))
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		out := []productLite{}
		for rows.Next() {
			var p productLite
			_ = rows.Scan(&p.ID, &p.Name, &p.Price, &p.Stock)
			out = append(out, p)
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// GET /products/trending?window=7d — popularity score = orders + reviews in window.
// window: 1d|7d|30d (default 7d).
func (s *Service) HandleTrending() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		window := r.URL.Query().Get("window")
		interval := "7 days"
		switch window {
		case "1d":
			interval = "1 day"
		case "30d":
			interval = "30 days"
		}
		// score: 3*sum(order_items.quantity in window) + 1*reviews in window
		rows, err := s.db.QueryContext(r.Context(), `
			WITH oi AS (
				SELECT oi.product_id, SUM(oi.quantity)::int AS units
				FROM order_items oi
				JOIN orders o ON o.id = oi.order_id
				WHERE o.created_at >= NOW() - $1::interval
				  AND o.status IN ('paid','shipped','delivered')
				GROUP BY oi.product_id
			),
			rv AS (
				SELECT product_id, COUNT(*)::int AS n
				FROM reviews
				WHERE created_at >= NOW() - $1::interval
				GROUP BY product_id
			)
			SELECT p.id, p.name, p.price, p.stock,
			       COALESCE(oi.units,0)*3 + COALESCE(rv.n,0) AS score
			FROM products p
			LEFT JOIN oi ON oi.product_id = p.id
			LEFT JOIN rv ON rv.product_id = p.id
			WHERE COALESCE(oi.units,0) > 0 OR COALESCE(rv.n,0) > 0
			ORDER BY score DESC, p.name
			LIMIT 12`, interval)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		type item struct {
			productLite
			Score int `json:"score"`
		}
		out := []item{}
		for rows.Next() {
			var it item
			_ = rows.Scan(&it.ID, &it.Name, &it.Price, &it.Stock, &it.Score)
			out = append(out, it)
		}
		// Cold-start fallback: most-stocked products when no activity yet.
		if len(out) == 0 {
			frows, err := s.db.QueryContext(r.Context(),
				`SELECT id, name, price, stock FROM products
				 ORDER BY stock DESC, name LIMIT 12`)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			defer frows.Close()
			for frows.Next() {
				var p productLite
				_ = frows.Scan(&p.ID, &p.Name, &p.Price, &p.Stock)
				out = append(out, item{productLite: p, Score: 0})
			}
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// ----- helpers -----

func readRecent(r *http.Request) []string {
	c, err := r.Cookie(recentCookie)
	if err != nil || c.Value == "" {
		return nil
	}
	parts := strings.Split(c.Value, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func writeRecentCookie(w http.ResponseWriter, ids []string) {
	http.SetCookie(w, &http.Cookie{
		Name:     recentCookie,
		Value:    strings.Join(ids, ","),
		Path:     "/",
		MaxAge:   60 * 60 * 24 * 30,
		HttpOnly: false,
		SameSite: http.SameSiteLaxMode,
	})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

// pqStringArray adapts []string for pq driver as text[].
func pqStringArray(s []string) interface{} {
	// Build the literal manually so we don't pull pq.Array into this file's imports.
	if len(s) == 0 {
		return "{}"
	}
	var b strings.Builder
	b.WriteByte('{')
	for i, v := range s {
		if i > 0 {
			b.WriteByte(',')
		}
		v = strings.ReplaceAll(v, `"`, `\"`)
		b.WriteByte('"')
		b.WriteString(v)
		b.WriteByte('"')
	}
	b.WriteByte('}')
	return b.String()
}
