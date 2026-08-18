import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Sparkles, ArrowRight, Search as SearchIcon } from "lucide-react";
import { ProductCard } from "../components/features/ProductCard";
import { ProductCardSkeleton } from "../components/common/Skeleton";
import { Seo } from "../components/common/Seo";
import { listProducts, type Product as ApiProduct } from "../api/products";
import { getRecentlyViewed, getTrending } from "../api/recommend";

/**
 * ShopPage \u2014 AI-flavoured discovery surface.
 *
 *   - No `?q=` query: shows two personalised rows ("For you" = recently viewed,
 *     plus "Trending now") so logged-in shoppers immediately see relevant items.
 *   - With `?q=`: shows matches first, then a "You might also like" row built
 *     from trending products that are NOT already in the result set, so the
 *     extra row never duplicates a search hit.
 *
 * The full-catalogue browsing experience lives in /store; this page is the
 * curated/personalised entry point.
 */
export const ShopPage: React.FC = () => {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const q = params.get("q")?.trim() || "";
  const category = params.get("category")?.trim() || "";

  const [results, setResults] = useState<ApiProduct[] | null>(null);
  const [recent, setRecent] = useState<ApiProduct[]>([]);
  const [trending, setTrending] = useState<ApiProduct[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [loadingRows, setLoadingRows] = useState(true);

  // Search results react to ?q= and ?category= changes.
  useEffect(() => {
    if (!q && !category) {
      setResults(null);
      return;
    }
    let cancelled = false;
    setLoadingResults(true);
    listProducts(0, q || undefined, category || undefined)
      .then((data) => { if (!cancelled) setResults(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setResults([]); })
      .finally(() => { if (!cancelled) setLoadingResults(false); });
    return () => { cancelled = true; };
  }, [q, category]);

  // Personalisation rows load once on mount and don't depend on the query.
  useEffect(() => {
    let cancelled = false;
    Promise.all([getRecentlyViewed(), getTrending("7d")])
      .then(([r, tr]) => {
        if (cancelled) return;
        setRecent(r.slice(0, 10));
        setTrending(tr.slice(0, 10));
      })
      .finally(() => { if (!cancelled) setLoadingRows(false); });
    return () => { cancelled = true; };
  }, []);

  // Hide products that already appear in the active search results to avoid
  // showing the same card twice on the same page.
  const youMightLike = useMemo(() => {
    if (!results) return [];
    const seen = new Set(results.map((p) => String(p.id)));
    return trending.filter((p) => !seen.has(String(p.id))).slice(0, 8);
  }, [results, trending]);

  return (
    <>
      <Seo title={t("shop.title")} description={t("shop.forYouSubtitle")} />

      {/* Search hero \u2014 doubles as a visual cue that this is the AI surface. */}
      <section className="relative bg-gradient-to-br from-brand-900 via-brand-700 to-accent-600 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-20">
          <div className="flex items-center gap-2 text-accent-300 text-xs font-bold uppercase tracking-widest">
            <Sparkles className="w-4 h-4" /> {t("shop.askAI")}
          </div>
          <h1 className="mt-3 text-3xl md:text-5xl font-extrabold tracking-tight">
            {t("shop.title")}
          </h1>
          <p className="mt-3 max-w-2xl text-white/80 text-lg">
            {q ? t("store.resultsFor", { q }) : t("shop.forYouSubtitle")}
          </p>

          {/* Inline search form pointing back at /shop so the page stays here. */}
          <form
            method="get"
            action="/shop"
            className="mt-7 flex items-center gap-2 max-w-2xl"
          >
            <div className="relative flex-1">
              <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder={t("shop.placeholder")}
                className="w-full pl-11 pr-4 py-3 rounded-xl text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 shadow-lg focus:outline-none focus:ring-2 focus:ring-accent-400"
              />
            </div>
            <button
              type="submit"
              className="px-5 py-3 rounded-xl bg-accent-500 hover:bg-accent-600 text-brand-950 font-semibold shadow-lg"
            >
              {t("nav.search")}
            </button>
          </form>
        </div>
      </section>

      {/* SEARCH RESULTS (only when there's a query) */}
      {(q || category) && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <header className="flex items-end justify-between mb-5">
            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 dark:text-gray-50">
              {t("shop.searchResults")}
            </h2>
            <Link
              to={`/store${q ? `?q=${encodeURIComponent(q)}` : category ? `?category=${encodeURIComponent(category)}` : ""}`}
              className="inline-flex items-center gap-1 text-brand-500 hover:text-brand-700 font-semibold text-sm"
            >
              {t("home.viewAll")} <ArrowRight className="w-4 h-4" />
            </Link>
          </header>

          {loadingResults ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)}
            </div>
          ) : results && results.length === 0 ? (
            <div className="rounded-2xl bg-surface-muted dark:bg-gray-900/60 py-12 text-center text-gray-500 dark:text-gray-400">
              {t("store.noResults")}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {(results ?? []).slice(0, 12).map((p) => (
                <ProductCard key={String(p.id)} product={p as never} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* RECENTLY VIEWED \u2014 only shown when the user has a history */}
      {!loadingRows && recent.length > 0 && (
        <section className={`${q ? "bg-surface-muted dark:bg-gray-900/40" : ""}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <header className="flex items-end justify-between mb-5">
              <div>
                <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 dark:text-gray-50">
                  {t("shop.forYou")}
                </h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{t("shop.forYouSubtitle")}</p>
              </div>
            </header>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-5">
              {recent.slice(0, 10).map((p) => (
                <ProductCard key={String(p.id)} product={p as never} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* TRENDING / YOU MIGHT ALSO LIKE */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <header className="flex items-end justify-between mb-5">
          <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 dark:text-gray-50">
            {q ? t("shop.youMightLike") : t("shop.trending")}
          </h2>
          <Link
            to="/store"
            className="inline-flex items-center gap-1 text-brand-500 hover:text-brand-700 font-semibold text-sm"
          >
            {t("home.viewAll")} <ArrowRight className="w-4 h-4" />
          </Link>
        </header>
        {loadingRows ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {(q ? youMightLike : trending).slice(0, 8).map((p) => (
              <ProductCard key={String(p.id)} product={p as never} />
            ))}
          </div>
        )}
      </section>
    </>
  );
};

export default ShopPage;
