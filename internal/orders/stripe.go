// Package orders — Stripe Checkout integration.
//
// Activated by setting STRIPE_SECRET_KEY in the environment. When the variable
// is unset, the package falls back to the existing mock provider so the system
// keeps working without a Stripe account.
//
// We deliberately avoid a third-party SDK dependency: the surface used here
// (Checkout Sessions create + Webhook signature verification) is small enough
// that calling the HTTP API directly is more transparent and keeps `go.mod`
// lean.
package orders

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

const stripeSessionsEndpoint = "https://api.stripe.com/v1/checkout/sessions"

type stripeCheckoutResult struct {
	SessionID    string `json:"id"`
	URL          string `json:"url"`
	ClientSecret string `json:"client_secret,omitempty"`
}

// stripeEnabled reports whether the Stripe integration is configured.
func stripeEnabled() bool { return os.Getenv("STRIPE_SECRET_KEY") != "" }

// createStripeCheckoutSession creates a Stripe Checkout Session for the given
// order and amount. Returns (sessionID, redirectURL, error). The caller stores
// the session id in the payments table so the webhook can resolve back to the
// order.
func createStripeCheckoutSession(ctx context.Context, orderID string, amountUSD float64) (*stripeCheckoutResult, error) {
	key := os.Getenv("STRIPE_SECRET_KEY")
	if key == "" {
		return nil, errors.New("STRIPE_SECRET_KEY not configured")
	}
	successURL := envOr("STRIPE_SUCCESS_URL", "http://localhost:5173/account?paid=1")
	cancelURL := envOr("STRIPE_CANCEL_URL", "http://localhost:5173/cart")

	// Stripe takes amounts in the smallest currency unit (cents for USD).
	amountCents := int64(amountUSD * 100)
	if amountCents <= 0 {
		return nil, errors.New("invalid amount")
	}

	form := url.Values{}
	form.Set("mode", "payment")
	form.Set("success_url", successURL+"&session_id={CHECKOUT_SESSION_ID}")
	form.Set("cancel_url", cancelURL)
	form.Set("client_reference_id", orderID)
	form.Set("metadata[order_id]", orderID)
	form.Set("line_items[0][quantity]", "1")
	form.Set("line_items[0][price_data][currency]", "usd")
	form.Set("line_items[0][price_data][unit_amount]", strconv.FormatInt(amountCents, 10))
	form.Set("line_items[0][price_data][product_data][name]", fmt.Sprintf("FinalStore order %s", orderID[:8]))

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, stripeSessionsEndpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("stripe request: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("stripe %d: %s", resp.StatusCode, string(body))
	}
	var result stripeCheckoutResult
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("stripe decode: %w", err)
	}
	return &result, nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// verifyStripeSignature validates the `Stripe-Signature` header against the
// raw payload using STRIPE_WEBHOOK_SECRET. Implements the same v1 scheme as
// stripe-go: timestamp.payload signed with HMAC-SHA256.
func verifyStripeSignature(payload []byte, header, secret string) error {
	if secret == "" {
		return errors.New("STRIPE_WEBHOOK_SECRET not set")
	}
	parts := strings.Split(header, ",")
	var ts, sig string
	for _, p := range parts {
		kv := strings.SplitN(p, "=", 2)
		if len(kv) != 2 {
			continue
		}
		switch kv[0] {
		case "t":
			ts = kv[1]
		case "v1":
			sig = kv[1]
		}
	}
	if ts == "" || sig == "" {
		return errors.New("invalid Stripe-Signature header")
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(ts + "." + string(payload)))
	expected := hex.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(expected), []byte(sig)) {
		return errors.New("signature mismatch")
	}
	return nil
}
