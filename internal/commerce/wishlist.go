// Package commerce hosts wishlist and cart helpers built on the new
// internal/* layout. Cart endpoints will be added incrementally.
package commerce

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/golang-jwt/jwt/v4"
	"github.com/gorilla/mux"
	"github.com/kevintovar01/Store/middleware"
	"github.com/kevintovar01/Store/models"
	"github.com/kevintovar01/Store/server"
)

type Service struct {
	db *sql.DB
	s  server.Server
}

func New(s server.Server) *Service { return &Service{db: s.DB(), s: s} }

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

// GET /wishlist
func (s *Service) HandleList() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, err := userIDFrom(s.s, r)
		if err != nil || uid == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		rows, err := s.db.QueryContext(r.Context(),
			`SELECT w.product_id, p.name, p.price, p.stock, w.added_at
			 FROM wishlists w
			 JOIN products p ON p.id = w.product_id
			 WHERE w.user_id=$1
			 ORDER BY w.added_at DESC`, uid)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		type item struct {
			ProductID string  `json:"product_id"`
			Name      string  `json:"name"`
			Price     float64 `json:"price"`
			Stock     int     `json:"stock"`
			AddedAt   string  `json:"added_at"`
		}
		out := []item{}
		for rows.Next() {
			var it item
			_ = rows.Scan(&it.ProductID, &it.Name, &it.Price, &it.Stock, &it.AddedAt)
			out = append(out, it)
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// POST /wishlist  body {product_id}
func (s *Service) HandleAdd() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, err := userIDFrom(s.s, r)
		if err != nil || uid == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		var body struct {
			ProductID string `json:"product_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.ProductID == "" {
			http.Error(w, "product_id required", http.StatusBadRequest)
			return
		}
		_, err = s.db.ExecContext(r.Context(),
			`INSERT INTO wishlists (user_id, product_id) VALUES ($1,$2)
			 ON CONFLICT DO NOTHING`, uid, body.ProductID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]string{"status": "added"})
	}
}

// DELETE /wishlist/{product_id}
func (s *Service) HandleRemove() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, err := userIDFrom(s.s, r)
		if err != nil || uid == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		pid := mux.Vars(r)["product_id"]
		_, err = s.db.ExecContext(r.Context(),
			`DELETE FROM wishlists WHERE user_id=$1 AND product_id=$2`, uid, pid)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}
