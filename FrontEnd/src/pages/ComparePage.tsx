import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Trash2, X, ShoppingCart, Star, AlertTriangle, Sparkles, ChevronRight, Heart, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import { useCompareStore } from "../store/CompareStore";
import type { CompareItem } from "../store/CompareStore";
import { useCart } from "../store/CartContext";
import { useWishlistStore } from "../store/WishlistStore";
import { API_URL, toAbsoluteUrl } from "../api/config";
import toast from "react-hot-toast";

/* ── types ────────────────────────────────────────────────────────────── */
interface ReviewItem {
  rating: number;
  verified_purchase: boolean;
  helpful_count: number;
  created_at: string;
}

interface ReviewData {
  items: ReviewItem[];
  average: number;
  total: number;
}

/* ── fraud detection ─────────────────────────────────────────────────── */
type FraudLabel = "reliable" | "suspicious" | "likely_fake" | "no_data";

interface FraudAnalysis {
  fraudScore: number;       // 0-100: higher = more suspicious
  verifiedRatio: number;    // 0-1
  concentration: number;    // 0-1: how many reviews share the same single rating
  wilsonLower: number;      // statistical lower bound for quality
  label: FraudLabel;
}

function wilsonLower(positive: number, total: number, z = 1.96): number {
  if (total === 0) return 0;
  const p = positive / total;
  return (
    (p + (z * z) / (2 * total) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total)) /
    (1 + (z * z) / total)
  );
}

function detectFraud(reviewItems: ReviewItem[], summary: ReviewData): FraudAnalysis {
  if (reviewItems.length === 0) {
    return { fraudScore: 0, verifiedRatio: 0, concentration: 0, wilsonLower: 0, label: "no_data" };
  }

  // Verified purchase ratio
  const verifiedCount = reviewItems.filter((r) => r.verified_purchase).length;
  const verifiedRatio = verifiedCount / reviewItems.length;

  // Rating concentration: share of reviews with the most-common single rating
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  reviewItems.forEach((r) => { counts[r.rating] = (counts[r.rating] ?? 0) + 1; });
  const maxCount = Math.max(...Object.values(counts));
  const concentration = maxCount / reviewItems.length;

  // Average helpfulness per review (low helpfulness → reviews may be fake/low-quality)
  const avgHelpful = reviewItems.reduce((acc, r) => acc + r.helpful_count, 0) / reviewItems.length;

  // Wilson lower bound for positive (4+) reviews
  const positiveCount = reviewItems.filter((r) => r.rating >= 4).length;
  const wilson = wilsonLower(positiveCount, reviewItems.length);

  // Build fraud score
  let score = 0;

  // Unverified reviews are suspicious
  score += Math.round((1 - verifiedRatio) * 35);

  // Heavily concentrated ratings (>80% same score) are a red flag
  if (concentration > 0.85) score += 30;
  else if (concentration > 0.70) score += 15;
  else if (concentration > 0.55) score += 7;

  // No reviews found helpful (with >5 reviews) is suspicious
  if (reviewItems.length > 5 && avgHelpful < 0.5) score += 20;
  else if (reviewItems.length > 10 && avgHelpful < 1.5) score += 10;

  // Statistically improbable perfect scores with many reviews
  if (summary.average > 4.85 && summary.total > 15) score += 15;

  score = Math.min(100, Math.round(score));
  const label: FraudLabel =
    score < 30 ? "reliable" : score < 60 ? "suspicious" : "likely_fake";

  return { fraudScore: score, verifiedRatio, concentration, wilsonLower: wilson, label };
}

interface Enriched extends CompareItem {
  reviews: ReviewData;
  score: number;
  breakdown: {
    ratingQuality: number;
    popularity: number;
    valueMoney: number;
    availability: number;
    wishlistBoost: number;
  };
  fraud: FraudAnalysis;
  inWishlist: boolean;
}

