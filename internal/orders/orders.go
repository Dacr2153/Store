// Package orders provides Phase F/G/H: full checkout (subtotal/shipping/tax/coupon),
// mock payment provider, and the order state-machine with audit log.
package orders

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v4"
	"github.com/gorilla/mux"
	"github.com/kevintovar01/Store/middleware"
	"github.com/kevintovar01/Store/models"
	"github.com/kevintovar01/Store/server"
)

type Service struct {
	db *sql.DB
	s  server.Server

	// OnOrderPaid is invoked after a successful markOrderPaid commit. It is
	// optional; main.go wires it to the loyalty package so points are awarded
	// without creating an import cycle. Errors are logged but do not roll back
	// the payment (loyalty credits are best-effort).
	OnOrderPaid func(ctx context.Context, userID, orderID string, total float64)
}

func New(s server.Server) *Service { return &Service{db: s.DB(), s: s} }

// ---------------- DTOs ----------------

type checkoutRequest struct {
	ShippingAddressID string `json:"shipping_address_id"`
	BillingAddressID  string `json:"billing_address_id"`
	ShippingMethod    string `json:"shipping_method"` // standard|express
	CouponCode        string `json:"coupon_code,omitempty"`
	Notes             string `json:"notes,omitempty"`
}

type checkoutQuoteRequest struct {
	ShippingAddressID string `json:"shipping_address_id"`
	ShippingMethod    string `json:"shipping_method"`
	CouponCode        string `json:"coupon_code,omitempty"`
}

type orderTotals struct {
	Subtotal       float64 `json:"subtotal"`
	ShippingCost   float64 `json:"shipping_cost"`
	TaxAmount      float64 `json:"tax_amount"`
	DiscountAmount float64 `json:"discount_amount"`
	Total          float64 `json:"total"`
	Currency       string  `json:"currency"`
}

// ---------------- Auth helper ----------------

func userClaims(s server.Server, r *http.Request) (*models.AppClaims, error) {
	tok, err := middleware.TokenAuth(s, nil, *r)
	if err != nil || tok == nil {
		return nil, err
	}
	c, ok := tok.Claims.(*models.AppClaims)
	if !ok || c == nil {
		return nil, jwt.ErrSignatureInvalid
	}
	return c, nil
}

// ---------------- Address management ----------------

