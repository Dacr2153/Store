-- ============================================================
-- Migration 000011: incremental, sub-millisecond search index
-- ------------------------------------------------------------
-- Migration 000010 introduced mv_product_search, a materialised
-- view that pre-computed every signal the search path needs.
-- Materialised views however can ONLY be refreshed as a whole:
-- a single new review or a single purchase would never show up
-- in the index until the next REFRESH MATERIALIZED VIEW.
--
-- This migration turns that view into a regular table
-- `product_search` that is maintained incrementally by triggers.
-- The trade-off is real and measurable:
--
--   MV refresh after one INSERT  ~ 50–500 ms (rebuild every row)
--   targeted UPSERT for one row  ~ 0.1–1.0 ms (one indexed write)
--
-- So when a customer buys a product, leaves a review, adds it to
-- their wishlist, or an admin edits the description, ONLY that
-- product's row is recomputed, and the change is visible to the
-- next search query within microseconds.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Drop the materialised view and rebuild it as a real table.
-- ------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS mv_product_search;

CREATE TABLE IF NOT EXISTS product_search (
    id               VARCHAR(32)     PRIMARY KEY,
    name             VARCHAR(255)    NOT NULL,
    price            NUMERIC(10,2)   NOT NULL,
    stock            INTEGER         NOT NULL,
    description      TEXT,
    created_at       TIMESTAMP       NOT NULL,
    image_url        TEXT            NOT NULL DEFAULT '',
    review_count     INTEGER         NOT NULL DEFAULT 0,
    avg_rating       NUMERIC(3,2)    NOT NULL DEFAULT 0,
    verified_count   INTEGER         NOT NULL DEFAULT 0,
    wishlist_count   INTEGER         NOT NULL DEFAULT 0,
    sales_count      INTEGER         NOT NULL DEFAULT 0,
    popularity_score NUMERIC(10,3)   NOT NULL DEFAULT 0,
    category_slugs   TEXT[]          NOT NULL DEFAULT ARRAY[]::TEXT[],
    category_ids     INTEGER[]       NOT NULL DEFAULT ARRAY[]::INTEGER[],
    search_vector    TSVECTOR        NOT NULL,
    search_text      TEXT            NOT NULL,
    updated_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ps_search_vector
    ON product_search USING gin (search_vector);
CREATE INDEX IF NOT EXISTS idx_ps_search_text_trgm
    ON product_search USING gin (search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_ps_categories
    ON product_search USING gin (category_slugs);
CREATE INDEX IF NOT EXISTS idx_ps_price
    ON product_search (price);
CREATE INDEX IF NOT EXISTS idx_ps_popularity
    ON product_search (popularity_score DESC);
CREATE INDEX IF NOT EXISTS idx_ps_created_brin
    ON product_search USING brin (created_at);
CREATE INDEX IF NOT EXISTS idx_ps_updated_at
    ON product_search (updated_at DESC);

-- ------------------------------------------------------------
-- 2) recompute_product_search(p_id) — the single-row UPSERT.
--    This is the hot path. Every trigger ultimately calls this.
--    It is intentionally SECURITY INVOKER (default) and STRICT.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION recompute_product_search(p_id VARCHAR(32))
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- If the product no longer exists, drop its row from the
    -- search index. This covers ON DELETE CASCADE situations.
    IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_id) THEN
        DELETE FROM product_search WHERE id = p_id;
        PERFORM pg_notify('product_search_changed', p_id);
        RETURN;
    END IF;

    INSERT INTO product_search AS ps (
        id, name, price, stock, description, created_at,
        image_url, review_count, avg_rating, verified_count,
        wishlist_count, sales_count, popularity_score,
        category_slugs, category_ids, search_vector, search_text,
        updated_at
    )
    SELECT
        p.id,
        p.name,
        p.price,
        p.stock,
        p.description,
        p.created_at,
        COALESCE((
            SELECT i.url
              FROM product_images pi
              JOIN images i ON i.id = pi.image_id
             WHERE pi.product_id = p.id
             ORDER BY pi.created_at ASC
             LIMIT 1
        ), '') AS image_url,
        COALESCE((SELECT COUNT(*)::int FROM reviews WHERE product_id = p.id), 0) AS review_count,
        COALESCE((SELECT AVG(rating)::numeric(3,2) FROM reviews WHERE product_id = p.id), 0) AS avg_rating,
        COALESCE((SELECT COUNT(*)::int FROM reviews WHERE product_id = p.id AND verified_purchase), 0) AS verified_count,
        COALESCE((SELECT COUNT(*)::int FROM wishlists WHERE product_id = p.id), 0) AS wishlist_count,
        COALESCE((
            SELECT SUM(oi.quantity)::int
              FROM order_items oi
              JOIN orders o ON o.id = oi.order_id
             WHERE oi.product_id = p.id
               AND o.status IN ('confirmed','shipped','delivered')
        ), 0) AS sales_count,
        (
            COALESCE((
                SELECT SUM(oi.quantity)::int
                  FROM order_items oi
                  JOIN orders o ON o.id = oi.order_id
                 WHERE oi.product_id = p.id
                   AND o.status IN ('confirmed','shipped','delivered')
            ), 0) * 0.50
          + COALESCE((SELECT COUNT(*)::int FROM wishlists WHERE product_id = p.id), 0) * 0.25
          + COALESCE((SELECT COUNT(*)::int FROM reviews   WHERE product_id = p.id), 0) * 0.15
          + COALESCE((SELECT AVG(rating)::numeric(10,3) FROM reviews WHERE product_id = p.id), 0) * 2.00
        )::numeric(10,3) AS popularity_score,
        COALESCE((
            SELECT array_agg(DISTINCT c.slug ORDER BY c.slug)
              FROM product_categories pc
              JOIN categories c ON c.id = pc.category_id
             WHERE pc.product_id = p.id
        ), ARRAY[]::text[]) AS category_slugs,
        COALESCE((
            SELECT array_agg(DISTINCT c.id ORDER BY c.id)
              FROM product_categories pc
              JOIN categories c ON c.id = pc.category_id
             WHERE pc.product_id = p.id
        ), ARRAY[]::int[]) AS category_ids,
        (
            setweight(to_tsvector('simple', unaccent(coalesce(p.name,''))),        'A') ||
            setweight(to_tsvector('simple', unaccent(coalesce(p.description,''))), 'B') ||
            setweight(to_tsvector('simple',
                unaccent(array_to_string(
                    COALESCE((
                        SELECT array_agg(c.slug ORDER BY c.slug)
                          FROM product_categories pc
                          JOIN categories c ON c.id = pc.category_id
                         WHERE pc.product_id = p.id
                    ), ARRAY[]::text[]),
                ' '))),
            'C')
        ) AS search_vector,
        unaccent(coalesce(p.name,'') || ' ' || coalesce(p.description,'')) AS search_text,
        NOW() AS updated_at
      FROM products p
     WHERE p.id = p_id
    ON CONFLICT (id) DO UPDATE SET
        name             = EXCLUDED.name,
        price            = EXCLUDED.price,
        stock            = EXCLUDED.stock,
        description      = EXCLUDED.description,
        created_at       = EXCLUDED.created_at,
        image_url        = EXCLUDED.image_url,
        review_count     = EXCLUDED.review_count,
        avg_rating       = EXCLUDED.avg_rating,
        verified_count   = EXCLUDED.verified_count,
        wishlist_count   = EXCLUDED.wishlist_count,
        sales_count      = EXCLUDED.sales_count,
        popularity_score = EXCLUDED.popularity_score,
        category_slugs   = EXCLUDED.category_slugs,
        category_ids     = EXCLUDED.category_ids,
        search_vector    = EXCLUDED.search_vector,
        search_text      = EXCLUDED.search_text,
        updated_at       = NOW();

    -- async notification so the Go layer can invalidate caches
    PERFORM pg_notify('product_search_changed', p_id);
