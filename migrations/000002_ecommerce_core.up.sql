-- Migration 000002: Extended e-commerce data model
-- Adds: variants, addresses, wishlist, coupons, payment_methods, payments,
--       shipments, returns, audit_log, email_queue, refresh_tokens, email_tokens,
--       review extensions, category hierarchy, cart variant snapshot.

-- ============================================================
-- CATEGORIES: hierarchy + slug + image + sort
-- ============================================================
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS parent_id INT REFERENCES categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);

-- ============================================================
-- PRODUCT VARIANTS (talla, color, SKU)
-- ============================================================
CREATE TABLE IF NOT EXISTS product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id VARCHAR(32) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku VARCHAR(64) UNIQUE NOT NULL,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  price NUMERIC(10,2),
  stock INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
  weight_grams INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_variants_attributes ON product_variants USING gin (attributes);

-- ============================================================
-- ADDRESSES (multiple shipping addresses per user)
-- ============================================================
CREATE TABLE IF NOT EXISTS addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(32) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_name VARCHAR(120) NOT NULL,
  phone VARCHAR(32),
  line1 VARCHAR(200) NOT NULL,
  line2 VARCHAR(200),
  city VARCHAR(120) NOT NULL,
  state VARCHAR(120),
  postal_code VARCHAR(20) NOT NULL,
  country_code CHAR(2) NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(user_id);

-- ============================================================
-- WISHLIST (favorites, separate from cart)
-- ============================================================
CREATE TABLE IF NOT EXISTS wishlists (
  user_id VARCHAR(32) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id VARCHAR(32) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);

-- ============================================================
-- COUPONS / promotions
-- ============================================================
CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(40) UNIQUE NOT NULL,
  description TEXT,
  discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percent','fixed','free_shipping')),
  discount_value NUMERIC(10,2) NOT NULL,
  min_subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_uses INT,
  uses_count INT NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code) WHERE active;

-- ============================================================
-- PAYMENT METHODS (stripe/mp tokens, never PAN)
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(32) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL,
  provider_token VARCHAR(200) NOT NULL,
  brand VARCHAR(20),
  last4 CHAR(4),
  exp_month SMALLINT,
  exp_year SMALLINT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_methods_user ON payment_methods(user_id);

-- ============================================================
-- PAYMENTS (one or more attempts per order)
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL,
  provider_payment_id VARCHAR(200) UNIQUE,
  amount NUMERIC(10,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending','authorized','captured','failed','refunded')),
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);

-- ============================================================
-- SHIPMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  carrier VARCHAR(40),
  tracking_number VARCHAR(80),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','shipped','in_transit','delivered','returned')),
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  shipping_address_id UUID REFERENCES addresses(id),
  cost NUMERIC(10,2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_shipments_order ON shipments(order_id);

-- ============================================================
-- RETURNS / RMA
-- ============================================================
CREATE TABLE IF NOT EXISTS returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  user_id VARCHAR(32) NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','approved','rejected','completed')),
  refund_amount NUMERIC(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_returns_order ON returns(order_id);

-- ============================================================
-- REVIEW extensions
-- ============================================================
ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS verified_purchase BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS helpful_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS images TEXT[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS review_helpful (
  review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  user_id VARCHAR(32) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (review_id, user_id)
);

-- ============================================================
-- AUDIT LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id VARCHAR(32) REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id VARCHAR(60),
  payload JSONB,
  ip INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);

-- ============================================================
-- EMAIL QUEUE (transactional emails - pull-based worker)
-- ============================================================
CREATE TABLE IF NOT EXISTS email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email VARCHAR(120) NOT NULL,
  template VARCHAR(40) NOT NULL,
  data JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','failed')),
  attempts INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status, next_attempt_at);

-- ============================================================
-- REFRESH TOKENS
-- ============================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(32) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  user_agent VARCHAR(200),
  ip INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id) WHERE revoked_at IS NULL;

-- ============================================================
-- EMAIL TOKENS (verify email, reset password)
-- ============================================================
CREATE TABLE IF NOT EXISTS email_tokens (
  token_hash CHAR(64) PRIMARY KEY,
  user_id VARCHAR(32) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose VARCHAR(20) NOT NULL CHECK (purpose IN ('verify_email','reset_password')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

-- email_verified_at on users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- ============================================================
-- CART_ITEM: variant snapshot + unit_price snapshot
-- ============================================================
ALTER TABLE car_item
  ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id),
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(10,2);

-- ============================================================
-- ORDER_STATUS_HISTORY (state machine audit trail)
-- ============================================================
CREATE TABLE IF NOT EXISTS order_status_history (
  id BIGSERIAL PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status VARCHAR(50),
  to_status VARCHAR(50) NOT NULL,
  changed_by VARCHAR(32) REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_history_order ON order_status_history(order_id);

-- ============================================================
-- SHIPPING RATES + TAX RATES (lookup tables for checkout)
-- ============================================================
CREATE TABLE IF NOT EXISTS shipping_rates (
  id SERIAL PRIMARY KEY,
  country_code CHAR(2) NOT NULL,
  method VARCHAR(40) NOT NULL,        -- 'standard' | 'express'
  base_cost NUMERIC(10,2) NOT NULL,
  per_kg_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  eta_days_min INT,
  eta_days_max INT,
  UNIQUE (country_code, method)
);

CREATE TABLE IF NOT EXISTS tax_rates (
  id SERIAL PRIMARY KEY,
  country_code CHAR(2) NOT NULL,
  state VARCHAR(120),
  rate NUMERIC(5,4) NOT NULL,         -- 0.0825 = 8.25%
  UNIQUE (country_code, state)
);

-- Seed minimal shipping/tax rates so checkout works out-of-the-box
INSERT INTO shipping_rates (country_code, method, base_cost, per_kg_cost, eta_days_min, eta_days_max) VALUES
  ('CO', 'standard', 5.00, 1.00, 3, 7),
  ('CO', 'express',  12.00, 2.00, 1, 2),
  ('US', 'standard', 8.00, 1.50, 5, 10),
  ('US', 'express',  20.00, 3.00, 2, 4)
ON CONFLICT DO NOTHING;

INSERT INTO tax_rates (country_code, state, rate) VALUES
  ('CO', NULL, 0.1900),
  ('US', NULL, 0.0700)
ON CONFLICT DO NOTHING;

-- ============================================================
-- IDEMPOTENCY KEYS (for checkout retries)
-- ============================================================
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key VARCHAR(80) PRIMARY KEY,
  user_id VARCHAR(32) REFERENCES users(id) ON DELETE CASCADE,
  response_status INT,
  response_body BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_idempotency_created ON idempotency_keys(created_at);
