import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ShoppingCart,
  ArrowLeft,
  Truck,
  ShieldCheck,
  RefreshCw,
  Minus,
  Plus,
  Heart,
  Star,
  CheckCircle,
  ThumbsUp,
  Share2,
  Package,
  Tag,
  ChevronRight,
  ChevronLeft,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { getProductById, listProductVariants } from "../api/products";
import { trackView } from "../api/recommend";
import type { Variant } from "../api/products";
import { useCart } from "../store/CartContext";
import type { Product } from "../types";
import { API_URL, toAbsoluteUrl } from "../api/config";
import { Seo } from "../components/common/Seo";
import { addItemToWishCar } from "../api/wishcar";
import toast from "react-hot-toast";
import { ProductCard } from "../components/features/ProductCard";

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface ReviewItem {
  id: string;
  user_id: string;
  rating: number;
  comment: string;
  created_at: string;
  verified_purchase: boolean;
  helpful_count: number;
  images: string[];
}

interface ReviewSummary {
  items: ReviewItem[];
  average: number;
  total: number;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function StarRow({
  value,
  size = "md",
  onChange,
}: {
  value: number;
  size?: "sm" | "md" | "lg";
  onChange?: (v: number) => void;
}) {
  const [hover, setHover] = useState(0);
  const cls =
    size === "lg" ? "w-7 h-7" : size === "sm" ? "w-3.5 h-3.5" : "w-5 h-5";
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`${cls} cursor-pointer transition-colors ${
            n <= (hover || value)
              ? "fill-yellow-400 text-yellow-400"
              : "fill-gray-200 text-gray-200"
          }`}
          onMouseEnter={() => onChange && setHover(n)}
          onMouseLeave={() => onChange && setHover(0)}
          onClick={() => onChange?.(n)}
        />
      ))}
    </span>
  );
}