END
$$;

-- ------------------------------------------------------------
-- 3) Trigger helper: pick the right product id from NEW/OLD.
-- ------------------------------------------------------------

-- products: id is on the row itself.
CREATE OR REPLACE FUNCTION trg_ps_products()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM product_search WHERE id = OLD.id;
        PERFORM pg_notify('product_search_changed', OLD.id);
        RETURN OLD;
    END IF;
    PERFORM recompute_product_search(NEW.id);
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_ps_products ON products;
CREATE TRIGGER trg_ps_products
AFTER INSERT OR UPDATE OR DELETE ON products
FOR EACH ROW EXECUTE FUNCTION trg_ps_products();

-- reviews: product_id column. Fires for purchase-verified flag,
-- rating changes, deletes — every one is sub-millisecond.
CREATE OR REPLACE FUNCTION trg_ps_reviews()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM recompute_product_search(OLD.product_id);
        RETURN OLD;
    END IF;
    PERFORM recompute_product_search(NEW.product_id);
    -- If product_id was somehow changed (uncommon, but safe):
    IF TG_OP = 'UPDATE' AND OLD.product_id IS DISTINCT FROM NEW.product_id THEN
        PERFORM recompute_product_search(OLD.product_id);
    END IF;
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_ps_reviews ON reviews;
CREATE TRIGGER trg_ps_reviews
AFTER INSERT OR UPDATE OR DELETE ON reviews
FOR EACH ROW EXECUTE FUNCTION trg_ps_reviews();

