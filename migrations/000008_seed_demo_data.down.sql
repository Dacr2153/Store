-- 000008_seed_demo_data.down.sql
-- Reverses the demo seed. Order matters: links first, then dependent rows.
DELETE FROM product_images WHERE product_id LIKE 'seed\_%' ESCAPE '\';
DELETE FROM images
 WHERE user_id = 'seed_kevin_vendor_account_001'
   AND url LIKE 'https://picsum.photos/seed/seed%';
DELETE FROM product_categories WHERE product_id LIKE 'seed\_%' ESCAPE '\';
DELETE FROM products WHERE id LIKE 'seed\_%' ESCAPE '\';
DELETE FROM users_roles WHERE user_id = 'seed_kevin_vendor_account_001';
DELETE FROM bussinessman WHERE user_id = 'seed_kevin_vendor_account_001';
DELETE FROM users WHERE id = 'seed_kevin_vendor_account_001';
