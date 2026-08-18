-- Expand orders.status to support the full state machine (paid, refunded, returned)
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending','confirmed','paid','shipped','delivered','cancelled','refunded','returned'));
