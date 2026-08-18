-- Loyalty points and referrals.
-- ============================================================

CREATE TABLE IF NOT EXISTS loyalty_points (
    user_id    VARCHAR(32) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance    INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loyalty_history (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    VARCHAR(32) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delta      INTEGER NOT NULL,
    reason     VARCHAR(64) NOT NULL,
    ref_id     VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_loyalty_history_user ON loyalty_history(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS referrals (
    referrer_id      VARCHAR(32) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code             VARCHAR(16) PRIMARY KEY,
    used_by_user_id  VARCHAR(32) REFERENCES users(id) ON DELETE SET NULL,
    rewarded_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (referrer_id)
);
CREATE INDEX IF NOT EXISTS idx_referrals_used_by ON referrals(used_by_user_id);
