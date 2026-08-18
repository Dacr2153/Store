-- 000008_seed_demo_data.up.sql
-- Seeds a demo vendor (Kevin) and ~48 sample products across all 8 categories.
-- Idempotent: re-running the migration is a no-op thanks to ON CONFLICT DO NOTHING.
-- Login for demo vendor:
--   email:    kevin@finalstore.demo
--   password: kevin123  (bcrypt cost 10 hash embedded below)

-- 1) Vendor user --------------------------------------------------------------
INSERT INTO users (id, email, password)
VALUES (
  'seed_kevin_vendor_account_001',
  'kevin@finalstore.demo',
  '$2a$10$zx5.rEDoDlwaOVidJjKj8eCUoXUHa8IVzLpW/vDEk4QrCFcK8W6ym'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO bussinessman (user_id, company_name, company_id)
VALUES ('seed_kevin_vendor_account_001', 'Kevin''s Store', 'KEVIN-001')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO users_roles (user_id, role_id)
SELECT 'seed_kevin_vendor_account_001', id FROM roles WHERE name = 'business'
ON CONFLICT DO NOTHING;

-- 2) Products -----------------------------------------------------------------
-- One INSERT statement; ids prefixed by category for easy reference.
INSERT INTO products (id, name, price, user_id, stock, description) VALUES
  -- Electronics
  ('seed_elec_001', 'Wireless Noise-Cancelling Headphones', 199.99, 'seed_kevin_vendor_account_001', 42, 'Premium over-ear headphones with active noise cancellation, 30h battery life and crystal-clear voice calls.'),
  ('seed_elec_002', '4K Ultra-HD Smart TV 55"',             549.00, 'seed_kevin_vendor_account_001', 18, 'Vivid HDR10+ display with built-in streaming apps and voice remote.'),
  ('seed_elec_003', 'Mirrorless Camera Body',              1199.00, 'seed_kevin_vendor_account_001',  9, '24MP APS-C mirrorless camera with 4K video and in-body stabilization.'),
  ('seed_elec_004', 'Gaming Mechanical Keyboard',            89.50, 'seed_kevin_vendor_account_001', 75, 'Hot-swappable switches, per-key RGB and a detachable USB-C cable.'),
  ('seed_elec_005', 'Portable Bluetooth Speaker',            59.90, 'seed_kevin_vendor_account_001',120, 'IPX7 waterproof speaker with 24h playtime and stereo pairing.'),
  ('seed_elec_006', 'Smartwatch Series X',                  249.00, 'seed_kevin_vendor_account_001', 33, 'Always-on AMOLED, ECG, SpO2, GPS and a 7-day battery.'),

  -- Fashion
  ('seed_fash_001', 'Slim-Fit Cotton T-Shirt',               19.99, 'seed_kevin_vendor_account_001',200, 'Soft 100% organic cotton tee, sustainably produced.'),
  ('seed_fash_002', 'Classic Leather Jacket',               249.00, 'seed_kevin_vendor_account_001', 15, 'Full-grain leather, satin-lined biker cut with YKK zippers.'),
  ('seed_fash_003', 'Running Sneakers',                      89.00, 'seed_kevin_vendor_account_001', 80, 'Breathable mesh upper with responsive foam midsole.'),
  ('seed_fash_004', 'Denim Slim Jeans',                      59.00, 'seed_kevin_vendor_account_001',110, 'Stretch denim with a tailored slim leg and dark wash.'),
  ('seed_fash_005', 'Wool Blend Overcoat',                  189.00, 'seed_kevin_vendor_account_001', 22, 'Timeless overcoat in a warm wool-blend fabric.'),
  ('seed_fash_006', 'Aviator Sunglasses',                    39.99, 'seed_kevin_vendor_account_001',150, 'Polarized lenses, UV400 protection, lightweight metal frame.'),

  -- Home & Kitchen
  ('seed_home_001', 'Stainless Steel Cookware Set 10-Pc',   229.00, 'seed_kevin_vendor_account_001', 28, 'Tri-ply stainless steel pots and pans, induction compatible.'),
  ('seed_home_002', 'Espresso Machine',                     349.00, 'seed_kevin_vendor_account_001', 17, '15-bar pump espresso machine with milk frother.'),
  ('seed_home_003', 'Robot Vacuum Cleaner',                 279.00, 'seed_kevin_vendor_account_001', 24, 'LIDAR navigation, app control, self-charging.'),
  ('seed_home_004', 'Memory Foam Pillow (2-Pack)',           49.99, 'seed_kevin_vendor_account_001', 95, 'Ventilated memory foam, hypoallergenic bamboo cover.'),
  ('seed_home_005', 'Air Fryer XL 6L',                       129.00, 'seed_kevin_vendor_account_001', 60, 'Digital touch panel, 8 presets, dishwasher-safe basket.'),
  ('seed_home_006', 'Smart LED Lamp',                        34.50, 'seed_kevin_vendor_account_001',130, '16M colors, music sync, works with Alexa & Google Home.'),

  -- Beauty
  ('seed_beau_001', 'Vitamin C Brightening Serum',           29.90, 'seed_kevin_vendor_account_001',150, '20% L-ascorbic acid serum with hyaluronic acid and vitamin E.'),
  ('seed_beau_002', 'Hair Dryer Ionic Pro',                 119.00, 'seed_kevin_vendor_account_001', 40, '1800W ionic motor with 3 heat settings and cool shot.'),
  ('seed_beau_003', 'Luxury Perfume 100ml',                  89.00, 'seed_kevin_vendor_account_001', 55, 'Floral-amber fragrance for evening wear.'),
  ('seed_beau_004', 'Mineral Sunscreen SPF 50',              24.00, 'seed_kevin_vendor_account_001',200, 'Reef-safe, lightweight, non-greasy daily sunscreen.'),
  ('seed_beau_005', 'Electric Toothbrush',                   79.00, 'seed_kevin_vendor_account_001', 70, 'Sonic 40k vibrations/min with 5 modes and pressure sensor.'),
  ('seed_beau_006', 'Skincare Gift Set',                     59.50, 'seed_kevin_vendor_account_001', 45, 'Cleanser, toner and moisturizer trio for all skin types.'),

  -- Sports
  ('seed_sprt_001', 'Yoga Mat Pro 6mm',                      39.00, 'seed_kevin_vendor_account_001',180, 'Eco-friendly TPE mat with alignment lines and carry strap.'),
  ('seed_sprt_002', 'Adjustable Dumbbells 25kg',            249.00, 'seed_kevin_vendor_account_001', 20, 'Quick-select pair from 2.5 to 25kg in 2.5kg increments.'),
  ('seed_sprt_003', 'Mountain Bike Helmet',                  79.99, 'seed_kevin_vendor_account_001', 65, 'MIPS-compatible helmet with 24 vents and removable visor.'),
  ('seed_sprt_004', 'Running Shorts',                        24.99, 'seed_kevin_vendor_account_001',140, 'Lightweight quick-dry shorts with phone pocket.'),
  ('seed_sprt_005', 'Soccer Ball Size 5',                    29.00, 'seed_kevin_vendor_account_001',110, 'Match-grade ball with hand-stitched panels.'),
  ('seed_sprt_006', 'Fitness Tracker Band',                  49.90, 'seed_kevin_vendor_account_001', 95, 'Heart rate, sleep and 14 sport modes with 10-day battery.'),

  -- Books
  ('seed_book_001', 'The Pragmatic Programmer',              42.00, 'seed_kevin_vendor_account_001', 60, '20th anniversary edition. Classic guide to software craftsmanship.'),
  ('seed_book_002', 'Clean Architecture',                    39.50, 'seed_kevin_vendor_account_001', 55, 'A craftsman''s guide to software structure and design.'),
  ('seed_book_003', 'Designing Data-Intensive Applications', 49.00, 'seed_kevin_vendor_account_001', 38, 'The big ideas behind reliable, scalable, maintainable systems.'),
  ('seed_book_004', 'Atomic Habits',                         18.99, 'seed_kevin_vendor_account_001',180, 'An easy & proven way to build good habits and break bad ones.'),
  ('seed_book_005', 'Deep Work',                             21.50, 'seed_kevin_vendor_account_001',120, 'Rules for focused success in a distracted world.'),
  ('seed_book_006', 'Sapiens: A Brief History',              22.00, 'seed_kevin_vendor_account_001', 90, 'A captivating retelling of humankind''s history.'),

  -- Toys
  ('seed_toys_001', 'Building Blocks 1000-Pc Set',           79.00, 'seed_kevin_vendor_account_001', 50, 'Compatible with major brick brands, classic colors mix.'),
  ('seed_toys_002', 'Remote Control Drone',                 159.00, 'seed_kevin_vendor_account_001', 28, 'HD camera, GPS return-home, 25-min flight time.'),
  ('seed_toys_003', 'Wooden Puzzle 500 Pieces',              19.99, 'seed_kevin_vendor_account_001',100, 'Premium FSC-certified plywood with vivid artwork.'),
  ('seed_toys_004', 'Plush Teddy Bear 40cm',                 24.50, 'seed_kevin_vendor_account_001',120, 'Hypoallergenic cuddly bear, machine washable.'),
  ('seed_toys_005', 'Board Game Strategy Classic',           44.00, 'seed_kevin_vendor_account_001', 60, 'A timeless strategy board game for 2-4 players.'),
  ('seed_toys_006', 'Kids Educational Tablet',               89.00, 'seed_kevin_vendor_account_001', 35, 'Parental controls, 100+ pre-installed learning apps.'),

  -- Automotive
  ('seed_auto_001', 'Dash Cam 4K with GPS',                 149.00, 'seed_kevin_vendor_account_001', 40, '4K front cam, 1080p rear, Wi-Fi and built-in GPS.'),
  ('seed_auto_002', 'Portable Jump Starter 2000A',           99.00, 'seed_kevin_vendor_account_001', 70, 'Boost 8L gas / 6L diesel engines, USB-C output.'),
  ('seed_auto_003', 'Tire Inflator Cordless',                69.00, 'seed_kevin_vendor_account_001', 85, 'Auto-stop pressure, LED light, rechargeable battery.'),
  ('seed_auto_004', 'Car Phone Mount Magnetic',              19.99, 'seed_kevin_vendor_account_001',200, 'Vent-mount magnetic holder, works with all phone sizes.'),
  ('seed_auto_005', 'Microfiber Wash Mitt + Towels Set',     24.00, 'seed_kevin_vendor_account_001',150, 'Scratch-free mitt with 4 premium drying towels.'),
  ('seed_auto_006', 'Roof Cargo Bag 425L',                  119.00, 'seed_kevin_vendor_account_001', 32, 'Waterproof rooftop carrier for any vehicle.')
