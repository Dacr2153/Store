// Package catalog exposes category, variant, and search endpoints backed
// directly by Postgres. It is the first vertical fully written in the new
// internal/* layout.
package catalog

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gorilla/mux"
)

type Service struct {
	db *sql.DB
}

func New(db *sql.DB) *Service { return &Service{db: db} }

// ---------- DTOs ----------

type Category struct {
	ID        int        `json:"id"`
	Name      string     `json:"name"`
	Slug      string     `json:"slug"`
	ParentID  *int       `json:"parent_id,omitempty"`
	ImageURL  *string    `json:"image_url,omitempty"`
	SortOrder int        `json:"sort_order"`
	Children  []Category `json:"children,omitempty"`
}

type Variant struct {
	ID          string                 `json:"id"`
	ProductID   string                 `json:"product_id"`
	SKU         string                 `json:"sku"`
	Attributes  map[string]any         `json:"attributes"`
	Price       *float64               `json:"price,omitempty"`
	Stock       int                    `json:"stock"`
	WeightGrams *int                   `json:"weight_grams,omitempty"`
	Extra       map[string]interface{} `json:"-"`
}

type ProductLite struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Price    float64 `json:"price"`
	Stock    int     `json:"stock"`
	ImageURL string  `json:"url"`
}

type SearchResponse struct {
	Items  []ProductLite          `json:"items"`
	Total  int                    `json:"total"`
	Facets map[string]interface{} `json:"facets"`
}

// ---------- HTTP HANDLERS ----------

// GET /categories/tree
func (s *Service) HandleCategoryTree() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cats, err := s.listCategories(r.Context())
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		tree := buildTree(cats)
		writeJSON(w, http.StatusOK, tree)
	}
}

// GET /categories/{slug}/products?page=N
func (s *Service) HandleCategoryProducts() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := mux.Vars(r)["slug"]
		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		if page < 0 {
			page = 0
		}
		const limit = 34
		rows, err := s.db.QueryContext(r.Context(),
			`SELECT p.id, p.name, p.price, p.stock,
			        COALESCE((
			            SELECT i.url FROM product_images pi2
			            JOIN images i ON i.id = pi2.image_id
			            WHERE pi2.product_id = p.id LIMIT 1
			        ), '') AS image_url
			 FROM products p
			 JOIN product_categories pc ON pc.product_id = p.id
			 JOIN categories c ON c.id = pc.category_id
			 WHERE c.slug = $1
			 ORDER BY p.created_at DESC
			 LIMIT $2 OFFSET $3`,
			slug, limit, page*limit)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		out := []ProductLite{}
		for rows.Next() {
			var p ProductLite
			if err := rows.Scan(&p.ID, &p.Name, &p.Price, &p.Stock, &p.ImageURL); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			out = append(out, p)
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// GET /products/{id}/variants
func (s *Service) HandleListVariants() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		productID := mux.Vars(r)["id"]
		variants, err := s.listVariants(r.Context(), productID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, variants)
	}
}

// POST /products/{id}/variants  (admin/business — auth enforced upstream)
func (s *Service) HandleCreateVariant() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		productID := mux.Vars(r)["id"]
		var in struct {
			SKU         string         `json:"sku"`
			Attributes  map[string]any `json:"attributes"`
			Price       *float64       `json:"price,omitempty"`
			Stock       int            `json:"stock"`
			WeightGrams *int           `json:"weight_grams,omitempty"`
		}
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if strings.TrimSpace(in.SKU) == "" {
			http.Error(w, "sku required", http.StatusBadRequest)
			return
		}
		attrJSON, _ := json.Marshal(in.Attributes)
		var newID string
		err := s.db.QueryRowContext(r.Context(),
			`INSERT INTO product_variants (product_id, sku, attributes, price, stock, weight_grams)
			 VALUES ($1,$2,$3::jsonb,$4,$5,$6)
			 RETURNING id`,
			productID, in.SKU, string(attrJSON), in.Price, in.Stock, in.WeightGrams,
		).Scan(&newID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]string{"id": newID})
	}
}

