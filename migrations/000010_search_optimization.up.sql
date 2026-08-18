-- ============================================================
-- Migration 000010: AI-grade search & query optimisation
-- ------------------------------------------------------------
-- This migration is the "professional-level" optimisation layer:
--
--   1. Enable trigram, unaccent and btree_gin extensions so we
--      get typo-tolerance, accent-insensitive search and the
--      ability to combine equality + tsvector in one GIN index.
--
--   2. Build a materialised view (mv_product_search) that
--      pre-computes EVERYTHING the search path needs:
--        - first image url (no LEFT JOIN at query time)
--        - aggregated review stats
--        - aggregated wishlist popularity
--        - aggregated sales popularity
--        - a composite "popularity_score" used by the AI ranker
--        - category slug array (for fast facets & filters)
--        - a weighted tsvector  (name = A, description = B)
--        - an unaccent'd raw text column for trigram fuzzy match
--
--   3. Add a covering set of GIN + B-tree + BRIN indexes so the
--      planner can pick the fastest path for every workload:
--        FTS query  -> GIN(search_vector)
--        typo query -> GIN(search_text gin_trgm_ops)
--        category   -> GIN(category_slugs)
--        sort/range -> B-tree(price), B-tree(popularity_score)
--        time scan  -> BRIN(created_at)
--
--   4. Tune column statistics so the planner has the data it
--      needs to choose the right plan even on large tables.
--
--   5. A SQL function refresh_mv_product_search() that can be
--      called by Go (every N minutes / after admin product
--      mutations) to keep the view fresh.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- ------------------------------------------------------------
-- Baseline reinforcements on hot tables
-- ------------------------------------------------------------
-- A trigram index on the products.name column lets us answer
-- ILIKE '%foo%' and similarity('name', 'foo') queries in O(log n)
-- instead of full-scan. This is the index that turns naïve LIKE
-- queries into proper indexed scans.
CREATE INDEX IF NOT EXISTS idx_products_name_trgm
    ON products USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_desc_trgm
    ON products USING gin (description gin_trgm_ops);

-- Compound covering index for sort + filter combos used by the
-- listing endpoints (price/created_at sorts).
CREATE INDEX IF NOT EXISTS idx_products_price_created
    ON products (price, created_at DESC);

-- BRIN is tiny and very fast for monotonic timestamps.
CREATE INDEX IF NOT EXISTS idx_products_created_brin
    ON products USING brin (created_at);

-- Tighten planner statistics on hot search columns.
ALTER TABLE products  ALTER COLUMN name        SET STATISTICS 1000;
ALTER TABLE products  ALTER COLUMN description SET STATISTICS 1000;
ALTER TABLE products  ALTER COLUMN price       SET STATISTICS 500;

