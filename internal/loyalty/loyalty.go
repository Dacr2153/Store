// Package loyalty implements a points + referral program.
//
// Points are awarded automatically when an order moves to `paid` (1 point per
// dollar of order total) by calling AwardForOrderPaid. Referrals work via a
// per-user code: a new user redeems a code through POST /loyalty/redeem and
// both parties earn bonus points.
//
// Schema (migration 000007):
//
//	loyalty_points  (user_id, balance, updated_at)
//	loyalty_history (id, user_id, delta, reason, ref_id, created_at)
//	referrals       (referrer_id, code, used_by_user_id, rewarded_at)
package loyalty

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v4"
	"github.com/kevintovar01/Store/middleware"
	"github.com/kevintovar01/Store/models"
	"github.com/kevintovar01/Store/server"
)

const (
	signupBonus   = 50  // points granted to new user when redeeming a referral
	referrerBonus = 100 // points granted to the referrer
	maxRedeem     = 1   // referrals are single-use per redeemer
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

// generateCode returns an 8-char URL-safe alphanumeric token for referrals.
func generateCode() (string, error) {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	out := make([]byte, 8)
	for i, b := range buf {
		out[i] = alphabet[int(b)%len(alphabet)]
	}
	return string(out), nil
}

// ensureBalanceRow creates a loyalty_points row if missing. Idempotent.
func (s *Service) ensureBalanceRow(ctx context.Context, uid string) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO loyalty_points (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, uid)
	return err
}

// ensureReferralCode returns the user's referral code, generating one on first use.
func (s *Service) ensureReferralCode(ctx context.Context, uid string) (string, error) {
	var code string
	err := s.db.QueryRowContext(ctx,
		`SELECT code FROM referrals WHERE referrer_id=$1`, uid).Scan(&code)
	if err == nil {
		return code, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", err
	}
	// Generate a new code with up to 5 retries on collision.
	for i := 0; i < 5; i++ {
		c, gErr := generateCode()
		if gErr != nil {
			return "", gErr
		}
		_, iErr := s.db.ExecContext(ctx,
			`INSERT INTO referrals (referrer_id, code) VALUES ($1,$2)`, uid, c)
		if iErr == nil {
			return c, nil
		}
	}
	return "", errors.New("could not generate unique referral code")
}

// addPoints adjusts the user's balance and writes a history entry. Both happen
// in the same transaction so the history is always consistent with the balance.
func (s *Service) addPoints(ctx context.Context, uid string, delta int, reason, refID string) error {
	if delta == 0 {
		return nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO loyalty_points (user_id, balance) VALUES ($1,$2)
		 ON CONFLICT (user_id) DO UPDATE SET balance = loyalty_points.balance + EXCLUDED.balance, updated_at = NOW()`,
		uid, delta); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO loyalty_history (user_id, delta, reason, ref_id) VALUES ($1,$2,$3,$4)`,
		uid, delta, reason, refID); err != nil {
		return err
	}
	return tx.Commit()
}

// AwardForOrderPaid grants 1 point per whole USD of the order total. Safe to
// call from the orders package after markOrderPaid commits. Idempotent on
// (user_id, ref_id).
func (s *Service) AwardForOrderPaid(ctx context.Context, uid, orderID string, totalUSD float64) error {
	pts := int(totalUSD)
	if pts <= 0 {
		return nil
	}
	// Idempotency guard: check if we already credited this order.
	var exists bool
	if err := s.db.QueryRowContext(ctx,
		`SELECT EXISTS(SELECT 1 FROM loyalty_history WHERE user_id=$1 AND reason='order_paid' AND ref_id=$2)`,
		uid, orderID).Scan(&exists); err != nil {
		return err
	}
	if exists {
		return nil
	}
	return s.addPoints(ctx, uid, pts, "order_paid", orderID)
}

// HandleMe returns balance + referral_code + recent history for the
// authenticated user. Lazily provisions the balance row and the referral code.
func (s *Service) HandleMe() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, err := userID(s.s, r)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if err := s.ensureBalanceRow(r.Context(), uid); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		code, err := s.ensureReferralCode(r.Context(), uid)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		var balance int
		_ = s.db.QueryRowContext(r.Context(),
			`SELECT balance FROM loyalty_points WHERE user_id=$1`, uid).Scan(&balance)

		rows, err := s.db.QueryContext(r.Context(),
			`SELECT id, delta, reason, COALESCE(ref_id,''), created_at
			 FROM loyalty_history WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`, uid)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		type hist struct {
			ID        string `json:"id"`
			Delta     int    `json:"delta"`
			Reason    string `json:"reason"`
			RefID     string `json:"ref_id"`
			CreatedAt string `json:"created_at"`
		}
		history := []hist{}
		for rows.Next() {
			var h hist
			if err := rows.Scan(&h.ID, &h.Delta, &h.Reason, &h.RefID, &h.CreatedAt); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			history = append(history, h)
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"balance":       balance,
			"referral_code": code,
			"history":       history,
		})
	}
}

// HandleRedeem applies a referral code to the authenticated user. The code
// must belong to a different user and the redeemer must not have already used
// any referral code.
func (s *Service) HandleRedeem() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, err := userID(s.s, r)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		var body struct {
			Code string `json:"code"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}
		body.Code = strings.ToUpper(strings.TrimSpace(body.Code))
		if body.Code == "" {
			http.Error(w, "code is required", http.StatusBadRequest)
			return
		}

		var refUsed int
		if err := s.db.QueryRowContext(r.Context(),
			`SELECT COUNT(*) FROM loyalty_history WHERE user_id=$1 AND reason='referral_redeemed'`, uid).Scan(&refUsed); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if refUsed >= maxRedeem {
			http.Error(w, "you have already used a referral code", http.StatusConflict)
			return
		}

		var referrer string
		if err := s.db.QueryRowContext(r.Context(),
			`SELECT referrer_id FROM referrals WHERE code=$1`, body.Code).Scan(&referrer); err != nil {
			http.Error(w, "invalid code", http.StatusNotFound)
			return
		}
		if referrer == uid {
			http.Error(w, "cannot use your own code", http.StatusBadRequest)
			return
		}
		if _, err := s.db.ExecContext(r.Context(),
			`UPDATE referrals SET used_by_user_id=$1, rewarded_at=NOW() WHERE code=$2 AND used_by_user_id IS NULL`,
			uid, body.Code); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if err := s.addPoints(r.Context(), uid, signupBonus, "referral_redeemed", body.Code); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if err := s.addPoints(r.Context(), referrer, referrerBonus, "referral_reward", body.Code); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "points_granted": signupBonus})
	}
}