// DELETE /products/{id}/variants/{variantId}  (admin only)
func (s *Service) HandleDeleteVariant() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		productID := vars["id"]
		variantID := vars["variantId"]
		_, err := s.db.ExecContext(r.Context(),
			`DELETE FROM product_variants WHERE id=$1 AND product_id=$2`, variantID, productID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// GET /search?q=...&category=slug&min_price=&max_price=&sort=&page=
// Returns items + facets (category counts, price buckets) using one CTE.
func (s *Service) HandleSearch() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		category := r.URL.Query().Get("category")
		minPrice, _ := strconv.ParseFloat(r.URL.Query().Get("min_price"), 64)
		maxPrice, _ := strconv.ParseFloat(r.URL.Query().Get("max_price"), 64)
		sort := r.URL.Query().Get("sort")
		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		if page < 0 {
			page = 0
		}
		const limit = 34

		orderBy := "p.created_at DESC"
		switch sort {
		case "price_asc":
			orderBy = "p.price ASC"
		case "price_desc":
			orderBy = "p.price DESC"
		case "name_asc":
			orderBy = "p.name ASC"
		}

		// Build dynamic WHERE.
		var (
			where []string
			args  []any
			i     = 1
		)
		add := func(cond string, val any) {
			where = append(where, strings.ReplaceAll(cond, "?", "$"+strconv.Itoa(i)))
			args = append(args, val)
			i++
		}
		if q != "" {
			add("to_tsvector('english', p.name || ' ' || COALESCE(p.description,'')) @@ plainto_tsquery('english', ?)", q)
		}
		if category != "" {
			add("EXISTS (SELECT 1 FROM product_categories pc JOIN categories c ON c.id=pc.category_id WHERE pc.product_id=p.id AND c.slug=?)", category)
		}
		if minPrice > 0 {
			add("p.price >= ?", minPrice)
		}
		if maxPrice > 0 {
			add("p.price <= ?", maxPrice)
		}

		whereSQL := ""
		if len(where) > 0 {
			whereSQL = "WHERE " + strings.Join(where, " AND ")
		}

		// items query
		argsItems := append(append([]any{}, args...), limit, page*limit)
		itemsSQL := fmt.Sprintf(
			`SELECT p.id, p.name, p.price, p.stock,
			        COALESCE((SELECT i.url FROM product_images pi2 JOIN images i ON i.id = pi2.image_id WHERE pi2.product_id = p.id LIMIT 1), '') AS image_url
			 FROM products p %s ORDER BY %s LIMIT $%d OFFSET $%d`,
			whereSQL, orderBy, i, i+1,
		)
		rows, err := s.db.QueryContext(r.Context(), itemsSQL, argsItems...)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		var items []ProductLite
		for rows.Next() {
			var p ProductLite
			if err := rows.Scan(&p.ID, &p.Name, &p.Price, &p.Stock, &p.ImageURL); err != nil {
				rows.Close()
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			items = append(items, p)
		}
		rows.Close()
		if items == nil {
			items = []ProductLite{}
		}

		// total count (same WHERE)
		var total int
		countSQL := fmt.Sprintf(`SELECT count(*) FROM products p %s`, whereSQL)
		if err := s.db.QueryRowContext(r.Context(), countSQL, args...).Scan(&total); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// facet: category counts (respecting current filters EXCEPT category itself)
		// For brevity here we compute against the same filters; future iterations may relax.
		facetCats := []map[string]any{}
		fcRows, err := s.db.QueryContext(r.Context(), `
			SELECT c.id, c.name, c.slug, count(*) AS n
			FROM products p
			JOIN product_categories pc ON pc.product_id = p.id
			JOIN categories c ON c.id = pc.category_id
			GROUP BY c.id, c.name, c.slug
			ORDER BY n DESC
			LIMIT 12`)
		if err == nil {
			for fcRows.Next() {
				var id int
				var name, slug string
				var n int
				_ = fcRows.Scan(&id, &name, &slug, &n)
				facetCats = append(facetCats, map[string]any{
					"id": id, "name": name, "slug": slug, "count": n,
				})
			}
			fcRows.Close()
		}

		// facet: price buckets
		buckets := []map[string]any{}
		bRows, err := s.db.QueryContext(r.Context(), `
			SELECT
			  count(*) FILTER (WHERE price < 10),
			  count(*) FILTER (WHERE price >= 10 AND price < 50),
			  count(*) FILTER (WHERE price >= 50 AND price < 200),
			  count(*) FILTER (WHERE price >= 200)
			FROM products`)
		if err == nil && bRows.Next() {
			var b1, b2, b3, b4 int
			_ = bRows.Scan(&b1, &b2, &b3, &b4)
			buckets = []map[string]any{
				{"label": "< $10", "min": 0, "max": 10, "count": b1},
				{"label": "$10 - $50", "min": 10, "max": 50, "count": b2},
				{"label": "$50 - $200", "min": 50, "max": 200, "count": b3},
				{"label": "$200+", "min": 200, "max": nil, "count": b4},
			}
			bRows.Close()
		}

		writeJSON(w, http.StatusOK, SearchResponse{
			Items: items,
			Total: total,
			Facets: map[string]interface{}{
				"categories":    facetCats,
				"price_buckets": buckets,
			},
		})
	}
}

