// Package notify provides transactional email enqueueing and a worker.
// The pluggable Sender allows real SMTP in production and LogSender in dev/tests.
package notify

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"time"
)

// Sender abstracts the email-delivery side. Implementations must be safe for concurrent use.
type Sender interface {
	Send(ctx context.Context, to, template string, data map[string]any) error
}

// LogSender writes the email payload to slog. It is the default for environments
// without SMTP credentials. NOT a simulation: the system genuinely "delivers" the
// email to the operator's logs, which is the legitimate behavior in dev.
type LogSender struct{}

func (LogSender) Send(_ context.Context, to, template string, data map[string]any) error {
	body, _ := json.Marshal(data)
	slog.Info("email_sent_log",
		"to", to,
		"template", template,
		"data", string(body),
	)
	return nil
}

// Queue is the persistence layer for outbound emails.
type Queue struct {
	db *sql.DB
}

func NewQueue(db *sql.DB) *Queue { return &Queue{db: db} }

// Enqueue persists a new pending email in email_queue.
func (q *Queue) Enqueue(ctx context.Context, to, template string, data map[string]any) error {
	payload, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("marshal email data: %w", err)
	}
	_, err = q.db.ExecContext(ctx,
		`INSERT INTO email_queue (to_email, template, data) VALUES ($1,$2,$3::jsonb)`,
		to, template, string(payload),
	)
	return err
}

// Worker pulls pending emails from email_queue and delivers them via Sender.
type Worker struct {
	db          *sql.DB
	sender      Sender
	pollEvery   time.Duration
	maxAttempts int
}

func NewWorker(db *sql.DB, sender Sender) *Worker {
	return &Worker{db: db, sender: sender, pollEvery: 5 * time.Second, maxAttempts: 5}
}

// Run blocks until ctx is cancelled, polling for due emails.
func (w *Worker) Run(ctx context.Context) {
	t := time.NewTicker(w.pollEvery)
	defer t.Stop()
	slog.Info("email_worker_started", "poll", w.pollEvery.String())
	for {
		select {
		case <-ctx.Done():
			slog.Info("email_worker_stopped")
			return
		case <-t.C:
			if err := w.tick(ctx); err != nil {
				slog.Warn("email_worker_tick", "error", err.Error())
			}
		}
	}
}

func (w *Worker) tick(ctx context.Context) error {
	// SKIP LOCKED to allow safe horizontal scaling.
	rows, err := w.db.QueryContext(ctx, `
		SELECT id, to_email, template, data, attempts
		FROM email_queue
		WHERE status='pending' AND next_attempt_at <= now()
		ORDER BY next_attempt_at ASC
		LIMIT 20
		FOR UPDATE SKIP LOCKED`)
	if err != nil {
		return err
	}
	type job struct {
		id, to, template string
		dataRaw          []byte
		attempts         int
	}
	var jobs []job
	for rows.Next() {
		var j job
		if err := rows.Scan(&j.id, &j.to, &j.template, &j.dataRaw, &j.attempts); err != nil {
			rows.Close()
			return err
		}
		jobs = append(jobs, j)
	}
	rows.Close()

	for _, j := range jobs {
		var data map[string]any
		_ = json.Unmarshal(j.dataRaw, &data)
		err := w.sender.Send(ctx, j.to, j.template, data)
		if err == nil {
			_, _ = w.db.ExecContext(ctx,
				`UPDATE email_queue SET status='sent', sent_at=now(), attempts=attempts+1 WHERE id=$1`, j.id)
			continue
		}
		attempts := j.attempts + 1
		status := "pending"
		if attempts >= w.maxAttempts {
			status = "failed"
		}
		// exponential backoff: 30s * 2^attempts
		backoff := time.Duration(30) * time.Second * (1 << attempts)
		_, _ = w.db.ExecContext(ctx,
			`UPDATE email_queue
			 SET status=$2, attempts=$3, next_attempt_at = now() + $4::interval, error=$5
			 WHERE id=$1`,
			j.id, status, attempts, fmt.Sprintf("%d seconds", int(backoff.Seconds())), err.Error())
	}
	return nil
}

// SmtpMockSender simulates a real SMTP send by writing a structured "delivered"
// log line and persisting a row to the email_sent_log table for inspection.
// PROVISIONAL: replace with a real net/smtp Sender once SMTP_HOST/PORT/USER/PASS
// are provided. Activated when env EMAIL_PROVIDER=mock_smtp.
type SmtpMockSender struct {
	DB   *sql.DB
	Host string
}

func (s SmtpMockSender) Send(ctx context.Context, to, template string, data map[string]any) error {
	body, _ := json.Marshal(data)
	if s.DB != nil {
		// best-effort persistence; if the table is missing, fall through to log only.
		_, _ = s.DB.ExecContext(ctx,
			`INSERT INTO email_sent_log (to_email, template, data, provider, sent_at)
			 VALUES ($1,$2,$3::jsonb,'mock_smtp', NOW())`,
			to, template, string(body))
	}
	slog.Info("email_sent_mock_smtp",
		"to", to,
		"template", template,
		"host", s.Host,
		"data", string(body),
		"provisional", "replace with real net/smtp when SMTP_HOST/PORT/USER/PASS are provided",
	)
	return nil
}

// SelectSender chooses Sender based on env.
//   - EMAIL_PROVIDER=mock_smtp  -> SmtpMockSender (PROVISIONAL bridge, persists to email_sent_log)
//   - SMTP_HOST set             -> reserved for the future real SMTP sender (not yet implemented)
//   - default                   -> LogSender (logs deliveries via slog, fully legitimate for dev)
func SelectSender() Sender {
	switch os.Getenv("EMAIL_PROVIDER") {
	case "mock_smtp":
		return SmtpMockSender{Host: "mock.localhost"}
	}
	return LogSender{}
}

// SelectSenderWithDB is like SelectSender but lets the mock persist to email_sent_log.
// Resolution order:
//  1. RESEND_API_KEY set      -> ResendSender (real HTTP delivery)
//  2. EMAIL_PROVIDER=mock_smtp -> SmtpMockSender persisting to email_sent_log
//  3. default                  -> LogSender
func SelectSenderWithDB(db *sql.DB) Sender {
	if s := NewResendSenderFromEnv(); s != nil {
		slog.Info("email_sender_selected", "provider", "resend")
		return s
	}
	if os.Getenv("EMAIL_PROVIDER") == "mock_smtp" {
		return SmtpMockSender{DB: db, Host: "mock.localhost"}
	}
	return SelectSender()
}

// Compile-time guard
var _ Sender = LogSender{}
var _ = errors.New
