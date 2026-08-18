// Package returns implements the customer-facing RMA (return merchandise
// authorization) endpoints. Returns are stored in the `returns` table created
// by migration 000002. The flow is:
//
//	POST /returns          — customer requests a return for a delivered order.
//	GET  /returns          — customer lists their own RMAs.
//	POST /admin/returns/{id}/approve — admin approves and refunds.
//	POST /admin/returns/{id}/reject  — admin rejects.
//
// We rely on the same TokenAuth helper used by sibling packages so that role
// gating happens through the existing RoleProxy middleware.
package returns

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"

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

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

type returnRow struct {
	ID           string  `json:"id"`
	OrderID      string  `json:"order_id"`
	UserID       string  `json:"user_id"`
	Reason       string  `json:"reason"`
	Status       string  `json:"status"`
	RefundAmount float64 `json:"refund_amount"`
	CreatedAt    string  `json:"created_at"`
}

// GET /returns — list returns owned by the authenticated user.
func (s *Service) HandleListMine() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, err := userID(s.s, r)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		rows, err := s.db.QueryContext(r.Context(),
			`SELECT id, order_id, user_id, reason, status, COALESCE(refund_amount,0), created_at
			 FROM returns WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200`, uid)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		out := []returnRow{}
		for rows.Next() {
			var x returnRow
			if err := rows.Scan(&x.ID, &x.OrderID, &x.UserID, &x.Reason, &x.Status, &x.RefundAmount, &x.CreatedAt); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			out = append(out, x)
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// POST /returns body: {order_id, reason}
// Validates that the order belongs to the user and is in a return-eligible state.
func (s *Service) HandleCreate() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, err := userID(s.s, r)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		var body struct {
			OrderID string `json:"order_id"`
			Reason  string `json:"reason"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}
		body.OrderID = strings.TrimSpace(body.OrderID)
		body.Reason = strings.TrimSpace(body.Reason)
		if body.OrderID == "" || body.Reason == "" {
			http.Error(w, "order_id and reason are required", http.StatusBadRequest)
			return
		}
		// Verify order belongs to user and is in an eligible state.
		var status string
		var total float64
		err = s.db.QueryRowContext(r.Context(),
			`SELECT status, total FROM orders WHERE id=$1 AND user_id=$2`,
			body.OrderID, uid).Scan(&status, &total)
		if err == sql.ErrNoRows {
			http.Error(w, "order not found", http.StatusNotFound)
			return
		}
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		eligible := map[string]bool{"paid": true, "shipped": true, "delivered": true}
		if !eligible[status] {
			http.Error(w, "order is not eligible for return (status="+status+")", http.StatusBadRequest)
			return
		}
		// Reject if there is already an open RMA for the order.
		var openCount int
		_ = s.db.QueryRowContext(r.Context(),
			`SELECT COUNT(*) FROM returns WHERE order_id=$1 AND status IN ('requested','approved')`,
			body.OrderID).Scan(&openCount)
		if openCount > 0 {
			http.Error(w, "an open return already exists for this order", http.StatusConflict)
			return
		}
		var id, createdAt string
		err = s.db.QueryRowContext(r.Context(),
			`INSERT INTO returns (order_id, user_id, reason, refund_amount)
			 VALUES ($1,$2,$3,$4) RETURNING id, created_at`,
			body.OrderID, uid, body.Reason, total).Scan(&id, &createdAt)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusCreated, returnRow{
			ID: id, OrderID: body.OrderID, UserID: uid,
			Reason: body.Reason, Status: "requested", RefundAmount: total, CreatedAt: createdAt,
		})
	}
}

// HandleAdminList returns every RMA in reverse chronological order (admin only).
func (s *Service) HandleAdminList() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := s.db.QueryContext(r.Context(),
			`SELECT id, order_id, user_id, reason, status, COALESCE(refund_amount,0), created_at
			 FROM returns ORDER BY created_at DESC LIMIT 500`)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		out := []returnRow{}
		for rows.Next() {
			var x returnRow
			if err := rows.Scan(&x.ID, &x.OrderID, &x.UserID, &x.Reason, &x.Status, &x.RefundAmount, &x.CreatedAt); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			out = append(out, x)
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// HandleAdminTransition implements approve/reject. The destination status comes
// from the URL: /admin/returns/{id}/{action}. Approving an RMA also transitions
// the parent order to `refunded`.
func (s *Service) HandleAdminTransition() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := mux.Vars(r)["id"]
		action := mux.Vars(r)["action"]
		next := ""
		switch action {
		case "approve":
			next = "approved"
		case "reject":
			next = "rejected"
		case "complete":
			next = "completed"
		default:
			http.Error(w, "invalid action", http.StatusBadRequest)
			return
		}
		tx, err := s.db.BeginTx(r.Context(), nil)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer tx.Rollback() //nolint:errcheck

		var orderID, current string
		if err := tx.QueryRowContext(r.Context(),
			`SELECT order_id, status FROM returns WHERE id=$1`, id).Scan(&orderID, &current); err != nil {
			http.Error(w, "return not found", http.StatusNotFound)
			return
		}
		if current != "requested" && next != "completed" {
			http.Error(w, "return is not in requested state", http.StatusBadRequest)
			return
		}
		if _, err := tx.ExecContext(r.Context(),
			`UPDATE returns SET status=$1 WHERE id=$2`, next, id); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if next == "approved" {
			// Best-effort order refund; do not fail the RMA transition if the order is in a
			// state where we can't transition (it stays approved and admins can mark it refunded
			// manually via /orders/{id}/transition).
			_, _ = tx.ExecContext(r.Context(),
				`UPDATE orders SET status='refunded', updated_at=NOW() WHERE id=$1 AND status IN ('paid','shipped','delivered','returned')`,
				orderID)
		}
		if err := tx.Commit(); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "id": id, "status": next})
	}
}