/* ── scoring ──────────────────────────────────────────────────────────── */
function computeScores(
  items: CompareItem[],
  reviewDataList: ReviewData[],
  wishlistIds: Set<string>
): Enriched[] {
  const maxReviews = Math.max(...reviewDataList.map((r) => r.total), 1);
  const maxPrice = Math.max(...items.map((i) => i.price), 1);

  return items.map((item, idx) => {
    const rev = reviewDataList[idx];
    const fraud = detectFraud(rev.items, rev);

    // Rating quality: adjusted by Wilson lower bound confidence when fraud is detected
    const fraudPenalty = fraud.label === "likely_fake" ? 0.5 : fraud.label === "suspicious" ? 0.75 : 1.0;
    const effectiveAvg = rev.average * fraudPenalty;
    const reliability = rev.total > 0 ? Math.log(rev.total + 1) / Math.log(maxReviews + 1) : 0;
    const ratingQuality = Math.round(((effectiveAvg / 5) * 0.7 + reliability * 0.3) * 40);

    const popularity = Math.round((Math.min(rev.total, maxReviews) / maxReviews) * 20);

    const valueRaw =
      effectiveAvg > 0
        ? (effectiveAvg / 5) * (0.5 + 0.5 * (1 - item.price / maxPrice))
        : 0.5 * (0.5 + 0.5 * (1 - item.price / maxPrice));
    const valueMoney = Math.round(valueRaw * 25);

    const stock = item.stock ?? 0;
    const availability = stock <= 0 ? 0 : stock < 5 ? 8 : 15;

    const inWishlist = wishlistIds.has(String(item.id));
    const wishlistBoost = inWishlist ? 5 : 0;

    const breakdown = { ratingQuality, popularity, valueMoney, availability, wishlistBoost };
    return {
      ...item,
      reviews: rev,
      breakdown,
      score: ratingQuality + popularity + valueMoney + availability + wishlistBoost,
      fraud,
      inWishlist,
    };
  });
}

/* ── recommendation narrative ─────────────────────────────────────────── */
function buildRecommendation(sorted: Enriched[], sameCat: boolean): string {
  if (sorted.length === 0) return "";
  const winner = sorted[0];
  const runnerUp = sorted[1];
  const lines: string[] = [];

  if (!sameCat) {
    lines.push("⚠️ These products are from different categories — the comparison is cross-category, but here is an objective score-based analysis:");
  }

  lines.push(`🏆 **${winner.name}** scores highest at ${winner.score}/100.`);

  if (winner.reviews.average >= 4.5) {
    lines.push(`It carries an excellent ${winner.reviews.average.toFixed(1)}/5 rating from ${winner.reviews.total} review${winner.reviews.total !== 1 ? "s" : ""}.`);
  } else if (winner.reviews.average >= 3.5) {
    lines.push(`It holds a solid ${winner.reviews.average.toFixed(1)}/5 from ${winner.reviews.total} review${winner.reviews.total !== 1 ? "s" : ""}.`);
  } else if (winner.reviews.total === 0) {
    lines.push(`It has no reviews yet, but leads in value and availability metrics.`);
  } else {
    lines.push(`It achieves ${winner.reviews.average.toFixed(1)}/5 from ${winner.reviews.total} review${winner.reviews.total !== 1 ? "s" : ""}.`);
  }

  // Fraud signals
  if (winner.fraud.label === "likely_fake") {
    lines.push(`⚠️ **Caution**: its ratings show signs of manipulation (fraud index ${winner.fraud.fraudScore}/100) — the score has been adjusted downward to reflect this.`);
  } else if (winner.fraud.label === "suspicious") {
    lines.push(`⚠️ Its rating pattern raises some concerns (fraud index ${winner.fraud.fraudScore}/100) — treat the review score with some scepticism.`);
  } else if (winner.fraud.label === "reliable" && winner.reviews.total > 0) {
    lines.push(`✅ Its reviews appear genuine: ${Math.round(winner.fraud.verifiedRatio * 100)}% are from verified buyers.`);
  }

  // Wishlist mention
  if (winner.inWishlist) {
    lines.push(`❤️ You already have **${winner.name}** in your wishlist — this aligns with your own preferences.`);
  }

  if (runnerUp) {
    const diff = winner.price - runnerUp.price;
    if (diff > 0) {
      lines.push(`At $${winner.price.toFixed(2)}, it costs $${Math.abs(diff).toFixed(2)} more than **${runnerUp.name}**, but its quality score justifies the premium.`);
    } else if (diff < 0) {
      lines.push(`At $${winner.price.toFixed(2)}, it is also the more affordable option — $${Math.abs(diff).toFixed(2)} less than **${runnerUp.name}**.`);
    }
    if (runnerUp.score >= winner.score * 0.85) {
      const runnerFraud = runnerUp.fraud.label === "likely_fake" ? " (though its reviews may be unreliable)" : "";
      lines.push(`**${runnerUp.name}** is a close second (${runnerUp.score}/100)${runnerFraud} and worth considering if **${winner.name}** is unavailable.`);
    }
  }

  const stock = winner.stock ?? 0;
  if (stock > 0 && stock < 5) lines.push(`⚡ Only ${stock} unit${stock !== 1 ? "s" : ""} left — act quickly.`);
  if (stock <= 0) lines.push(`Note: this product is currently out of stock.`);

  return lines.join(" ");
}

