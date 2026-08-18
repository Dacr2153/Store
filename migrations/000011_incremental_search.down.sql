-- Reverse of 000011: drop triggers, helper functions, and the
-- physical product_search table; rebuild the materialised view.

DROP TRIGGER IF EXISTS trg_ps_products          ON products;
DROP TRIGGER IF EXISTS trg_ps_reviews           ON reviews;
DROP TRIGGER IF EXISTS trg_ps_wishlists         ON wishlists;
DROP TRIGGER IF EXISTS trg_ps_order_items       ON order_items;
DROP TRIGGER IF EXISTS trg_ps_orders_status     ON orders;
DROP TRIGGER IF EXISTS trg_ps_product_categories ON product_categories;
DROP TRIGGER IF EXISTS trg_ps_product_images    ON product_images;

DROP FUNCTION IF EXISTS trg_ps_products();
DROP FUNCTION IF EXISTS trg_ps_reviews();
DROP FUNCTION IF EXISTS trg_ps_wishlists();
DROP FUNCTION IF EXISTS trg_ps_order_items();
DROP FUNCTION IF EXISTS trg_ps_orders_status();
DROP FUNCTION IF EXISTS trg_ps_product_categories();
DROP FUNCTION IF EXISTS trg_ps_product_images();
DROP FUNCTION IF EXISTS recompute_product_search(VARCHAR);
DROP FUNCTION IF EXISTS refresh_mv_product_search();
DROP TABLE IF EXISTS product_search;