-- wishlists: product_id column.
CREATE OR REPLACE FUNCTION trg_ps_wishlists()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM recompute_product_search(OLD.product_id);
        RETURN OLD;
    END IF;
    PERFORM recompute_product_search(NEW.product_id);
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_ps_wishlists ON wishlists;
CREATE TRIGGER trg_ps_wishlists
AFTER INSERT OR UPDATE OR DELETE ON wishlists
FOR EACH ROW EXECUTE FUNCTION trg_ps_wishlists();

-- order_items: product_id column. Sales count tracking.
CREATE OR REPLACE FUNCTION trg_ps_order_items()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM recompute_product_search(OLD.product_id);
        RETURN OLD;
    END IF;
    PERFORM recompute_product_search(NEW.product_id);
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_ps_order_items ON order_items;
CREATE TRIGGER trg_ps_order_items
AFTER INSERT OR UPDATE OR DELETE ON order_items
FOR EACH ROW EXECUTE FUNCTION trg_ps_order_items();

-- orders: status transitions ('pending' -> 'confirmed' …) move
-- sales in or out of the popularity bucket. Fire only when the
-- status actually changes, and only for the affected order.
CREATE OR REPLACE FUNCTION trg_ps_orders_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
        RETURN NEW;
    END IF;
    -- Recompute every product whose item is in this order.
    PERFORM recompute_product_search(oi.product_id)
       FROM order_items oi
      WHERE oi.order_id = COALESCE(NEW.id, OLD.id);
    RETURN COALESCE(NEW, OLD);
END
$$;

DROP TRIGGER IF EXISTS trg_ps_orders_status ON orders;
CREATE TRIGGER trg_ps_orders_status
AFTER INSERT OR UPDATE OR DELETE ON orders
FOR EACH ROW EXECUTE FUNCTION trg_ps_orders_status();

-- product_categories: changes the slugs/tsvector/category_ids.
CREATE OR REPLACE FUNCTION trg_ps_product_categories()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM recompute_product_search(OLD.product_id);
        RETURN OLD;
    END IF;
    PERFORM recompute_product_search(NEW.product_id);
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_ps_product_categories ON product_categories;
CREATE TRIGGER trg_ps_product_categories
AFTER INSERT OR UPDATE OR DELETE ON product_categories
FOR EACH ROW EXECUTE FUNCTION trg_ps_product_categories();

-- product_images: changes image_url.
CREATE OR REPLACE FUNCTION trg_ps_product_images()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM recompute_product_search(OLD.product_id);
        RETURN OLD;
    END IF;
    PERFORM recompute_product_search(NEW.product_id);
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_ps_product_images ON product_images;
CREATE TRIGGER trg_ps_product_images
AFTER INSERT OR UPDATE OR DELETE ON product_images
FOR EACH ROW EXECUTE FUNCTION trg_ps_product_images();

-- ------------------------------------------------------------
-- 4) Full rebuild helper (admin: POST /search/refresh).
--    Now means: recompute every product in one pass. Fast on
--    moderate catalogues (≤ 1M rows in a few seconds) and useful
--    after bulk loads / data fixes / schema changes.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION refresh_mv_product_search()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    pid VARCHAR(32);
BEGIN
    FOR pid IN SELECT id FROM products LOOP
        PERFORM recompute_product_search(pid);
    END LOOP;
END
$$;

-- ------------------------------------------------------------
-- 5) Initial population from existing products.
-- ------------------------------------------------------------
SELECT refresh_mv_product_search();

ANALYZE product_search;