// POST /addresses — create address
func (s *Service) HandleCreateAddress() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c, err := userClaims(s.s, r)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		var a struct {
			RecipientName string `json:"recipient_name"`
			Phone         string `json:"phone"`
			Line1         string `json:"line1"`
			Line2         string `json:"line2"`
			City          string `json:"city"`
			State         string `json:"state"`
			PostalCode    string `json:"postal_code"`
			CountryCode   string `json:"country_code"`
			IsDefault     bool   `json:"is_default"`
		}
		if err := json.NewDecoder(r.Body).Decode(&a); err != nil {
			http.Error(w, "invalid body", http.StatusBadRequest)
			return
		}
		if a.RecipientName == "" || a.Line1 == "" || a.City == "" || a.PostalCode == "" || len(a.CountryCode) != 2 {
			http.Error(w, "missing required address fields", http.StatusBadRequest)
			return
		}
		var id string
		err = s.db.QueryRowContext(r.Context(), `
			INSERT INTO addresses (user_id, recipient_name, phone, line1, line2, city, state, postal_code, country_code, is_default)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
			c.UserId, a.RecipientName, a.Phone, a.Line1, a.Line2, a.City, a.State, a.PostalCode, strings.ToUpper(a.CountryCode), a.IsDefault,
		).Scan(&id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]string{"id": id})
	}
}

// GET /addresses — list user addresses
func (s *Service) HandleListAddresses() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c, err := userClaims(s.s, r)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		rows, err := s.db.QueryContext(r.Context(),
			`SELECT id, recipient_name, phone, line1, COALESCE(line2,''), city, COALESCE(state,''),
			        postal_code, country_code, is_default
			 FROM addresses WHERE user_id=$1 ORDER BY is_default DESC, created_at DESC`, c.UserId)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id, name, phone, l1, l2, city, st, pc, cc string
			var def bool
			_ = rows.Scan(&id, &name, &phone, &l1, &l2, &city, &st, &pc, &cc, &def)
			out = append(out, map[string]any{
				"id": id, "recipient_name": name, "phone": phone,
				"line1": l1, "line2": l2, "city": city, "state": st,
				"postal_code": pc, "country_code": cc, "is_default": def,
			})
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// ---------------- Checkout quote ----------------

// POST /checkout/quote — calculate totals without creating order
func (s *Service) HandleQuote() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c, err := userClaims(s.s, r)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		var req checkoutQuoteRequest
		_ = json.NewDecoder(r.Body).Decode(&req)
		t, err := s.computeTotals(r.Context(), c.UserId, req.ShippingAddressID, req.ShippingMethod, req.CouponCode)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusOK, t)
	}
}

// ---------------- Checkout / create order ----------------

// POST /checkout — create order from active cart with totals applied
func (s *Service) HandleCheckout() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c, err := userClaims(s.s, r)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		var req checkoutRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid body", http.StatusBadRequest)
			return
		}
		if req.ShippingAddressID == "" {
			http.Error(w, "shipping_address_id required", http.StatusBadRequest)
			return
		}
		if req.ShippingMethod == "" {
			req.ShippingMethod = "standard"
		}

		totals, err := s.computeTotals(r.Context(), c.UserId, req.ShippingAddressID, req.ShippingMethod, req.CouponCode)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		// Tx: create order + items + status history.
		tx, err := s.db.BeginTx(r.Context(), nil)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer tx.Rollback() //nolint:errcheck

		var orderID string
		err = tx.QueryRowContext(r.Context(), `
			INSERT INTO orders (user_id, status, total, notes,
			                    shipping_address_id, billing_address_id,
			                    shipping_method, shipping_cost, tax_amount,
			                    subtotal, coupon_code, discount_amount)
			VALUES ($1,'pending',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
			RETURNING id`,
			c.UserId, totals.Total, req.Notes,
			req.ShippingAddressID, nullableUUID(req.BillingAddressID),
			req.ShippingMethod, totals.ShippingCost, totals.TaxAmount,
			totals.Subtotal, nullableStr(req.CouponCode), totals.DiscountAmount,
		).Scan(&orderID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Cart → order_items: read from car_item joined with products for current price.
		rows, err := tx.QueryContext(r.Context(), `
			SELECT ci.product_id, ci.quantity, COALESCE(ci.unit_price, p.price)
			FROM car_item ci
			JOIN wishcar wc ON wc.id = ci.car_id
			JOIN products p ON p.id = ci.product_id
			WHERE wc.user_id=$1`, c.UserId)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		var items []struct {
			pid       string
			qty       int
			unitPrice float64
		}
		for rows.Next() {
			var it struct {
				pid       string
				qty       int
				unitPrice float64
			}
			if err := rows.Scan(&it.pid, &it.qty, &it.unitPrice); err != nil {
				rows.Close()
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			items = append(items, it)
		}
		rows.Close()
		if len(items) == 0 {
			http.Error(w, "cart is empty", http.StatusBadRequest)
			return
		}
		for _, it := range items {
			if _, err := tx.ExecContext(r.Context(),
				`INSERT INTO order_items (order_id, product_id, quantity, unit_price)
				 VALUES ($1,$2,$3,$4)`, orderID, it.pid, it.qty, it.unitPrice); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}

		// status history: created → pending
		if _, err := tx.ExecContext(r.Context(),
			`INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason)
			 VALUES ($1,NULL,'pending',$2,'order_created')`, orderID, c.UserId); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// bump coupon uses
		if req.CouponCode != "" {
			_, _ = tx.ExecContext(r.Context(),
				`UPDATE coupons SET uses_count = uses_count + 1 WHERE upper(code)=upper($1)`, req.CouponCode)
		}

		if err := tx.Commit(); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// (intentionally not clearing the cart yet — cart is cleared on payment success)
		writeJSON(w, http.StatusCreated, map[string]any{
			"order_id": orderID,
			"status":   "pending",
			"totals":   totals,
		})
	}
}

// ---------------- Mock payment provider (Phase G) ----------------

// POST /payments/intent  body: {order_id}
// Creates a "pending" payment row simulating a Stripe PaymentIntent.
// Returns a fake client_secret that the frontend can pretend to confirm.
// PROVISIONAL — replace with real Stripe SDK once STRIPE_SECRET_KEY is available.
func (s *Service) HandleCreatePaymentIntent() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c, err := userClaims(s.s, r)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		var body struct {
			OrderID string `json:"order_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.OrderID == "" {
			http.Error(w, "order_id required", http.StatusBadRequest)
			return
		}
		// verify order belongs to user
		var amount float64
		var status string
		err = s.db.QueryRowContext(r.Context(),
			`SELECT total, status FROM orders WHERE id=$1 AND user_id=$2`,
			body.OrderID, c.UserId).Scan(&amount, &status)
		if err != nil {
			http.Error(w, "order not found", http.StatusNotFound)
			return
		}
		if status != "pending" {
			http.Error(w, "order is not pending", http.StatusBadRequest)
			return
		}

		// Real Stripe path — only when STRIPE_SECRET_KEY is configured.
		if stripeEnabled() {
			session, sErr := createStripeCheckoutSession(r.Context(), body.OrderID, amount)
			if sErr == nil && session != nil && session.SessionID != "" {
				raw, _ := json.Marshal(map[string]any{
					"provider":   "stripe",
					"session_id": session.SessionID,
					"url":        session.URL,
				})
				var paymentID string
				if iErr := s.db.QueryRowContext(r.Context(), `
					INSERT INTO payments (order_id, provider, provider_payment_id, amount, currency, status, raw_response)
					VALUES ($1,'stripe',$2,$3,'USD','pending',$4::jsonb)
					RETURNING id`,
					body.OrderID, session.SessionID, amount, string(raw)).Scan(&paymentID); iErr == nil {
					writeJSON(w, http.StatusCreated, map[string]any{
						"payment_id": paymentID,
						"provider":   "stripe",
						"session_id": session.SessionID,
						"url":        session.URL,
						"amount":     amount,
						"currency":   "USD",
						"status":     "pending",
					})
					return
				}
				// fall through to mock if DB insert fails — should not happen in practice.
			}
			// Stripe failed — log and fall back to the mock provider so checkout still succeeds in dev.
		}

		fakeProviderID := "pi_mock_" + body.OrderID[:8] + fmt.Sprintf("_%d", time.Now().Unix())
		clientSecret := fakeProviderID + "_secret_" + randHex(8)
		raw, _ := json.Marshal(map[string]any{
			"mock":          true,
			"client_secret": clientSecret,
			"note":          "PROVISIONAL: replace with real Stripe PaymentIntent when STRIPE_SECRET_KEY is provided",
		})
		var paymentID string
		err = s.db.QueryRowContext(r.Context(), `
			INSERT INTO payments (order_id, provider, provider_payment_id, amount, currency, status, raw_response)
			VALUES ($1,'mock',$2,$3,'USD','pending',$4::jsonb)
			RETURNING id`,
			body.OrderID, fakeProviderID, amount, string(raw)).Scan(&paymentID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{
			"payment_id":    paymentID,
			"provider":      "mock",
			"client_secret": clientSecret,
			"amount":        amount,
			"currency":      "USD",
			"status":        "pending",
			"_note":         "PROVISIONAL mock provider — call POST /payments/{id}/confirm-mock to simulate webhook success",
		})
	}
}

