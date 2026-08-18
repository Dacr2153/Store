-- Reverse of 000002_ecommerce_core.up.sql
DROP TABLE IF EXISTS idempotency_keys;
DROP TABLE IF EXISTS tax_rates;
DROP TABLE IF EXISTS shipping_rates;
DROP TABLE IF EXISTS order_status_history;

ALTER TABLE car_item
  DROP COLUMN IF EXISTS unit_price,
  DROP COLUMN IF EXISTS variant_id;

ALTER TABLE users
  DROP COLUMN IF EXISTS email_verified_at;

DROP TABLE IF EXISTS email_tokens;
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS email_queue;
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS review_helpful;

ALTER TABLE reviews
  DROP COLUMN IF EXISTS images,
  DROP COLUMN IF EXISTS helpful_count,
  DROP COLUMN IF EXISTS verified_purchase;

DROP TABLE IF EXISTS returns;
DROP TABLE IF EXISTS shipments;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS payment_methods;
DROP TABLE IF EXISTS coupons;
DROP TABLE IF EXISTS wishlists;
DROP TABLE IF EXISTS addresses;
DROP TABLE IF EXISTS product_variants;

DROP INDEX IF EXISTS idx_categories_parent;
ALTER TABLE categories
  DROP COLUMN IF EXISTS sort_order,
  DROP COLUMN IF EXISTS image_url,
  DROP COLUMN IF EXISTS parent_id;