-- Wishlist + order_items aggregation indexes (popularity inputs)
CREATE INDEX IF NOT EXISTS idx_wishlists_product ON wishlists (product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_product_rating
    ON reviews (product_id, rating);

-- ============================================================
-- mv_product_search  —  AI-ready denormalised search index
-- ============================================================
-- Drop first (idempotent + safe when re-running on dev).
DROP MATERIALIZED VIEW IF EXISTS mv_product_search;

CREATE MATERIALIZED VIEW mv_product_search AS
WITH
review_stats AS (
    SELECT product_id,
           COUNT(*)               AS review_count,
           AVG(rating)::numeric(3,2) AS avg_rating,
           COUNT(*) FILTER (WHERE verified_purchase) AS verified_count
    FROM reviews
    GROUP BY product_id
),
wishlist_stats AS (
    SELECT product_id, COUNT(*) AS wishlist_count
    FROM wishlists
    GROUP BY product_id
),
sales_stats AS (
    SELECT oi.product_id,
           COALESCE(SUM(oi.quantity), 0) AS sales_count
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.status IN ('confirmed','shipped','delivered')
    GROUP BY oi.product_id
),
category_stats AS (
    SELECT pc.product_id,
           array_agg(DISTINCT c.slug ORDER BY c.slug) AS slugs,
           array_agg(DISTINCT c.id   ORDER BY c.id)   AS ids
    FROM product_categories pc
    JOIN categories c ON c.id = pc.category_id
    GROUP BY pc.product_id
),
primary_image AS (
    SELECT DISTINCT ON (pi.product_id) pi.product_id, i.url
    FROM product_images pi
    JOIN images i ON i.id = pi.image_id
    ORDER BY pi.product_id, pi.created_at
)
SELECT
    p.id,
    p.name,
    p.price,
    p.stock,
    p.description,
    p.created_at,
    COALESCE(pri.url, '')                    AS image_url,
    COALESCE(rs.review_count, 0)             AS review_count,
    COALESCE(rs.avg_rating, 0)::numeric(3,2) AS avg_rating,
    COALESCE(rs.verified_count, 0)           AS verified_count,
    COALESCE(ws.wishlist_count, 0)           AS wishlist_count,
    COALESCE(ss.sales_count, 0)              AS sales_count,
    -- Composite popularity used by the AI ranker. Sales weigh
    -- the most (real money committed), then wishlist intent,
    -- then review volume.
    (COALESCE(ss.sales_count, 0)    * 0.50
     + COALESCE(ws.wishlist_count, 0) * 0.25
     + COALESCE(rs.review_count, 0)   * 0.15
     + COALESCE(rs.avg_rating, 0)     * 2.00
    )::numeric(10,3) AS popularity_score,
    COALESCE(cs.slugs, ARRAY[]::text[])      AS category_slugs,
    COALESCE(cs.ids,   ARRAY[]::int[])       AS category_ids,
    -- Weighted, unaccent'd full-text vector. Name dominates
    -- ranking (A), description supports it (B).
    (
        setweight(to_tsvector('simple', unaccent(coalesce(p.name,''))),         'A') ||
        setweight(to_tsvector('simple', unaccent(coalesce(p.description,''))),  'B') ||
        setweight(to_tsvector('simple', unaccent(array_to_string(coalesce(cs.slugs, ARRAY[]::text[]),' '))), 'C')
    ) AS search_vector,
    -- Plain unaccent'd text used by the trigram index for typo
    -- tolerance (similarity(), word_similarity(), ILIKE).
    unaccent(coalesce(p.name,'') || ' ' || coalesce(p.description,'')) AS search_text
FROM products p
LEFT JOIN review_stats   rs  ON rs.product_id  = p.id
LEFT JOIN wishlist_stats ws  ON ws.product_id  = p.id
LEFT JOIN sales_stats    ss  ON ss.product_id  = p.id
LEFT JOIN category_stats cs  ON cs.product_id  = p.id
LEFT JOIN primary_image  pri ON pri.product_id = p.id
WITH NO DATA;

-- A unique index on the id is required by REFRESH ... CONCURRENTLY.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_product_search_id
    ON mv_product_search (id);

-- Search-strategy indexes.
CREATE INDEX IF NOT EXISTS idx_mv_search_vector
    ON mv_product_search USING gin (search_vector);
CREATE INDEX IF NOT EXISTS idx_mv_search_text_trgm
    ON mv_product_search USING gin (search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_mv_search_categories
    ON mv_product_search USING gin (category_slugs);
CREATE INDEX IF NOT EXISTS idx_mv_search_price
    ON mv_product_search (price);
CREATE INDEX IF NOT EXISTS idx_mv_search_popularity
    ON mv_product_search (popularity_score DESC);
CREATE INDEX IF NOT EXISTS idx_mv_search_created_brin
    ON mv_product_search USING brin (created_at);

-- ============================================================
-- Refresh helpers
-- ============================================================
-- A SECURITY DEFINER-less helper used by Go-side scheduler. It
-- tries CONCURRENTLY first (no read lock) and falls back to a
-- normal refresh if the view has never been populated.
CREATE OR REPLACE FUNCTION refresh_mv_product_search()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    is_populated boolean;
BEGIN
    SELECT ispopulated INTO is_populated
    FROM pg_matviews
    WHERE schemaname = current_schema()
      AND matviewname = 'mv_product_search';

    IF is_populated THEN
        REFRESH MATERIALIZED VIEW CONCURRENTLY mv_product_search;
    ELSE
        REFRESH MATERIALIZED VIEW mv_product_search;
    END IF;
END
$$;

-- Initial population (so the view is queryable right after this
-- migration finishes; subsequent refreshes are CONCURRENTLY).
SELECT refresh_mv_product_search();

-- Make sure the planner has fresh stats for the new objects.
ANALYZE products;
ANALYZE reviews;
ANALYZE wishlists;
ANALYZE order_items;
ANALYZE mv_product_search;
