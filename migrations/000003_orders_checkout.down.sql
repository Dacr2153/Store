DROP INDEX IF EXISTS idx_status_history_order;
DROP INDEX IF EXISTS idx_payments_order;
DROP INDEX IF EXISTS idx_orders_status_created;

ALTER TABLE orders
    DROP COLUMN IF EXISTS discount_amount,
    DROP COLUMN IF EXISTS coupon_code,
    DROP COLUMN IF EXISTS subtotal,
    DROP COLUMN IF EXISTS tax_amount,
    DROP COLUMN IF EXISTS shipping_cost,
    DROP COLUMN IF EXISTS shipping_method,
    DROP COLUMN IF EXISTS billing_address_id,
    DROP COLUMN IF EXISTS shipping_address_id;
