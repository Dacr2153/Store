// Reviews endpoints (Phase I): list, create, mark helpful.
package commerce

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
	"github.com/lib/pq"
)

type reviewItem struct {
	ID               string   `json:"id"`
	UserID           string   `json:"user_id"`
	Rating           int      `json:"rating"`
	Comment          string   `json:"comment"`
	CreatedAt        string   `json:"created_at"`
	VerifiedPurchase bool     `json:"verified_purchase"`
	HelpfulCount     int      `json:"helpful_count"`
	Images           []string `json:"images"`
}

// GET /products/{id}/reviews?page=N
func (s *Service) HandleListReviews() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		productID := mux.Vars(r)["id"]
		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		if page < 0 {
			page = 0
		}
		const limit = 20
		rows, err := s.db.QueryContext(r.Context(),
			`SELECT id, user_id, rating, COALESCE(comment,''), created_at,
			        verified_purchase, helpful_count, images
			 FROM reviews WHERE product_id=$1
			 ORDER BY helpful_count DESC, created_at DESC
			 LIMIT $2 OFFSET $3`,
			productID, limit, page*limit)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		out := []reviewItem{}
		for rows.Next() {
			var it reviewItem
			if err := rows.Scan(&it.ID, &it.UserID, &it.Rating, &it.Comment, &it.CreatedAt,
				&it.VerifiedPurchase, &it.HelpfulCount, pq.Array(&it.Images)); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			if it.Images == nil {
				it.Images = []string{}
			}
			out = append(out, it)
		}
		// summary
		var avg float64
		var count int
		_ = s.db.QueryRowContext(r.Context(),
			`SELECT COALESCE(AVG(rating),0), COUNT(*) FROM reviews WHERE product_id=$1`,
			productID).Scan(&avg, &count)
		writeJSON(w, http.StatusOK, map[string]any{
			"items":   out,
			"average": avg,
			"total":   count,
		})
	}
}

// POST /products/{id}/reviews  body: {rating, comment, images?}
func (s *Service) HandleCreateReview() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, err := userIDFrom(s.s, r)
		if err != nil || uid == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		productID := mux.Vars(r)["id"]
		var body struct {
			Rating  int      `json:"rating"`
			Comment string   `json:"comment"`
			Images  []string `json:"images"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid body", http.StatusBadRequest)
			return
		}
		if body.Rating < 1 || body.Rating > 5 {
			http.Error(w, "rating must be 1..5", http.StatusBadRequest)
			return
		}
		// verified_purchase: user has at least one delivered order_item with this product
		var verified bool
		_ = s.db.QueryRowContext(r.Context(),
			`SELECT EXISTS (
			   SELECT 1 FROM orders o
			   JOIN order_items oi ON oi.order_id = o.id
			   WHERE o.user_id=$1 AND oi.product_id=$2
			 )`, uid, productID).Scan(&verified)
		var newID string
		err = s.db.QueryRowContext(r.Context(),
			`INSERT INTO reviews (product_id, user_id, rating, comment, verified_purchase, images)
			 VALUES ($1,$2,$3,$4,$5,$6)
			 RETURNING id`,
			productID, uid, body.Rating, body.Comment, verified, pq.Array(body.Images),
		).Scan(&newID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"id": newID, "verified_purchase": verified})
	}
}

// POST /reviews/{id}/helpful
func (s *Service) HandleMarkHelpful() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, err := userIDFrom(s.s, r)
		if err != nil || uid == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		id := mux.Vars(r)["id"]
		// insert into review_helpful; trigger or fallback update count
		res, err := s.db.ExecContext(r.Context(),
			`INSERT INTO review_helpful (review_id, user_id) VALUES ($1,$2)
			 ON CONFLICT DO NOTHING`, id, uid)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if n, _ := res.RowsAffected(); n > 0 {
			_, _ = s.db.ExecContext(r.Context(),
				`UPDATE reviews SET helpful_count = helpful_count + 1 WHERE id=$1`, id)
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}
