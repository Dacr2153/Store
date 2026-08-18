import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ShieldCheck,
  Truck,
  Headphones,
  Sparkles,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Shirt,
  Cpu,
  Home as HomeIcon,
  Heart,
  Dumbbell,
  BookOpen,
  Gamepad2,
  Car,
} from "lucide-react";
import { ProductCard } from "../components/features/ProductCard";
import { Seo } from "../components/common/Seo";
import { listProducts, type Product as ApiProduct } from "../api/products";

/**
 * HomePage — landing page with one horizontal product carousel per category.
 *
 * Layout (top → bottom):
 *   1. Hero with gradient + dual CTAs
 *   2. Trust strip (4 value props)
 *   3. Featured category tiles
 *   4. One carousel per category, fetching top products from /products?category=
 *   5. "Become a seller" promo
 *   6. Testimonials
 *
 * Carousels load lazily in parallel; failures degrade silently (section hidden).
 * All visible strings go through i18n so the language toggle works site-wide.
 */

interface CategoryDef {
  slug: string;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
}

// Slugs match the backend `categories.slug` column (migration 000001).
const CATEGORIES: CategoryDef[] = [
  { slug: "electronics",  icon: Cpu,      gradient: "from-brand-500 to-brand-700" },
  { slug: "fashion",      icon: Shirt,    gradient: "from-accent-500 to-accent-600" },
  { slug: "home-kitchen", icon: HomeIcon, gradient: "from-brand-400 to-brand-600" },
  { slug: "beauty",       icon: Heart,    gradient: "from-pink-500 to-rose-600" },
  { slug: "sports",       icon: Dumbbell, gradient: "from-emerald-500 to-teal-700" },
  { slug: "books",        icon: BookOpen, gradient: "from-amber-500 to-orange-700" },
  { slug: "toys",         icon: Gamepad2, gradient: "from-violet-500 to-purple-700" },
  { slug: "automotive",   icon: Car,      gradient: "from-slate-600 to-slate-900" },
];

// Per-category carousel. Owns its own data fetch + horizontal scroll state.
const CategoryCarousel: React.FC<{ slug: string }> = ({ slug }) => {
  const { t } = useTranslation();
  const [items, setItems] = useState<ApiProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    listProducts(0, undefined, slug)
      .then((r) => {
        if (!cancelled) setItems(r.slice(0, 10));
      })
      .catch(() => { /* ignore */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug]);

  // Hide the section entirely when there is nothing to show, keeping the home
  // page tidy for very empty catalogs.
  if (!loading && items.length === 0) return null;

  const scroll = (dir: 1 | -1) => {
    const el = railRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: "smooth" });
  };

  const catLabel = t(`cat.${slug}` as const, { defaultValue: slug });

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <header className="flex items-end justify-between mb-5">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 dark:text-gray-50">
            {t("home.section.top", { cat: catLabel })}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Scroll left"
            onClick={() => scroll(-1)}
            className="hidden sm:grid place-items-center w-9 h-9 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition shadow-sm"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label="Scroll right"
            onClick={() => scroll(1)}
            className="hidden sm:grid place-items-center w-9 h-9 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition shadow-sm"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <Link
            to={`/store?category=${encodeURIComponent(slug)}`}
            className="inline-flex items-center gap-1 text-brand-500 hover:text-brand-700 font-semibold text-sm ml-2"
          >
            {t("home.viewAll")} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </header>

      <div
        ref={railRef}
        className="flex gap-5 overflow-x-auto snap-x snap-mandatory pb-2 -mx-2 px-2 scrollbar-thin"
        style={{ scrollbarWidth: "thin" }}
      >
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="snap-start shrink-0 w-56 sm:w-64 rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse aspect-[3/4]"
              />
            ))
          : items.map((p) => (
              <div key={String(p.id)} className="snap-start shrink-0 w-56 sm:w-64">
                <ProductCard product={p as never} />
              </div>
            ))}
      </div>
    </section>
  );
};