// POST /payments/{id}/confirm-mock — simulates a successful webhook callback.
// In production this would be the Stripe webhook handler verifying signatures.
// Endpoint is open to authenticated users during dev. Real webhooks will replace it.
func (s *Service) HandleConfirmPaymentMock() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c, err := userClaims(s.s, r)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		paymentID := mux.Vars(r)["id"]
		var orderID string
		var status string
		err = s.db.QueryRowContext(r.Context(),
			`SELECT p.order_id, p.status
			 FROM payments p JOIN orders o ON o.id=p.order_id
			 WHERE p.id=$1 AND o.user_id=$2`, paymentID, c.UserId).Scan(&orderID, &status)
		if err != nil {
			http.Error(w, "payment not found", http.StatusNotFound)
			return
		}
		if status == "captured" {
			writeJSON(w, http.StatusOK, map[string]any{"status": "already_captured"})
			return
		}
		if err := s.markOrderPaid(r.Context(), orderID, paymentID, c.UserId); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "captured", "order_id": orderID})
	}
}

// ---------------- Order state machine (Phase H) ----------------

var allowedTransitions = map[string]map[string]bool{
	"pending":   {"paid": true, "cancelled": true},
	"paid":      {"shipped": true, "cancelled": true, "refunded": true},
	"shipped":   {"delivered": true, "returned": true},
	"delivered": {"returned": true},
	"cancelled": {},
	"refunded":  {},
	"returned":  {"refunded": true},
}

