-- Initial schema (extracted from database/up.sql, idempotent form)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- USERS
CREATE TABLE IF NOT EXISTS users(
    id VARCHAR(32) PRIMARY KEY,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- BUSSINESSMAN
CREATE TABLE IF NOT EXISTS bussinessman (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(32) UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_name VARCHAR(255) NOT NULL,
    company_id VARCHAR(255) NOT NULL
);

-- PRODUCTS
CREATE TABLE IF NOT EXISTS products(
    id VARCHAR(32) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    user_id VARCHAR(32) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    description TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- IMAGES
CREATE TABLE IF NOT EXISTS images(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(32) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    name VARCHAR(255),
    type VARCHAR(50),
    size BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_id ON images(user_id);

-- PRODUCT_IMAGES
CREATE TABLE IF NOT EXISTS product_images (
    product_id VARCHAR(32) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    image_id UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (product_id, image_id)
);

-- WISHCAR (carrito)
CREATE TABLE IF NOT EXISTS wishcar(
    id VARCHAR(32) PRIMARY KEY,
    user_id VARCHAR(32) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total DECIMAL(10,2) DEFAULT 0.00,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- CAR_ITEM
CREATE TABLE IF NOT EXISTS car_item (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    car_id VARCHAR(32) NOT NULL REFERENCES wishcar(id) ON DELETE CASCADE,
    product_id VARCHAR(32) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INT NOT NULL CHECK (quantity > 0)
);

-- ROLES
CREATE TABLE IF NOT EXISTS roles(
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL
);
INSERT INTO roles (name) VALUES ('admin'), ('user'), ('business') ON CONFLICT DO NOTHING;

-- USERS_ROLES
CREATE TABLE IF NOT EXISTS users_roles(
    user_id VARCHAR(32) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- ORDERS
CREATE TABLE IF NOT EXISTS orders (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    VARCHAR(32) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status     VARCHAR(50) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','confirmed','shipped','delivered','cancelled')),
    total      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    notes      TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders(status);

-- ORDER_ITEMS
CREATE TABLE IF NOT EXISTS order_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id  VARCHAR(32) NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity    INT NOT NULL CHECK (quantity > 0),
    unit_price  DECIMAL(10,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- CATEGORIES
CREATE TABLE IF NOT EXISTS categories (
    id   SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS product_categories (
    product_id  VARCHAR(32) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    category_id INT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, category_id)
);

INSERT INTO categories (name, slug) VALUES
    ('Electronics',    'electronics'),
    ('Fashion',        'fashion'),
    ('Home & Kitchen', 'home-kitchen'),
    ('Beauty',         'beauty'),
    ('Sports',         'sports'),
    ('Books',          'books'),
    ('Toys',           'toys'),
    ('Automotive',     'automotive')
ON CONFLICT DO NOTHING;

-- REVIEWS
CREATE TABLE IF NOT EXISTS reviews (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id VARCHAR(32) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id    VARCHAR(32) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating     INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment    TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (product_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);

-- PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_wishcar_user_id   ON wishcar(user_id);
CREATE INDEX IF NOT EXISTS idx_car_item_car_id   ON car_item(car_id);
CREATE INDEX IF NOT EXISTS idx_products_name_fts ON products USING gin(to_tsvector('english', name || ' ' || COALESCE(description, '')));
CREATE INDEX IF NOT EXISTS idx_products_price    ON products(price);
CREATE INDEX IF NOT EXISTS idx_products_created  ON products(created_at DESC);
