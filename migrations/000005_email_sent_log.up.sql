-- Mock SMTP audit log (Phase J PROVISIONAL bridge).
-- Replace usage when a real SMTP sender ships; the table can stay as an audit trail.
CREATE TABLE IF NOT EXISTS email_sent_log (
  id BIGSERIAL PRIMARY KEY,
  to_email TEXT NOT NULL,
  template TEXT NOT NULL,
  data JSONB,
  provider TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_sent_log_to ON email_sent_log(to_email);
CREATE INDEX IF NOT EXISTS idx_email_sent_log_sent ON email_sent_log(sent_at DESC);