function RatingBar({
  star,
  count,
  total,
}: {
  star: number;
  count: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-5 text-right text-gray-700 dark:text-gray-300">{star}</span>
      <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400 flex-shrink-0" />
      <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
        <div
          className="h-full rounded-full bg-yellow-400"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-7 text-gray-500 dark:text-gray-400">{count}</span>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */

export const ProductsPage = () => {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { dispatch } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [liked, setLiked] = useState(false);
  const [related, setRelated] = useState<Product[]>([]);

  // Gallery
  const [galleryUrls, setGalleryUrls] = useState<string[]>([]);
  const [activeImg, setActiveImg] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxZoom, setLightboxZoom] = useState(1);

  // Variants
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selectedAttrs, setSelectedAttrs] = useState<Record<string, string>>({});
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null);

  const [reviews, setReviews] = useState<ReviewSummary>({
    items: [],
    average: 0,
    total: 0,
  });
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [ratingDist, setRatingDist] = useState<Record<number, number>>({
    1: 0, 2: 0, 3: 0, 4: 0, 5: 0,
  });
  const [userHasReview, setUserHasReview] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [newRating, setNewRating] = useState(0);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reviewRef = useRef<HTMLDivElement>(null);
  const token = localStorage.getItem("authToken");

  useEffect(() => {
    if (!productId) return;
    setLoading(true);
    getProductById(productId)
      .then((data) => {
        // Build gallery from all images returned by backend
        const rawImages: string[] = Array.isArray((data as any).images) && (data as any).images.length > 0
          ? (data as any).images
          : data.url
          ? [data.url]
          : [];
        const fullUrls = rawImages.length > 0
          ? rawImages.map(toAbsoluteUrl)
          : ["/placeholder.svg"];
        setGalleryUrls(fullUrls);
        setActiveImg(0);

        const normalized: Product = {
          ...data,
          server_image_url: fullUrls[0],
          images: fullUrls.map((u) => ({ url: u, alt: data.name })),
          variations: [],
          ratings: [],
          shipping: { estimatedDays: 3, cost: 5.99 },
        } as unknown as Product;
        setProduct(normalized);
      })
      .catch(() => setError("Product not found"))
      .finally(() => setLoading(false));
  }, [productId]);

  // Fetch variants
  useEffect(() => {
    if (!productId) return;
    listProductVariants(productId)
      .then((v) => setVariants(v))
      .catch(() => {});
  }, [productId]);

  // Track view for personalization (powers Shop "For you").
  useEffect(() => {
    if (productId) void trackView(productId);
  }, [productId]);

  useEffect(() => {
    if (!productId) return;
    setReviewsLoading(true);
    fetch(`${API_URL}/products/${productId}/reviews`)
      .then((r) => r.json())
      .then((d: ReviewSummary) => {
        setReviews(d);
        const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        (d.items || []).forEach((it) => {
          dist[it.rating] = (dist[it.rating] || 0) + 1;
        });
        setRatingDist(dist);
      })
      .catch(() => {})
      .finally(() => setReviewsLoading(false));
  }, [productId]);

  useEffect(() => {
    if (!productId) return;
    fetch(`${API_URL}/products/${productId}/related`)
      .then((r) => r.json())
      .then((data: unknown) => {
        const arr = Array.isArray(data) ? data : [];
        setRelated(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          arr.slice(0, 4).map((p: any) => ({
            ...p,
            server_image_url: p.url ? toAbsoluteUrl(p.url) : "/placeholder.svg",
            images: [],
            variations: [],
            ratings: [],
            shipping: { estimatedDays: 3, cost: 5.99 },
          } as unknown as Product))
        );
      })
      .catch(() => {});
  }, [productId]);

  // Lightbox keyboard & scroll handlers
  const closeLightbox = useCallback(() => {
    setLightboxOpen(false);
    setLightboxZoom(1);
  }, []);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowRight") setActiveImg((i) => (i + 1) % galleryUrls.length);
      if (e.key === "ArrowLeft") setActiveImg((i) => (i - 1 + galleryUrls.length) % galleryUrls.length);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setLightboxZoom((z) => Math.min(4, Math.max(1, z - e.deltaY * 0.001)));
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", onWheel);
    };
  }, [lightboxOpen, galleryUrls.length, closeLightbox]);

  const refreshReviews = async () => {
    const d: ReviewSummary = await fetch(
      `${API_URL}/products/${productId}/reviews`
    ).then((r) => r.json());
    setReviews(d);
    const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    (d.items || []).forEach((it: ReviewItem) => {
      dist[it.rating] = (dist[it.rating] || 0) + 1;
    });
    setRatingDist(dist);
  };

  const submitReview = async () => {
    if (!token) {
      sessionStorage.setItem("returnUrl", `/products/${productId}`);
      navigate("/login");
      return;
    }
    if (newRating === 0) {
      toast.error("Please select a rating.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/products/${productId}/reviews`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rating: newRating, comment: newComment }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { verified_purchase } = await res.json();
      toast.success(
        verified_purchase
          ? "Review posted as verified purchase!"
          : "Review posted!"
      );
      setFormOpen(false);
      setNewRating(0);
      setNewComment("");
      setUserHasReview(true);
      await refreshReviews();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not post review.");
    } finally {
      setSubmitting(false);
    }
  };

  const addToCart = async () => {
    if (!product) return;
    const enriched: Product = {
      ...product,
      server_image_url: product.url ? toAbsoluteUrl(product.url) : "/placeholder.svg",
    };
    for (let i = 0; i < qty; i++) {
      dispatch({ type: "ADD_ITEM", payload: enriched });
    }
    if (token) {
      try {
        await addItemToWishCar(String(product.id), qty);
        toast.success(`Added ${qty}× "${product.name}" to cart`);
      } catch {
        toast.error("Could not sync cart. Please try again.");
      }
    } else {
      toast.success(`Added ${qty}× "${product.name}" to cart`);
    }
  };

  // When attribute selection changes, try to find a matching variant
  const selectAttr = (key: string, value: string) => {
    const next = { ...selectedAttrs, [key]: value };
    setSelectedAttrs(next);
    const match = variants.find((v) =>
      Object.entries(next).every(([k, val]) => v.attributes?.[k] === val)
    );
    setSelectedVariant(match ?? null);
  };

  // Attribute keys across all variants
  const attrKeys = Array.from(
    new Set(variants.flatMap((v) => Object.keys(v.attributes ?? {})))
  );
  const attrValues = (key: string) =>
    Array.from(new Set(variants.map((v) => v.attributes?.[key]).filter(Boolean)));

  const markHelpful = async (reviewId: string) => {
    if (!token) { toast("Sign in to mark reviews helpful."); return; }
    await fetch(`${API_URL}/reviews/${reviewId}/helpful`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    setReviews((prev) => ({
      ...prev,
      items: prev.items.map((it) =>
        it.id === reviewId ? { ...it, helpful_count: it.helpful_count + 1 } : it
      ),
    }));
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid md:grid-cols-2 gap-10">
          <div className="aspect-square rounded-2xl bg-gray-200 animate-pulse" />
          <div className="space-y-4">
            <div className="h-8 w-2/3 bg-gray-200 rounded animate-pulse" />
            <div className="h-6 w-1/3 bg-gray-200 rounded animate-pulse" />
            <div className="h-24 bg-gray-200 rounded animate-pulse" />
            <div className="h-12 bg-gray-200 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{t('product.notFound')}</h1>
        <p className="mt-2 text-gray-500 dark:text-gray-400">{error || t('product.notFoundSub')}</p>
        <Link to="/store" className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-semibold">
          <ArrowLeft className="w-4 h-4" /> {t('product.backToStore')}
        </Link>
      </div>
    );
  }

  const stock = selectedVariant ? selectedVariant.stock : (product?.stock ?? 0);
  const inStock = stock > 0;
  const displayPrice = selectedVariant?.price ?? Number(product?.price ?? 0);
  const imgSrc = galleryUrls[activeImg] || "/placeholder.svg";
  const avgRating = reviews.average ?? 0;

  return (
    <>
      <Seo title={product.name} description={product.description?.slice(0, 160)} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-16">
        {/* Breadcrumb */}
        <nav className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2 flex-wrap">
          <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 hover:text-brand-500">
            <ArrowLeft className="w-4 h-4" /> {t('product.back')}
          </button>
          <ChevronRight className="w-3 h-3" />
          <Link to="/store" className="hover:text-brand-500">{t('product.store')}</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-gray-900 dark:text-gray-100 font-medium truncate max-w-xs">{product.name}</span>
        </nav>

        {/* Product hero */}
        <div className="grid md:grid-cols-2 gap-10 items-start">
          {/* Gallery */}
          <div className="sticky top-24 flex flex-col gap-3">
            <div className="relative aspect-square rounded-2xl overflow-hidden bg-gradient-to-br from-brand-50 to-brand-100 shadow-card group">
              <img
                src={imgSrc}
                alt={product.name}
                className="absolute inset-0 w-full h-full object-cover cursor-zoom-in"
                onClick={() => setLightboxOpen(true)}
                onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }}
              />
              {/* Zoom hint overlay */}
              <div className="absolute top-2 right-2 bg-black/40 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition pointer-events-none">
                <ZoomIn className="w-4 h-4" />
              </div>
              {!inStock && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <span className="text-white font-bold text-2xl bg-black/50 px-6 py-2 rounded-full">Out of stock</span>
                </div>
              )}
              {galleryUrls.length > 1 && (
                <>
                  <button
                    aria-label="Previous image"
                    onClick={() => setActiveImg((i) => (i - 1 + galleryUrls.length) % galleryUrls.length)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-white dark:bg-gray-800/80 hover:bg-white dark:bg-gray-800 rounded-full p-1.5 shadow opacity-0 group-hover:opacity-100 transition"
                  >
                    <ChevronLeft className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                  </button>
                  <button
                    aria-label="Next image"
                    onClick={() => setActiveImg((i) => (i + 1) % galleryUrls.length)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-white dark:bg-gray-800/80 hover:bg-white dark:bg-gray-800 rounded-full p-1.5 shadow opacity-0 group-hover:opacity-100 transition"
                  >
                    <ChevronRight className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                  </button>
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                    {galleryUrls.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActiveImg(idx)}
                        className={`w-2 h-2 rounded-full transition ${idx === activeImg ? "bg-white dark:bg-gray-800" : "bg-white dark:bg-gray-800/50"}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
            {/* Thumbnails */}
            {galleryUrls.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {galleryUrls.map((url, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveImg(idx)}
                    className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition ${
                      idx === activeImg ? "border-brand-500" : "border-gray-200 dark:border-gray-700 hover:border-brand-300"
                    }`}
                  >
                    <img src={url} alt={`${product.name} ${idx + 1}`} className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }} />
                  </button>
                ))}
              </div>
            )}
            <button
              className="inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-brand-500"
              onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success(t('product.linkCopied')); }}
            >
              <Share2 className="w-4 h-4" /> {t('product.share')}
            </button>
          </div>

          {/* Buy box */}
          <div className="flex flex-col gap-5">
            <div>
              {product.category && (
                <Link to={`/store?cat=${product.category}`} className="inline-flex items-center gap-1 text-xs uppercase tracking-wider text-brand-500 font-semibold hover:underline">
                  <Tag className="w-3.5 h-3.5" /> {product.category}
                </Link>
              )}
              <h1 className="mt-1 text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-gray-100">{product.name}</h1>
            </div>

            {reviews.total > 0 && (
              <button
                onClick={() => reviewRef.current?.scrollIntoView({ behavior: "smooth" })}
                className="inline-flex items-center gap-2 text-sm hover:underline w-fit"
              >
                <StarRow value={Math.round(avgRating)} size="sm" />
                <span className="text-brand-600 font-semibold">{avgRating.toFixed(1)}</span>
                <span className="text-gray-500 dark:text-gray-400">({reviews.total} review{reviews.total !== 1 ? "s" : ""})</span>
              </button>
            )}

            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-extrabold text-brand-700">${displayPrice.toFixed(2)}</span>
              <span className={`text-sm font-medium ${inStock ? "text-green-600" : "text-red-500"}`}>
                {inStock ? t('product.inStock', { n: stock }) : t('product.outOfStock')}
              </span>
            </div>

            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{product.description || "No description provided."}</p>

            {/* Variant picker */}
            {attrKeys.length > 0 && (
              <div className="space-y-4 border border-gray-100 dark:border-gray-700 rounded-xl p-4 bg-surface-muted">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Options</h3>
                {attrKeys.map((key) => (
                  <div key={key} className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {key}: <span className="text-gray-900 dark:text-gray-100 normal-case">{selectedAttrs[key] || "—"}</span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {attrValues(key).map((val) => {
                        const isSelected = selectedAttrs[key] === val;
                        const variantAvailable = variants.some(
                          (v) => v.attributes?.[key] === val && v.stock > 0
                        );
                        return (
                          <button
                            key={val}
                            onClick={() => selectAttr(key, val as string)}
                            disabled={!variantAvailable}
                            className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition ${
                              isSelected
                                ? "bg-brand-500 text-white border-brand-500"
                                : variantAvailable
                                ? "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-brand-400"
                                : "border-gray-200 dark:border-gray-700 text-gray-300 cursor-not-allowed line-through"
                            }`}
                          >
                            {val}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {selectedVariant && (
                  <p className="text-xs text-green-600 font-medium flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    SKU: {selectedVariant.sku}
                  </p>
                )}
              </div>
            )}

            {/* Quantity */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('product.qty')}</span>
              <div className="inline-flex items-center rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800">
                <button aria-label="Decrease quantity" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} className="p-2 hover:bg-gray-50 dark:bg-gray-900 disabled:opacity-50">
                  <Minus className="w-4 h-4" />
                </button>
                <span className="px-4 text-sm font-semibold w-10 text-center">{qty}</span>
                <button aria-label="Increase quantity" onClick={() => setQty((q) => Math.min(stock || 99, q + 1))} disabled={qty >= (stock || 99)} className="p-2 hover:bg-gray-50 dark:bg-gray-900 disabled:opacity-50">                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* CTAs */}
            <div className="flex gap-3">
              <button
                onClick={addToCart}
                disabled={!inStock}
                className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold shadow-lg shadow-brand-500/20 transition"
              >
                <ShoppingCart className="w-5 h-5" /> {t('product.addToCart')}
              </button>
              <button
                onClick={() => setLiked((v) => !v)}
                aria-pressed={liked}
                aria-label="Add to wishlist"
                className={`p-3 rounded-lg border transition ${liked ? "bg-red-500 text-white border-red-500" : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:bg-gray-900"}`}
              >
                <Heart className={`w-5 h-5 ${liked ? "fill-current" : ""}`} />
              </button>
            </div>

            {/* Trust strip */}
            <div className="grid grid-cols-3 gap-3 mt-1 text-xs">
              {[
                { icon: Truck, label: "Free shipping", d: "Over $50" },
                { icon: ShieldCheck, label: "Secure", d: "256-bit SSL" },
                { icon: RefreshCw, label: "30-day", d: "Free returns" },
              ].map(({ icon: Icon, label, d }) => (
                <div key={label} className="rounded-xl border border-gray-100 dark:border-gray-700 bg-surface-muted p-3 flex items-start gap-2">
                  <Icon className="w-4 h-4 text-brand-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{label}</p>
                    <p className="text-gray-500 dark:text-gray-400">{d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Product characteristics */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-card p-6 md:p-8">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center gap-2">
            <Package className="w-5 h-5 text-brand-500" /> Product details
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { label: "Product ID", value: product.id },
              { label: "Price", value: `$${displayPrice.toFixed(2)}` },
              { label: "Stock", value: stock > 0 ? `${stock} units` : "Out of stock" },
              { label: "Availability", value: inStock ? "In stock" : "Out of stock" },
              { label: "Category", value: product.category || "General" },
              { label: "Shipping", value: `${product.shipping?.estimatedDays ?? 3} business days` },
              { label: "Free shipping", value: `Orders over $${product.shipping?.freeShippingThreshold ?? 50}` },
              { label: "Returns", value: "30-day free returns" },
              { label: "Warranty", value: product.warranty || "Not specified" },
              ...(selectedVariant
                ? [{ label: "Selected SKU", value: selectedVariant.sku }]
                : []),
            ].map(({ label, value }) => (
              <div key={label} className="flex flex-col gap-0.5 rounded-xl bg-surface-muted px-4 py-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</span>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{value}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Reviews */}
        <section ref={reviewRef} className="space-y-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('product.reviews')}</h2>
            {!userHasReview && (
              <button
                onClick={() => {
                  if (!token) { sessionStorage.setItem("returnUrl", `/products/${productId}`); navigate("/login"); return; }
                  setFormOpen((v) => !v);
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold shadow"
              >
                <Star className="w-4 h-4" /> {t('product.writeReview')}
              </button>
            )}
          </div>

          {reviews.total > 0 && (
            <div className="flex flex-col sm:flex-row gap-8 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-card p-6">
              <div className="flex flex-col items-center justify-center min-w-[100px]">
                <span className="text-6xl font-extrabold text-brand-700">{avgRating.toFixed(1)}</span>
                <StarRow value={Math.round(avgRating)} size="md" />
                <span className="mt-1 text-sm text-gray-500 dark:text-gray-400">{reviews.total} review{reviews.total !== 1 ? "s" : ""}</span>
              </div>
              <div className="flex-1 space-y-1.5">
                {[5, 4, 3, 2, 1].map((star) => (
                  <RatingBar key={star} star={star} count={ratingDist[star] || 0} total={reviews.total} />
                ))}
              </div>
            </div>
          )}

          {formOpen && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-brand-100 shadow-card p-6 space-y-4">
              <h3 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Your review</h3>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Rating</label>
                <StarRow value={newRating} size="lg" onChange={setNewRating} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Comment <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                  placeholder="Share your experience with this product…"
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                Verified purchase badge is awarded automatically when you have a completed order for this product.
              </p>
              <div className="flex gap-3">
                <button onClick={submitReview} disabled={submitting} className="px-5 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:bg-gray-400 text-white text-sm font-semibold">
                  {submitting ? t('product.submitting') : t('product.postReview')}
                </button>
                <button onClick={() => setFormOpen(false)} className="px-5 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:bg-gray-900">
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          )}

          {reviewsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => <div key={i} className="h-28 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />)}
            </div>
          ) : reviews.items.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-card">
              <Star className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">{t('product.noReviews')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {reviews.items.map((review) => (
                <article key={review.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-card p-5 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-sm select-none">
                        {review.user_id.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <StarRow value={review.rating} size="sm" />
                          {review.verified_purchase && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                              <CheckCircle className="w-3 h-3" /> Verified purchase
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(review.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => markHelpful(review.id)}
                      className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-brand-500 border border-gray-200 dark:border-gray-700 rounded-full px-3 py-1 hover:border-brand-300"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                      {t('product.helpful')} {review.helpful_count > 0 && `(${review.helpful_count})`}
                    </button>
                  </div>
                  {review.comment && <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">{review.comment}</p>}
                  {review.images && review.images.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {review.images.map((img, idx) => (
                        <img key={idx} src={img} alt={`Review image ${idx + 1}`} className="w-16 h-16 object-cover rounded-lg border border-gray-200 dark:border-gray-700"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Related products */}
        {related.length > 0 && (
          <section className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('product.related')}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {related.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          </section>
        )}
      </div>

      {/* ── Lightbox ── */}
      {lightboxOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Image zoom viewer"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={closeLightbox}
        >
          {/* toolbar */}
          <div className="absolute top-4 right-4 flex gap-2 z-10" onClick={(e) => e.stopPropagation()}>
            <button
              aria-label="Zoom in"
              onClick={() => setLightboxZoom((z) => Math.min(4, z + 0.5))}
              className="bg-white dark:bg-gray-800/20 hover:bg-white dark:bg-gray-800/40 text-white rounded-full p-2 transition"
            >
              <ZoomIn className="w-5 h-5" />
            </button>
            <button
              aria-label="Zoom out"
              onClick={() => setLightboxZoom((z) => Math.max(1, z - 0.5))}
              className="bg-white dark:bg-gray-800/20 hover:bg-white dark:bg-gray-800/40 text-white rounded-full p-2 transition"
            >
              <ZoomOut className="w-5 h-5" />
            </button>
            <button
              aria-label="Close lightbox"
              onClick={closeLightbox}
              className="bg-white dark:bg-gray-800/20 hover:bg-white dark:bg-gray-800/40 text-white rounded-full p-2 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* prev/next */}
          {galleryUrls.length > 1 && (
            <>
              <button
                aria-label="Previous image"
                onClick={(e) => { e.stopPropagation(); setActiveImg((i) => (i - 1 + galleryUrls.length) % galleryUrls.length); }}
                className="absolute left-4 bg-white dark:bg-gray-800/20 hover:bg-white dark:bg-gray-800/40 text-white rounded-full p-3 transition"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                aria-label="Next image"
                onClick={(e) => { e.stopPropagation(); setActiveImg((i) => (i + 1) % galleryUrls.length); }}
                className="absolute right-4 bg-white dark:bg-gray-800/20 hover:bg-white dark:bg-gray-800/40 text-white rounded-full p-3 transition"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}

          {/* image */}
          <img
            src={imgSrc}
            alt={product.name}
            onClick={(e) => e.stopPropagation()}
            style={{ transform: `scale(${lightboxZoom})`, transition: "transform 0.15s ease", cursor: lightboxZoom > 1 ? "grab" : "zoom-in" }}
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg select-none"
            onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }}
          />

          {/* counter & scroll hint */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
            {galleryUrls.length > 1 && (
              <span className="text-white/70 text-sm">{activeImg + 1} / {galleryUrls.length}</span>
            )}
            <span className="text-white/50 text-xs">Scroll to zoom · Esc to close</span>
          </div>
        </div>
      )}
    </>
  );
};

export default ProductsPage;
