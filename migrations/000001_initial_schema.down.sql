-- Reverse of 000001_initial_schema.up.sql
DROP INDEX IF EXISTS idx_products_created;
DROP INDEX IF EXISTS idx_products_price;
DROP INDEX IF EXISTS idx_products_name_fts;
DROP INDEX IF EXISTS idx_car_item_car_id;
DROP INDEX IF EXISTS idx_wishcar_user_id;
DROP INDEX IF EXISTS idx_reviews_product;
DROP INDEX IF EXISTS idx_order_items_order;
DROP INDEX IF EXISTS idx_orders_status;
DROP INDEX IF EXISTS idx_orders_user_id;
DROP INDEX IF EXISTS idx_user_id;

DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS product_categories;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS users_roles;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS car_item;
DROP TABLE IF EXISTS wishcar;
DROP TABLE IF EXISTS product_images;
DROP TABLE IF EXISTS images;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS bussinessman;
DROP TABLE IF EXISTS users;
-- pgcrypto extension is intentionally NOT dropped (may be used by other apps)
