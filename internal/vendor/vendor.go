// Package vendor exposes the merchant ("vendor") read endpoints used by the
// vendor dashboard UI (Phase K). All endpoints are scoped to the authenticated
// user's products via products.user_id.
package vendor

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v4"
	"github.com/kevintovar01/Store/middleware"
	"github.com/kevintovar01/Store/models"
	"github.com/kevintovar01/Store/server"
)

type Service struct {
	db *sql.DB
	s  server.Server
}

func New(s server.Server) *Service { return &Service{db: s.DB(), s: s} }

func userID(s server.Server, r *http.Request) (string, error) {
	tok, err := middleware.TokenAuth(s, nil, *r)
	if err != nil || tok == nil {
		return "", err
	}
	c, ok := tok.Claims.(*models.AppClaims)
	if !ok || c == nil {
		return "", jwt.ErrSignatureInvalid
	}
	return c.UserId, nil
}

// GET /vendor/products — list products owned by the authenticated user.
func (s *Service) HandleListMyProducts() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, err := userID(s.s, r)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		rows, err := s.db.QueryContext(r.Context(), `
			SELECT p.id, p.name, p.price, p.stock, COALESCE(p.description,''),
			       p.created_at,
			       (SELECT COALESCE(SUM(oi.quantity),0) FROM order_items oi
			          JOIN orders o ON o.id = oi.order_id
			          WHERE oi.product_id = p.id
			            AND o.status IN ('paid','shipped','delivered'))::int AS units_sold,
			       (SELECT COALESCE(SUM(oi.quantity * oi.unit_price),0) FROM order_items oi
			          JOIN orders o ON o.id = oi.order_id
			          WHERE oi.product_id = p.id
			            AND o.status IN ('paid','shipped','delivered'))::float AS revenue
			FROM products p
			WHERE p.user_id = $1
			ORDER BY p.created_at DESC`, uid)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id, name, desc string
			var price, revenue float64
			var stock, sold int
			var created time.Time
			_ = rows.Scan(&id, &name, &price, &stock, &desc, &created, &sold, &revenue)
			out = append(out, map[string]any{
				"id": id, "name": name, "price": price, "stock": stock,
				"description": desc, "created_at": created,
				"units_sold": sold, "revenue": revenue,
			})
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// GET /vendor/orders?status= — list orders containing at least one item owned by
// the authenticated vendor. Returns one row per order with the vendor-specific
// subtotal (sum over only the vendor's items).
func (s *Service) HandleListMyOrders() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, err := userID(s.s, r)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		status := r.URL.Query().Get("status")
		var (
			rows *sql.Rows
			qerr error
		)
		base := `
			SELECT o.id, o.status, o.created_at,
			       SUM(oi.quantity * oi.unit_price)::float AS vendor_subtotal,
			       SUM(oi.quantity)::int AS vendor_units
			FROM orders o
			JOIN order_items oi ON oi.order_id = o.id
			JOIN products p ON p.id = oi.product_id
			WHERE p.user_id = $1`
		if status == "" {
			rows, qerr = s.db.QueryContext(r.Context(),
				base+` GROUP BY o.id, o.status, o.created_at ORDER BY o.created_at DESC LIMIT 100`, uid)
		} else {
			rows, qerr = s.db.QueryContext(r.Context(),
				base+` AND o.status=$2 GROUP BY o.id, o.status, o.created_at ORDER BY o.created_at DESC LIMIT 100`,
				uid, status)
		}
		if qerr != nil {
			http.Error(w, qerr.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id, st string
			var sub float64
			var units int
			var at time.Time
			_ = rows.Scan(&id, &st, &at, &sub, &units)
			out = append(out, map[string]any{
				"order_id": id, "status": st, "created_at": at,
				"vendor_subtotal": sub, "vendor_units": units,
			})
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// GET /vendor/stats — aggregate revenue, units, orders for the vendor.
func (s *Service) HandleStats() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, err := userID(s.s, r)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		var revenue float64
		var units, orders int
		_ = s.db.QueryRowContext(r.Context(), `
			SELECT
			  COALESCE(SUM(oi.quantity * oi.unit_price),0)::float,
			  COALESCE(SUM(oi.quantity),0)::int,
			  COUNT(DISTINCT o.id)::int
			FROM order_items oi
			JOIN orders o ON o.id = oi.order_id
			JOIN products p ON p.id = oi.product_id
			WHERE p.user_id=$1 AND o.status IN ('paid','shipped','delivered')`, uid).
			Scan(&revenue, &units, &orders)

		var products int
		_ = s.db.QueryRowContext(r.Context(),
			`SELECT COUNT(*) FROM products WHERE user_id=$1`, uid).Scan(&products)

		// Daily revenue (last 30 days)
		drows, _ := s.db.QueryContext(r.Context(), `
			SELECT date_trunc('day', o.created_at)::date AS d,
			       COALESCE(SUM(oi.quantity * oi.unit_price),0)::float AS rev
			FROM order_items oi
			JOIN orders o ON o.id = oi.order_id
			JOIN products p ON p.id = oi.product_id
			WHERE p.user_id=$1
			  AND o.created_at >= NOW() - INTERVAL '30 days'
			  AND o.status IN ('paid','shipped','delivered')
			GROUP BY 1 ORDER BY 1`, uid)
		series := []map[string]any{}
		if drows != nil {
			defer drows.Close()
			for drows.Next() {
				var d time.Time
				var rev float64
				_ = drows.Scan(&d, &rev)
				series = append(series, map[string]any{
					"date": d.Format("2006-01-02"), "revenue": rev,
				})
			}
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"revenue":      revenue,
			"units_sold":   units,
			"orders":       orders,
			"products":     products,
			"daily_series": series,
		})
	}
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}