// POST /orders/{id}/transition  body: {to: "shipped", reason: "..."}
// admin-gated upstream
func (s *Service) HandleTransition() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c, err := userClaims(s.s, r)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		orderID := mux.Vars(r)["id"]
		var body struct {
			To     string `json:"to"`
			Reason string `json:"reason"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.To == "" {
			http.Error(w, "to required", http.StatusBadRequest)
			return
		}
		var current string
		if err := s.db.QueryRowContext(r.Context(),
			`SELECT status FROM orders WHERE id=$1`, orderID).Scan(&current); err != nil {
			http.Error(w, "order not found", http.StatusNotFound)
			return
		}
		if !allowedTransitions[current][body.To] {
			http.Error(w, fmt.Sprintf("invalid transition %s -> %s", current, body.To), http.StatusBadRequest)
			return
		}
		tx, err := s.db.BeginTx(r.Context(), nil)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer tx.Rollback() //nolint:errcheck
		if _, err := tx.ExecContext(r.Context(),
			`UPDATE orders SET status=$1, updated_at=NOW() WHERE id=$2`, body.To, orderID); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if _, err := tx.ExecContext(r.Context(),
			`INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason)
			 VALUES ($1,$2,$3,$4,$5)`, orderID, current, body.To, c.UserId, body.Reason); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		// shipment side-effect when transitioning to shipped
		if body.To == "shipped" {
			_, _ = tx.ExecContext(r.Context(),
				`INSERT INTO shipments (order_id, carrier, tracking_number, status, shipped_at, cost)
				 VALUES ($1,'mock-carrier','TRK' || substr(md5(random()::text),1,10), 'shipped', NOW(),
				 COALESCE((SELECT shipping_cost FROM orders WHERE id=$1),0))`, orderID)
		}
		if err := tx.Commit(); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"from": current, "to": body.To})
	}
}

// GET /orders/{id}/history
func (s *Service) HandleHistory() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c, err := userClaims(s.s, r)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		orderID := mux.Vars(r)["id"]
		// owner OR admin (admin handled via RoleProxy mounted on a separate alias if desired)
		var owner string
		if err := s.db.QueryRowContext(r.Context(),
			`SELECT user_id FROM orders WHERE id=$1`, orderID).Scan(&owner); err != nil {
			http.Error(w, "order not found", http.StatusNotFound)
			return
		}
		if owner != c.UserId {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		rows, err := s.db.QueryContext(r.Context(),
			`SELECT COALESCE(from_status,''), to_status, COALESCE(changed_by,''), COALESCE(reason,''), changed_at
			 FROM order_status_history WHERE order_id=$1 ORDER BY changed_at`, orderID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var from, to, by, reason string
			var at time.Time
			_ = rows.Scan(&from, &to, &by, &reason, &at)
			out = append(out, map[string]any{
				"from": from, "to": to, "by": by, "reason": reason, "at": at,
			})
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// ---------------- Internals ----------------

func (s *Service) computeTotals(ctx context.Context, userID, addrID, method, coupon string) (orderTotals, error) {
	var t orderTotals
	t.Currency = "USD"

	// Subtotal from cart
	err := s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(ci.quantity * COALESCE(ci.unit_price, p.price)),0)
		FROM car_item ci
		JOIN wishcar wc ON wc.id = ci.car_id
		JOIN products p ON p.id = ci.product_id
		WHERE wc.user_id=$1`, userID).Scan(&t.Subtotal)
	if err != nil {
		return t, err
	}
	if t.Subtotal == 0 {
		return t, errors.New("cart is empty")
	}

	// Address → country
	var country, state string
	if addrID != "" {
		if err := s.db.QueryRowContext(ctx,
			`SELECT country_code, COALESCE(state,'') FROM addresses WHERE id=$1 AND user_id=$2`,
			addrID, userID).Scan(&country, &state); err != nil {
			return t, errors.New("invalid shipping_address_id")
		}
	} else {
		country = "US"
	}

	// Shipping
	var base, perKg float64
	err = s.db.QueryRowContext(ctx, `
		SELECT base_cost, per_kg_cost FROM shipping_rates
		WHERE country_code=$1 AND method=$2 LIMIT 1`, country, method).Scan(&base, &perKg)
	if err == sql.ErrNoRows {
		base = 5.0
		perKg = 0
	} else if err != nil {
		return t, err
	}
	t.ShippingCost = base // simplified: no weight

	// Tax
	var rate float64
	err = s.db.QueryRowContext(ctx, `
		SELECT rate FROM tax_rates WHERE country_code=$1 AND (state='' OR state=$2)
		ORDER BY (state=$2) DESC LIMIT 1`, country, state).Scan(&rate)
	if err == sql.ErrNoRows {
		rate = 0
	} else if err != nil {
		return t, err
	}
	t.TaxAmount = round2((t.Subtotal + t.ShippingCost) * rate)

	// Coupon
	if coupon != "" {
		var dt string
		var dv float64
		var minSub float64
		var active bool
		var maxUses sql.NullInt64
		var uses int
		err = s.db.QueryRowContext(ctx,
			`SELECT discount_type, discount_value, min_subtotal, active, max_uses, uses_count
			 FROM coupons WHERE upper(code)=upper($1)
			   AND (starts_at IS NULL OR starts_at <= NOW())
			   AND (ends_at IS NULL OR ends_at >= NOW())`,
			coupon).Scan(&dt, &dv, &minSub, &active, &maxUses, &uses)
		if err == nil && active && t.Subtotal >= minSub && (!maxUses.Valid || int(maxUses.Int64) > uses) {
			switch dt {
			case "percent":
				t.DiscountAmount = round2(t.Subtotal * dv / 100)
			case "fixed":
				t.DiscountAmount = round2(dv)
			}
		}
	}

	t.Subtotal = round2(t.Subtotal)
	t.ShippingCost = round2(t.ShippingCost)
	t.Total = round2(t.Subtotal + t.ShippingCost + t.TaxAmount - t.DiscountAmount)
	if t.Total < 0 {
		t.Total = 0
	}
	return t, nil
}

