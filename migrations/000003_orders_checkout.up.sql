-- Phase F/G/H: extend orders with checkout/shipping/tax/coupon fields and
-- ensure idempotent helper indices for the order state machine.
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS shipping_address_id uuid REFERENCES addresses(id),
    ADD COLUMN IF NOT EXISTS billing_address_id  uuid REFERENCES addresses(id),
    ADD COLUMN IF NOT EXISTS shipping_method     varchar(40),
    ADD COLUMN IF NOT EXISTS shipping_cost       numeric(10,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tax_amount          numeric(10,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS subtotal            numeric(10,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS coupon_code         varchar(40),
    ADD COLUMN IF NOT EXISTS discount_amount     numeric(10,2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_order        ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_status_history_order  ON order_status_history(order_id, changed_at);