ON CONFLICT (id) DO NOTHING;

-- 3) Link products to categories ---------------------------------------------
-- Map by id-prefix → slug; subquery resolves slug → category id at runtime.
INSERT INTO product_categories (product_id, category_id)
SELECT p.id, c.id
FROM products p
JOIN categories c ON c.slug = CASE
    WHEN p.id LIKE 'seed_elec_%' THEN 'electronics'
    WHEN p.id LIKE 'seed_fash_%' THEN 'fashion'
    WHEN p.id LIKE 'seed_home_%' THEN 'home-kitchen'
    WHEN p.id LIKE 'seed_beau_%' THEN 'beauty'
    WHEN p.id LIKE 'seed_sprt_%' THEN 'sports'
    WHEN p.id LIKE 'seed_book_%' THEN 'books'
    WHEN p.id LIKE 'seed_toys_%' THEN 'toys'
    WHEN p.id LIKE 'seed_auto_%' THEN 'automotive'
END
WHERE p.id LIKE 'seed\_%' ESCAPE '\'
ON CONFLICT DO NOTHING;

-- 4) Product images -----------------------------------------------------------
-- Two deterministic Lorem Picsum URLs per product. The seed equals the product id
-- so the image is stable across deploys; resolution is 600x600.
WITH new_images AS (
    SELECT p.id AS pid,
           gen_random_uuid() AS img1_id,
           gen_random_uuid() AS img2_id,
           'https://picsum.photos/seed/' || p.id || '/600/600'   AS url1,
           'https://picsum.photos/seed/' || p.id || '-2/600/600' AS url2
    FROM products p
    WHERE p.id LIKE 'seed\_%' ESCAPE '\'
      AND NOT EXISTS (
          SELECT 1 FROM product_images pi WHERE pi.product_id = p.id
      )
),
inserted_images AS (
    INSERT INTO images (id, user_id, url, name, type, size)
    SELECT img1_id, 'seed_kevin_vendor_account_001', url1, pid || '-1', 'image/jpeg', 0
        FROM new_images
    UNION ALL
    SELECT img2_id, 'seed_kevin_vendor_account_001', url2, pid || '-2', 'image/jpeg', 0
        FROM new_images
    RETURNING id
)
INSERT INTO product_images (product_id, image_id)
SELECT pid, img1_id FROM new_images
UNION ALL
SELECT pid, img2_id FROM new_images
ON CONFLICT DO NOTHING;