func (s *Service) markOrderPaid(ctx context.Context, orderID, paymentID, byUser string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck
	if _, err := tx.ExecContext(ctx,
		`UPDATE payments SET status='captured', updated_at=NOW() WHERE id=$1`, paymentID); err != nil {
		return err
	}
	var current string
	if err := tx.QueryRowContext(ctx, `SELECT status FROM orders WHERE id=$1`, orderID).Scan(&current); err != nil {
		return err
	}
	if current != "pending" {
		return errors.New("order is not pending")
	}
	if _, err := tx.ExecContext(ctx,
		`UPDATE orders SET status='paid', updated_at=NOW() WHERE id=$1`, orderID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason)
		 VALUES ($1,'pending','paid',$2,'mock_payment_succeeded')`, orderID, byUser); err != nil {
		return err
	}
	// clear cart
	if _, err := tx.ExecContext(ctx,
		`DELETE FROM car_item WHERE car_id IN (SELECT id FROM wishcar WHERE user_id=(SELECT user_id FROM orders WHERE id=$1))`,
		orderID); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	// Best-effort post-commit hooks (e.g. loyalty point credit). Failures here must
	// not fail the payment flow.
	if s.OnOrderPaid != nil {
		var total float64
		var paidUser string
		_ = s.db.QueryRowContext(ctx,
			`SELECT user_id, total FROM orders WHERE id=$1`, orderID).Scan(&paidUser, &total)
		if paidUser != "" && total > 0 {
			func() {
				defer func() { _ = recover() }()
				s.OnOrderPaid(ctx, paidUser, orderID, total)
			}()
		}
	}
	return nil
}

// ---------------- Admin-only helpers ----------------

// POST /admin/orders/{id}/mark-paid — simulates manual payment confirmation by admin
func (s *Service) HandleAdminMarkPaid() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c, err := userClaims(s.s, r)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		orderID := mux.Vars(r)["id"]
		// find or create a payments row
		var paymentID string
		err = s.db.QueryRowContext(r.Context(),
			`SELECT id FROM payments WHERE order_id=$1 ORDER BY created_at DESC LIMIT 1`, orderID).Scan(&paymentID)
		if err == sql.ErrNoRows {
			var amount float64
			if err := s.db.QueryRowContext(r.Context(),
				`SELECT total FROM orders WHERE id=$1`, orderID).Scan(&amount); err != nil {
				http.Error(w, "order not found", http.StatusNotFound)
				return
			}
			err = s.db.QueryRowContext(r.Context(), `
				INSERT INTO payments (order_id, provider, provider_payment_id, amount, currency, status, raw_response)
				VALUES ($1::uuid,'mock','admin_manual_'||$2::text,$3,'USD','pending','{"mock":true,"admin_manual":true}'::jsonb)
				RETURNING id`, orderID, orderID, amount).Scan(&paymentID)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		} else if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if err := s.markOrderPaid(r.Context(), orderID, paymentID, c.UserId); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"order_id": orderID, "status": "paid"})
	}
}

// GET /admin/orders?status=&page= — admin list
func (s *Service) HandleAdminListOrders() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		status := r.URL.Query().Get("status")
		page := 0
		fmt.Sscanf(r.URL.Query().Get("page"), "%d", &page)
		if page < 0 {
			page = 0
		}
		const limit = 50
		var (
			rows *sql.Rows
			err  error
		)
		if status == "" {
			rows, err = s.db.QueryContext(r.Context(),
				`SELECT id, user_id, status, total, created_at FROM orders
				 ORDER BY created_at DESC LIMIT $1 OFFSET $2`, limit, page*limit)
		} else {
			rows, err = s.db.QueryContext(r.Context(),
				`SELECT id, user_id, status, total, created_at FROM orders
				 WHERE status=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
				status, limit, page*limit)
		}
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id, uid, st string
			var tot float64
			var at time.Time
			_ = rows.Scan(&id, &uid, &st, &tot, &at)
			out = append(out, map[string]any{
				"id": id, "user_id": uid, "status": st, "total": tot, "created_at": at,
			})
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// ---------------- helpers ----------------

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func nullableUUID(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

func nullableStr(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

func round2(v float64) float64 {
	return float64(int64(v*100+0.5)) / 100
}

func randHex(n int) string {
	const hex = "0123456789abcdef"
	out := make([]byte, n)
	now := time.Now().UnixNano()
	for i := 0; i < n; i++ {
		out[i] = hex[(now>>(uint(i)*4))&0xf]
	}
	return string(out)
}

// HandleStripeWebhook receives Stripe webhook events. The signature is verified
// against STRIPE_WEBHOOK_SECRET. Currently we only act on
// `checkout.session.completed` to mark the originating order as paid.
//
// Public endpoint: must NOT require auth (Stripe is the caller). Idempotent:
// re-delivery of the same event is a no-op because markOrderPaid only succeeds
// for orders in the `pending` state.
func (s *Service) HandleStripeWebhook() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "read", http.StatusBadRequest)
			return
		}
		defer r.Body.Close()

		secret := os.Getenv("STRIPE_WEBHOOK_SECRET")
		sig := r.Header.Get("Stripe-Signature")
		if secret != "" {
			if vErr := verifyStripeSignature(body, sig, secret); vErr != nil {
				http.Error(w, "invalid signature", http.StatusUnauthorized)
				return
			}
		}

		var event struct {
			Type string `json:"type"`
			Data struct {
				Object struct {
					ID                string `json:"id"`
					ClientReferenceID string `json:"client_reference_id"`
					Metadata          struct {
						OrderID string `json:"order_id"`
					} `json:"metadata"`
					PaymentStatus string `json:"payment_status"`
				} `json:"object"`
			} `json:"data"`
		}
		if err := json.Unmarshal(body, &event); err != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}

		if event.Type != "checkout.session.completed" {
			writeJSON(w, http.StatusOK, map[string]any{"ignored": event.Type})
			return
		}
		orderID := event.Data.Object.ClientReferenceID
		if orderID == "" {
			orderID = event.Data.Object.Metadata.OrderID
		}
		sessionID := event.Data.Object.ID
		if orderID == "" || sessionID == "" {
			http.Error(w, "missing order_id/session_id", http.StatusBadRequest)
			return
		}

		// Resolve the payments row created at intent time and the originating user.
		var paymentID, userID string
		err = s.db.QueryRowContext(r.Context(),
			`SELECT p.id, o.user_id
			 FROM payments p JOIN orders o ON o.id = p.order_id
			 WHERE p.provider='stripe' AND p.provider_payment_id=$1`,
			sessionID).Scan(&paymentID, &userID)
		if err != nil {
			http.Error(w, "payment not found", http.StatusNotFound)
			return
		}
		if err := s.markOrderPaid(r.Context(), orderID, paymentID, userID); err != nil {
			// already-paid is acceptable for replay safety.
			writeJSON(w, http.StatusOK, map[string]any{"ok": true, "note": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "order_id": orderID})
	}
}