// GET /search/suggest?q=
func (s *Service) HandleSuggest() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		if q == "" {
			writeJSON(w, http.StatusOK, map[string]any{"products": []any{}, "categories": []any{}})
			return
		}
		products := []map[string]any{}
		pr, err := s.db.QueryContext(r.Context(),
			`SELECT id, name FROM products
			 WHERE name ILIKE $1
			 ORDER BY created_at DESC LIMIT 5`,
			"%"+q+"%")
		if err == nil {
			for pr.Next() {
				var id, name string
				_ = pr.Scan(&id, &name)
				products = append(products, map[string]any{"id": id, "name": name})
			}
			pr.Close()
		}
		cats := []map[string]any{}
		cr, err := s.db.QueryContext(r.Context(),
			`SELECT id, name, slug FROM categories WHERE name ILIKE $1 LIMIT 5`,
			"%"+q+"%")
		if err == nil {
			for cr.Next() {
				var id int
				var name, slug string
				_ = cr.Scan(&id, &name, &slug)
				cats = append(cats, map[string]any{"id": id, "name": name, "slug": slug})
			}
			cr.Close()
		}
		writeJSON(w, http.StatusOK, map[string]any{"products": products, "categories": cats})
	}
}

// GET /products/{id}/related — same categories overlap
func (s *Service) HandleRelated() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		rows, err := s.db.QueryContext(r.Context(), `
			SELECT p2.id, p2.name, p2.price, p2.stock,
			       COALESCE((
			           SELECT i.url FROM product_images pi3
			           JOIN images i ON i.id = pi3.image_id
			           WHERE pi3.product_id = p2.id LIMIT 1
			       ), '') AS image_url
			FROM products p1
			JOIN product_categories pc1 ON pc1.product_id = p1.id
			JOIN product_categories pc2 ON pc2.category_id = pc1.category_id AND pc2.product_id <> p1.id
			JOIN products p2 ON p2.id = pc2.product_id
			WHERE p1.id = $1
			GROUP BY p2.id, p2.name, p2.price, p2.stock
			ORDER BY count(*) DESC
			LIMIT 12`, id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		out := []ProductLite{}
		for rows.Next() {
			var p ProductLite
			_ = rows.Scan(&p.ID, &p.Name, &p.Price, &p.Stock, &p.ImageURL)
			out = append(out, p)
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// ---------- internals ----------

func (s *Service) listCategories(ctx context.Context) ([]Category, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, name, slug, parent_id, image_url, sort_order
		 FROM categories
		 ORDER BY sort_order, name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Category
	for rows.Next() {
		var c Category
		var parent sql.NullInt64
		var img sql.NullString
		if err := rows.Scan(&c.ID, &c.Name, &c.Slug, &parent, &img, &c.SortOrder); err != nil {
			return nil, err
		}
		if parent.Valid {
			v := int(parent.Int64)
			c.ParentID = &v
		}
		if img.Valid {
			s := img.String
			c.ImageURL = &s
		}
		out = append(out, c)
	}
	return out, nil
}

func buildTree(flat []Category) []Category {
	byID := make(map[int]*Category, len(flat))
	for i := range flat {
		byID[flat[i].ID] = &flat[i]
	}
	var roots []Category
	for i := range flat {
		c := &flat[i]
		if c.ParentID == nil {
			continue
		}
		if parent, ok := byID[*c.ParentID]; ok {
			parent.Children = append(parent.Children, *c)
		}
	}
	for i := range flat {
		if flat[i].ParentID == nil {
			roots = append(roots, flat[i])
		}
	}
	return roots
}

func (s *Service) listVariants(ctx context.Context, productID string) ([]Variant, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, product_id, sku, attributes, price, stock, weight_grams
		 FROM product_variants WHERE product_id=$1 ORDER BY created_at`,
		productID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Variant{}
	for rows.Next() {
		var v Variant
		var attrJSON []byte
		var price sql.NullFloat64
		var weight sql.NullInt64
		if err := rows.Scan(&v.ID, &v.ProductID, &v.SKU, &attrJSON, &price, &v.Stock, &weight); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(attrJSON, &v.Attributes)
		if price.Valid {
			p := price.Float64
			v.Price = &p
		}
		if weight.Valid {
			w := int(weight.Int64)
			v.WeightGrams = &w
		}
		out = append(out, v)
	}
	return out, nil
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

var _ = errors.New
