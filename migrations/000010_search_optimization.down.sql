-- Rollback migration 000010.

DROP FUNCTION IF EXISTS refresh_mv_product_search();
DROP MATERIALIZED VIEW IF EXISTS mv_product_search;

DROP INDEX IF EXISTS idx_products_name_trgm;
DROP INDEX IF EXISTS idx_products_desc_trgm;
DROP INDEX IF EXISTS idx_products_price_created;
DROP INDEX IF EXISTS idx_products_created_brin;
DROP INDEX IF EXISTS idx_wishlists_product;
DROP INDEX IF EXISTS idx_order_items_product;
DROP INDEX IF EXISTS idx_reviews_product_rating;

ALTER TABLE products ALTER COLUMN name        SET STATISTICS -1;
ALTER TABLE products ALTER COLUMN description SET STATISTICS -1;
ALTER TABLE products ALTER COLUMN price       SET STATISTICS -1;

-- Extensions are intentionally NOT dropped because they may be
-- in use by other applications on the same database.
