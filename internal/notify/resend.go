// Package notify — Resend HTTP API sender.
//
// Activated by setting RESEND_API_KEY in the environment. When the key is not
// present, callers fall back to the legacy LogSender / SmtpMockSender path so
// the application continues to behave correctly without a third-party account.
package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"time"
)

const resendEndpoint = "https://api.resend.com/emails"

// ResendSender posts transactional emails to the Resend HTTP API.
type ResendSender struct {
	APIKey string
	From   string // e.g. "FinalStore <noreply@yourdomain.com>"
	HTTP   *http.Client
}

// NewResendSenderFromEnv constructs a ResendSender from RESEND_API_KEY and
// RESEND_FROM. Returns nil when no API key is configured.
func NewResendSenderFromEnv() *ResendSender {
	key := os.Getenv("RESEND_API_KEY")
	if key == "" {
		return nil
	}
	from := os.Getenv("RESEND_FROM")
	if from == "" {
		from = "FinalStore <onboarding@resend.dev>"
	}
	return &ResendSender{
		APIKey: key,
		From:   from,
		HTTP:   &http.Client{Timeout: 15 * time.Second},
	}
}

// renderTemplate builds a minimal subject/HTML body from the template name and
// data map. We deliberately keep this self-contained so the project does not
// require a heavy template engine. Replace with html/template when you need
// richer designs.
func renderTemplate(template string, data map[string]any) (subject, html string) {
	subject = fmt.Sprintf("FinalStore — %s", template)
	if v, ok := data["subject"].(string); ok && v != "" {
		subject = v
	}
	body, _ := json.MarshalIndent(data, "", "  ")
	html = fmt.Sprintf(
		"<div style=\"font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto;padding:24px\">"+
			"<h2 style=\"color:#4f46e5\">%s</h2>"+
			"<pre style=\"background:#f9fafb;padding:12px;border-radius:8px;font-size:12px;color:#374151;white-space:pre-wrap\">%s</pre>"+
			"<p style=\"color:#6b7280;font-size:12px\">FinalStore notification</p>"+
			"</div>",
		template, string(body),
	)
	return subject, html
}

// Send implements Sender.
func (s *ResendSender) Send(ctx context.Context, to, template string, data map[string]any) error {
	if s == nil || s.APIKey == "" {
		return errors.New("resend sender not configured")
	}
	subject, html := renderTemplate(template, data)
	body, err := json.Marshal(map[string]any{
		"from":    s.From,
		"to":      []string{to},
		"subject": subject,
		"html":    html,
	})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, resendEndpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+s.APIKey)
	req.Header.Set("Content-Type", "application/json")

	client := s.HTTP
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("resend request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		slog.Info("email_sent_resend", "to", to, "template", template, "status", resp.StatusCode)
		return nil
	}
	respBody, _ := io.ReadAll(resp.Body)
	return fmt.Errorf("resend returned %d: %s", resp.StatusCode, string(respBody))
}

// Compile-time guard.
var _ Sender = (*ResendSender)(nil)
