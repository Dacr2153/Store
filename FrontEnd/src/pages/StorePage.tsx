import { useState, useEffect } from "react";
import { Search, SlidersHorizontal, Package, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ProductCard } from "../components/features/ProductCard";
import { ProductCardSkeleton } from "../components/common/Skeleton";
import { listProducts, type Product as ApiProduct } from "../api/products";
import { Seo } from "../components/common/Seo";

const PAGE_SIZE = 24;

// Slugs match the seeded `categories.slug` column. Labels are localized via i18n.
const CATEGORY_SLUGS = [
  "electronics",
  "fashion",
  "home-kitchen",
  "beauty",
  "sports",
  "books",
  "toys",
  "automotive",
] as const;

/**
 * Phase M — Store / catalog page.
 * - Sticky filter bar with search, sort and price range.
 * - Responsive grid with skeleton loading.
 * - URL `?q=` / `?category=` persisted so links are shareable.
 */
export const StorePage = () => {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(params.get("q") || "");
  const [category, setCategory] = useState(params.get("category") || "");
  const [minPrice, setMinPrice] = useState(params.get("min_price") || "");
  const [maxPrice, setMaxPrice] = useState(params.get("max_price") || "");
  const [sort, setSort] = useState<"relevance" | "price_asc" | "price_desc">(
    "relevance"
  );
  const [showFilters, setShowFilters] = useState(
    !!(params.get("category") || params.get("min_price") || params.get("max_price"))
  );
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Persist state in URL so the page is shareable (chat "View all" lands here).
  useEffect(() => {
    const next = new URLSearchParams(params);
    if (searchTerm) next.set("q", searchTerm); else next.delete("q");
    if (category) next.set("category", category); else next.delete("category");
    if (minPrice) next.set("min_price", minPrice); else next.delete("min_price");
    if (maxPrice) next.set("max_price", maxPrice); else next.delete("max_price");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, category, minPrice, maxPrice]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const t = setTimeout(() => {
      listProducts(
        page,
        searchTerm,
        category,
        minPrice ? parseFloat(minPrice) : undefined,
        maxPrice ? parseFloat(maxPrice) : undefined
      )
        .then((data) => {
          if (cancelled) return;
          let items = Array.isArray(data) ? data : [];
          if (sort === "price_asc")
            items = [...items].sort((a, b) => Number(a.price) - Number(b.price));
          if (sort === "price_desc")
            items = [...items].sort((a, b) => Number(b.price) - Number(a.price));
          setProducts(items);
          setHasMore(items.length === PAGE_SIZE);
        })
        .catch((e) => {
          if (cancelled) return;
          setError(e?.message || "Failed to fetch products");
          setProducts([]);
          setHasMore(false);
        })
        .finally(() => !cancelled && setLoading(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [searchTerm, category, minPrice, maxPrice, page, sort]);

  useEffect(() => {
    setPage(0);
  }, [searchTerm, category, minPrice, maxPrice, sort]);

  const clearFilters = () => {
    setSearchTerm("");
    setCategory("");
    setMinPrice("");
    setMaxPrice("");
    setSort("relevance");
  };

  const hasActiveFilters = !!(searchTerm || category || minPrice || maxPrice || sort !== "relevance");

  return (
    <>
      <Seo title={t("store.title")} description={t("store.subtitle")} />

      {/* Page header */}
      <section className="bg-gradient-to-b from-brand-50 to-white dark:from-gray-900 dark:to-gray-950 border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-gray-50">
            {t("store.title")}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{t("store.subtitle")}</p>
        </div>
      </section>

      {/* Filter bar */}
      <div className="sticky top-[6.5rem] z-30 bg-white/90 dark:bg-gray-900/90 backdrop-blur border-b border-gray-100 dark:border-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("nav.searchPlaceholder")}
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
          >
            <option value="">{t("store.allCategories")}</option>
            {CATEGORY_SLUGS.map((s) => (
              <option key={s} value={s}>{t(`cat.${s}` as const)}</option>
            ))}
          </select>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
          >
            <option value="relevance">{t("store.sort.relevance")}</option>
            <option value="price_asc">{t("store.sort.priceAsc")}</option>
            <option value="price_desc">{t("store.sort.priceDesc")}</option>
          </select>

          <button
            onClick={() => setShowFilters((v) => !v)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 dark:text-gray-100 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <SlidersHorizontal className="w-4 h-4" />
            {t("store.filters")}
          </button>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1 px-3 py-2 text-sm text-brand-500 hover:text-brand-700 font-medium"
            >
              <X className="w-4 h-4" /> {t("store.clear")}
            </button>
          )}
        </div>

        {showFilters && (
          <div className="border-t border-gray-100 dark:border-gray-800 bg-surface-muted dark:bg-gray-900/60">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 grid grid-cols-2 md:grid-cols-3 gap-3">
              <label className="text-sm">
                <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t("store.minPrice")}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                />
              </label>
              <label className="text-sm">
                <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t("store.maxPrice")}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  placeholder="999"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                />
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-2xl bg-surface-muted dark:bg-gray-900/60 py-16 px-6 text-center">
            <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-lg font-semibold text-gray-700 dark:text-gray-200">{t("store.noResults")}</p>
            {searchTerm ? (
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                {t("store.resultsFor", { q: searchTerm })}
              </p>
            ) : null}
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {t("store.showing", { count: products.length })} · {page + 1}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {products.map((p) => (
                <ProductCard key={String(p.id)} product={p as never} />
              ))}
            </div>

            {/* Pagination */}
            <div className="mt-10 flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 dark:text-gray-100 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ←
              </button>
              <span className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300">{page + 1}</span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasMore}
                className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                →
              </button>
            </div>
          </>
        )}
      </section>
    </>
  );
};

export default StorePage;