/* ── component ────────────────────────────────────────────────────────── */
export const ComparePage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { items, remove, clear } = useCompareStore();
  const { dispatch } = useCart();
  const wishlistStore = useWishlistStore();

  const [enriched, setEnriched] = useState<Enriched[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (items.length === 0) { setEnriched([]); return; }
    setLoading(true);
    const wishlistIds = new Set(wishlistStore.ids);
    Promise.all(
      items.map((item) =>
        fetch(`${API_URL}/products/${item.id}/reviews`)
          .then((r) => r.json())
          .then((data) => ({
            items: Array.isArray(data.items) ? (data.items as ReviewItem[]) : [],
            average: typeof data.average === "number" ? data.average : 0,
            total: typeof data.total === "number" ? data.total : 0,
          } as ReviewData))
          .catch(() => ({ items: [], average: 0, total: 0 } as ReviewData))
      )
    ).then((reviewDataList) => {
      setEnriched(computeScores(items, reviewDataList, wishlistIds));
    }).finally(() => setLoading(false));
  }, [items, wishlistStore.ids]);

  const handleAddToCart = (it: CompareItem) => {
    dispatch({
      type: "ADD_ITEM",
      payload: { id: it.id, name: it.name, price: it.price, server_image_url: it.image || "" } as never,
    });
    toast.success(`"${it.name}" added to cart`);
  };

  const uniqueCategories = [...new Set(items.map((i) => i.category).filter(Boolean))];
  const sameCat = uniqueCategories.length <= 1;
  const sorted = [...enriched].sort((a, b) => b.score - a.score);
  const winner = sorted[0];
  const recommendation = buildRecommendation(sorted, sameCat);

  /* Empty state */
  if (items.length === 0) {
    return (
      <section className="max-w-3xl mx-auto py-16 px-4 text-center">
        <svg className="w-12 h-12 mx-auto text-brand-300 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 3L3 6l3 3" /><path d="M3 6h17" /><path d="M18 21l3-3-3-3" /><path d="M21 18H4" />
        </svg>
        <h1 className="text-2xl font-bold mb-2">{t("compare.title")}</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-1">{t("compare.empty")}</p>
        <p className="text-sm text-gray-400 mb-6">Hover over any product card and click the compare icon (⇄).</p>
        <button onClick={() => navigate("/store")} className="px-5 py-2 rounded-md bg-brand-500 hover:bg-brand-600 text-white font-medium">
          {t("nav.allProducts")}
        </button>
      </section>
    );
  }

  return (
    <section className="max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("compare.title")}</h1>
        <button onClick={clear} className="inline-flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700">
          <Trash2 className="w-4 h-4" /> Clear all
        </button>
      </div>

      {/* Category mismatch warning */}
      {!sameCat && (
        <div className="flex items-start gap-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 rounded-lg p-4 text-sm text-yellow-800 dark:text-yellow-200">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <strong>Different categories detected:</strong> You are comparing{" "}
            {uniqueCategories.map((c, i) => <span key={String(c)}>{i > 0 && ", "}<em>{String(c)}</em></span>)}.
            {" "}For the most meaningful comparison, compare products of the same type.
          </div>
        </div>
      )}

      {/* Product cards */}
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {loading
          ? items.map((item) => <SkeletonCard key={item.id} item={item} onRemove={() => remove(item.id)} />)
          : enriched.map((item) => (
              <CompareProductCard
                key={item.id}
                item={item}
                isWinner={!!winner && winner.id === item.id && enriched.length > 1}
                onRemove={() => remove(item.id)}
                onAddToCart={() => handleAddToCart(item)}
                onView={() => navigate(`/products/${item.id}`)}
              />
            ))}
      </div>

      {/* Score breakdown table */}
      {!loading && enriched.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow border border-gray-100 dark:border-gray-800 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <th className="text-left px-6 py-3 text-xs uppercase text-gray-500 font-semibold w-52">Dimension</th>
                {enriched.map((e) => (
                  <th key={e.id} className="px-6 py-3 text-center font-semibold text-gray-800 dark:text-gray-200">{e.name}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              <ScoreRow label="⭐ Rating quality (/40)" values={enriched.map((e) => ({ score: e.breakdown.ratingQuality, max: 40, detail: e.reviews.average > 0 ? `${e.reviews.average.toFixed(1)}/5` : "—" }))} />
              <ScoreRow label="👥 Popularity (/20)" values={enriched.map((e) => ({ score: e.breakdown.popularity, max: 20, detail: `${e.reviews.total} reviews` }))} />
              <ScoreRow label="💰 Value for money (/25)" values={enriched.map((e) => ({ score: e.breakdown.valueMoney, max: 25, detail: `$${e.price.toFixed(2)}` }))} />
              <ScoreRow label="📦 Availability (/15)" values={enriched.map((e) => ({ score: e.breakdown.availability, max: 15, detail: (e.stock ?? 0) > 0 ? `${e.stock} in stock` : "Out of stock" }))} />
              <ScoreRow label="❤️ Wishlist signal (/5)" values={enriched.map((e) => ({ score: e.breakdown.wishlistBoost, max: 5, detail: e.inWishlist ? "In your wishlist" : "—" }))} />
              <tr className="border-t border-gray-200 dark:border-gray-700">
                <td className="px-6 py-3 text-xs text-gray-500 font-semibold uppercase tracking-wide">🛡️ Review reliability</td>
                {enriched.map((e) => {
                  const cfg: Record<FraudLabel, { icon: React.ReactNode; text: string; cls: string }> = {
                    reliable:     { icon: <ShieldCheck className="w-4 h-4" />, text: "Reliable",      cls: "text-green-600 dark:text-green-400" },
                    suspicious:   { icon: <ShieldAlert className="w-4 h-4" />, text: "Suspicious",   cls: "text-yellow-600 dark:text-yellow-400" },
                    likely_fake:  { icon: <ShieldX className="w-4 h-4" />,    text: "Likely fake",  cls: "text-red-600 dark:text-red-400" },
                    no_data:      { icon: <ShieldAlert className="w-4 h-4" />, text: "No data",      cls: "text-gray-400" },
                  };
                  const c = cfg[e.fraud.label];
                  return (
                    <td key={e.id} className="px-6 py-3 text-center">
                      <div className={`inline-flex flex-col items-center gap-0.5 ${c.cls}`}>
                        <span className="flex items-center gap-1 font-semibold text-sm">{c.icon}{c.text}</span>
                        <span className="text-xs text-gray-400">
                          {e.fraud.label !== "no_data"
                            ? `index ${e.fraud.fraudScore}/100 • ${Math.round(e.fraud.verifiedRatio * 100)}% verified`
                            : "No reviews yet"}
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
              <tr className="bg-brand-50 dark:bg-brand-950/30 font-bold">
                <td className="px-6 py-3 text-gray-800 dark:text-gray-200">Total score</td>
                {enriched.map((e) => (
                  <td key={e.id} className="px-6 py-3 text-center text-brand-700 dark:text-brand-300 text-lg">
                    {e.score}<span className="text-xs font-normal text-gray-500">/100</span>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* AI Recommendation */}
      {!loading && recommendation && (
        <div className="bg-gradient-to-r from-brand-50 to-indigo-50 dark:from-brand-950/40 dark:to-indigo-950/40 border border-brand-200 dark:border-brand-800 rounded-xl p-6 space-y-3">
          <h2 className="flex items-center gap-2 font-bold text-brand-800 dark:text-brand-200">
            <Sparkles className="w-5 h-5" /> AI Analysis &amp; Recommendation
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            <BoldText text={recommendation} />
          </p>
          {winner && (
            <button onClick={() => navigate(`/products/${winner.id}`)} className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-800">
              View recommended product <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </section>
  );
};

/* ── sub-components ───────────────────────────────────────────────────── */
function CompareProductCard({
  item, isWinner, onRemove, onAddToCart, onView,
}: { item: Enriched; isWinner: boolean; onRemove: () => void; onAddToCart: () => void; onView: () => void }) {
  const imgSrc = item.image ? toAbsoluteUrl(item.image) : "/placeholder.svg";

  const fraudBadge: Record<FraudLabel, { label: string; cls: string }> = {
    reliable:    { label: "✅ Reliable reviews",  cls: "text-green-700 bg-green-50 dark:bg-green-950/30 border-green-300" },
    suspicious:  { label: "⚠️ Suspicious reviews", cls: "text-yellow-700 bg-yellow-50 dark:bg-yellow-950/30 border-yellow-300" },
    likely_fake: { label: "🚨 Likely fake",       cls: "text-red-700 bg-red-50 dark:bg-red-950/30 border-red-300" },
    no_data:     { label: "– No reviews yet",    cls: "text-gray-500 bg-gray-50 dark:bg-gray-800 border-gray-300" },
  };
  const badge = fraudBadge[item.fraud.label];

  return (
    <div className={`relative flex flex-col bg-white dark:bg-gray-900 rounded-xl border-2 shadow-sm overflow-hidden ${isWinner ? "border-brand-500" : "border-gray-200 dark:border-gray-700"}`}>
      {isWinner && <div className="bg-brand-500 text-white text-xs font-bold text-center py-1">🏆 BEST CHOICE</div>}
      <button onClick={onRemove} className="absolute right-2 top-2 text-gray-400 hover:text-red-500 z-10 bg-white/80 dark:bg-gray-900/80 rounded-full p-0.5" aria-label="Remove">
        <X className="w-4 h-4" />
      </button>
      {item.inWishlist && (
        <div className="absolute left-2 top-2 z-10">
          <span title="In your wishlist">
            <Heart className="w-5 h-5 fill-pink-500 text-pink-500" />
          </span>
        </div>
      )}
      <img src={imgSrc} alt={item.name} className="w-full aspect-square object-cover"
        onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }} />
      <div className="p-4 flex flex-col gap-2 flex-1">
        <h3 className="font-semibold text-gray-900 dark:text-white line-clamp-2 leading-snug">{item.name}</h3>
        <p className="text-xl font-bold text-brand-700 dark:text-brand-300">${item.price.toFixed(2)}</p>
        {item.category && <span className="text-xs text-gray-500 uppercase tracking-wide">{item.category}</span>}

        {/* Fraud badge */}
        <span className={`self-start text-xs border rounded-full px-2 py-0.5 font-medium ${badge.cls}`}>
          {badge.label}
        </span>

        {item.reviews.total > 0 ? (
          <div className="flex items-center gap-1 text-sm">
            <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
            <span className="font-medium">{item.reviews.average.toFixed(1)}</span>
            <span className="text-gray-400">({item.reviews.total})</span>
            {item.fraud.label === "likely_fake" && (
              <span className="text-xs text-red-500 ml-1" title="Score adjusted for suspicious reviews">(adjusted)</span>
            )}
          </div>
        ) : (
          <span className="text-xs text-gray-400">No reviews yet</span>
        )}
        {(item.stock ?? 0) > 0 && (item.stock ?? 0) < 5 && (
          <span className="text-xs text-orange-600 font-medium">Only {item.stock} left!</span>
        )}
        {(item.stock ?? 0) <= 0 && (
          <span className="text-xs text-red-500 font-medium">Out of stock</span>
        )}
        <div className="mt-auto flex flex-col gap-1.5 pt-2">
          <button onClick={onView} className="w-full text-sm py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition">
            View product
          </button>
          <button onClick={onAddToCart} className="w-full text-sm py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-medium transition inline-flex items-center justify-center gap-1.5">
            <ShoppingCart className="w-3.5 h-3.5" /> Add to cart
          </button>
        </div>
      </div>
    </div>
  );
}

function SkeletonCard({ item, onRemove }: { item: CompareItem; onRemove: () => void }) {
  return (
    <div className="relative flex flex-col bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-200 shadow-sm overflow-hidden animate-pulse">
      <button onClick={onRemove} className="absolute right-2 top-2 text-gray-400 hover:text-red-500 z-10"><X className="w-4 h-4" /></button>
      <div className="w-full aspect-square bg-gray-200 dark:bg-gray-700" />
      <div className="p-4 space-y-2">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
        <p className="text-sm text-gray-500 truncate">{item.name}</p>
      </div>
    </div>
  );
}

function ScoreRow({ label, values }: { label: string; values: { score: number; max: number; detail: string }[] }) {
  const maxScore = Math.max(...values.map((v) => v.score));
  return (
    <tr>
      <td className="px-6 py-3 text-gray-600 dark:text-gray-400 text-xs">{label}</td>
      {values.map((v, i) => (
        <td key={i} className="px-6 py-3 text-center">
          <div className="flex flex-col items-center gap-0.5">
            <span className={`font-semibold text-base ${v.score === maxScore ? "text-brand-600 dark:text-brand-400" : "text-gray-600 dark:text-gray-400"}`}>
              {v.score}
            </span>
            <span className="text-xs text-gray-400">{v.detail}</span>
            <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full mt-1">
              <div
                className={`h-full rounded-full ${v.score === maxScore ? "bg-brand-500" : "bg-gray-300 dark:bg-gray-600"}`}
                style={{ width: `${v.max > 0 ? (v.score / v.max) * 100 : 0}%` }}
              />
            </div>
          </div>
        </td>
      ))}
    </tr>
  );
}

/** Renders **bold** markdown inline. */
function BoldText({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return <>{parts.map((p, i) => i % 2 === 1 ? <strong key={i}>{p}</strong> : <span key={i}>{p}</span>)}</>;
}

export default ComparePage;