export const HomePage: React.FC = () => {
  const { t } = useTranslation();

  return (
    <>
      <Seo title={t("nav.home")} description={t("home.hero.subtitle")} />

      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-950 via-brand-800 to-brand-500 text-white">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 -left-24 w-96 h-96 rounded-full bg-accent-500/20 blur-3xl" />
          <div className="absolute -bottom-32 -right-24 w-[28rem] h-[28rem] rounded-full bg-brand-400/20 blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur text-xs font-semibold tracking-wider uppercase">
              <Sparkles className="w-3.5 h-3.5 text-accent-400" />
              {t("home.hero.badge")}
            </span>
            <h1 className="mt-5 text-4xl md:text-6xl font-extrabold leading-tight tracking-tight">
              {t("home.hero.title").replace(t("home.hero.titleHighlight"), "")}{" "}
              <span className="bg-gradient-to-r from-accent-400 to-accent-500 bg-clip-text text-transparent">
                {t("home.hero.titleHighlight")}
              </span>
            </h1>
            <p className="mt-5 max-w-lg text-lg text-white/80">
              {t("home.hero.subtitle")}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/store"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-accent-500 hover:bg-accent-600 text-brand-950 font-semibold shadow-lg shadow-accent-500/30 transition"
              >
                {t("home.hero.shopNow")} <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/shop"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold backdrop-blur transition"
              >
                {t("home.hero.exploreFeatured")}
              </Link>
            </div>

            <dl className="mt-10 grid grid-cols-3 gap-6 max-w-md">
              {[
                ["10k+", t("home.stats.products")],
                ["4.8★", t("home.stats.rating")],
                ["24/7", t("home.stats.support")],
              ].map(([v, l]) => (
                <div key={l}>
                  <dt className="text-2xl font-bold">{v}</dt>
                  <dd className="text-xs text-white/60 uppercase tracking-wider">{l}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="hidden md:block relative h-96">
            <div className="absolute inset-0 grid grid-cols-2 gap-4 rotate-2">
              {[
                { tag: "Trending", k: "cat.electronics", from: "from-white/20", to: "to-white/5", off: "" },
                { tag: "New",      k: "cat.fashion",     from: "from-accent-500/40", to: "to-accent-500/10", off: "translate-y-8" },
                { tag: "Sale",     k: "cat.home-kitchen", from: "from-brand-400/40", to: "to-brand-400/10", off: "-translate-y-4" },
                { tag: "Hot",      k: "cat.beauty",      from: "from-white/10", to: "to-white/0", off: "translate-y-4" },
              ].map((card) => (
                <div key={card.k} className={`rounded-2xl bg-gradient-to-br ${card.from} ${card.to} backdrop-blur p-6 flex items-end shadow-2xl ${card.off}`}>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-accent-400">{card.tag}</p>
                    <p className="text-2xl font-bold">{t(card.k)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* TRUST STRIP */}
      <section className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { icon: Truck,        t: t("home.trust.shipping"), d: t("home.trust.shippingDesc") },
            { icon: ShieldCheck,  t: t("home.trust.secure"),   d: t("home.trust.secureDesc") },
            { icon: Sparkles,     t: t("home.trust.curated"),  d: t("home.trust.curatedDesc") },
            { icon: Headphones,   t: t("home.trust.support"),  d: t("home.trust.supportDesc") },
          ].map(({ icon: Icon, t: label, d }) => (
            <div key={label} className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-lg bg-brand-50 dark:bg-brand-900/40 text-brand-500 grid place-items-center">
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-50">{label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CATEGORY TILE GRID */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <header className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-3xl font-extrabold text-gray-900 dark:text-gray-50">
              {t("home.categories.title")}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              {t("home.categories.subtitle")}
            </p>
          </div>
        </header>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {CATEGORIES.map(({ slug, icon: Icon, gradient }) => (
            <Link
              key={slug}
              to={`/store?category=${encodeURIComponent(slug)}`}
              className="group relative h-32 rounded-2xl overflow-hidden shadow-card hover:shadow-card-hover transition-shadow"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`} />
              <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition" />
              <div className="absolute inset-0 p-4 flex flex-col justify-between text-white">
                <Icon className="w-7 h-7 opacity-90" />
                <div>
                  <p className="text-lg font-bold">{t(`cat.${slug}`)}</p>
                  <p className="inline-flex items-center gap-1 text-xs text-white/80 group-hover:text-white">
                    {t("home.viewAll")} <ArrowRight className="w-3.5 h-3.5" />
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* PER-CATEGORY CAROUSELS — alternates plain / muted backgrounds */}
      {CATEGORIES.map((c, i) => (
        <div
          key={c.slug}
          className={i % 2 === 1 ? "bg-surface-muted dark:bg-gray-900/40" : ""}
        >
          <CategoryCarousel slug={c.slug} />
        </div>
      ))}

      {/* PROMO — sell with us */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="rounded-3xl bg-gradient-to-r from-brand-700 to-brand-500 text-white p-10 md:p-14 flex flex-col md:flex-row items-center justify-between gap-6 shadow-card-hover">
          <div className="max-w-xl">
            <h2 className="text-3xl font-extrabold">{t("home.promo.title")}</h2>
            <p className="text-white/80 mt-2">{t("home.promo.subtitle")}</p>
          </div>
          <Link
            to="/business-registration"
            className="px-6 py-3 rounded-lg bg-accent-500 hover:bg-accent-600 text-brand-950 font-semibold shadow-lg whitespace-nowrap"
          >
            {t("home.promo.cta")}
          </Link>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <header className="text-center mb-10">
          <h2 className="text-3xl font-extrabold text-gray-900 dark:text-gray-50">
            {t("home.testimonials.title")}
          </h2>
        </header>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { q: "Checkout was a breeze and items arrived in 2 days. Highly recommended.", a: "Sara M." },
            { q: "Best UX I've seen on a marketplace this year. The product pages are gorgeous.", a: "Daniel R." },
            { q: "Customer support resolved my refund in minutes. Will buy again.", a: "Carolina P." },
          ].map(({ q, a }) => (
            <figure
              key={a}
              className="rounded-2xl bg-white dark:bg-gray-800 shadow-card p-6 border border-gray-100 dark:border-gray-700"
            >
              <blockquote className="text-gray-700 dark:text-gray-200">“{q}”</blockquote>
              <figcaption className="mt-4 text-sm font-semibold text-brand-500">— {a}</figcaption>
            </figure>
          ))}
        </div>
      </section>
    </>
  );
};

export default HomePage;
