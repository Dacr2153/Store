import React, { useState } from "react";
import { ShoppingCart, Eye, Heart, GitCompareArrows } from "lucide-react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import type { Product } from "../../types";
import { useCart } from "../../store/CartContext";
import { ProductDetails } from "./ProductDetails";
import { API_URL, toAbsoluteUrl } from "../../api/config";
import { addItemToWishCar } from "../../api/wishcar";
import { useCompareStore, MAX_COMPARE } from "../../store/CompareStore";
import { useWishlistStore } from "../../store/WishlistStore";

/**
 * Phase M — Product card.
 * - Square media area with subtle blue gradient background and graceful fallback.
 * - Hover reveals quick actions (preview, add to cart).
 * - "Wishlist" pill toggles heart locally.
 * - Stock + price layout aligned consistently across cards.
 */

interface ProductCardProps {
  product?: Partial<Product>;
  id?: string;
  name?: string;
  price?: number;
  image?: string;
  description?: string;
  stock?: number;
  url?: string;
}

const PLACEHOLDER = "/placeholder.svg";

const resolveImage = (p: Partial<Product> & { image?: string; url?: string }): string => {
  const direct = (p as { image?: string }).image;
  if (direct) {
    if (/^https?:\/\//i.test(direct)) return direct;
    if (direct.startsWith("/")) return `${API_URL}${direct}`;
    return direct;
  }
  if (p.url) return toAbsoluteUrl(p.url);
  if (p.images && p.images.length > 0) {
    const first = p.images[0] as { url?: string; src?: string };
    const firstUrl = first.url || first.src;
    return firstUrl ? toAbsoluteUrl(firstUrl) : PLACEHOLDER;
  }
  return PLACEHOLDER;
};

export const ProductCard: React.FC<ProductCardProps> = (props) => {
  const navigate = useNavigate();
  const { dispatch } = useCart();
  const compareStore = useCompareStore();
  const wishlist = useWishlistStore();
  const [showDetails, setShowDetails] = useState(false);

  const product: Product = (props.product as Product) || ({
    id: props.id || "",
    name: props.name || "",
    price: props.price || 0,
    description: props.description || "",
    stock: props.stock ?? 10,
    url: props.url || "",
    server_image_url: "",
    category: "",
    images: [],
    variations: [],
    shipping: { estimatedDays: 0, cost: 0 },
    ratings: [],
  } as unknown as Product);

  const imageUrl = props.image || resolveImage(product as never);
  const stock = (product as Product).stock ?? 0;
  const outOfStock = stock <= 0;

  const addToCart = async (e: React.MouseEvent) => {
    e.stopPropagation();
    // Always update local state immediately for responsive UI.
    const enriched: Product = {
      ...product,
      server_image_url: product.url ? toAbsoluteUrl(product.url) : "/placeholder.svg",
    };
    dispatch({ type: "ADD_ITEM", payload: enriched });

    // Persist to server when the user has a session.
    const token = localStorage.getItem("authToken");
    if (token) {
      try {
        await addItemToWishCar(String(product.id));
        toast.success(`"${product.name}" added to cart`);
      } catch {
        toast.error("Could not sync cart with server — please try again.");
      }
    } else {
      toast.success(`"${product.name}" added to cart`);
    }
  };

  const handleViewDetails = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDetails(true);
  };

  const handleCompare = (e: React.MouseEvent) => {
    e.stopPropagation();
    const id = String(product.id);
    if (compareStore.has(id)) {
      compareStore.remove(id);
      toast(`"${product.name}" removed from compare`, { icon: "↩" });
      return;
    }
    const ok = compareStore.add({
      id,
      name: product.name,
      price: Number(product.price),
      image: imageUrl !== PLACEHOLDER ? imageUrl : undefined,
      description: product.description,
      stock: product.stock,
      category: product.category,
    });
    if (!ok) {
      toast.error(`Compare list is full (max ${MAX_COMPARE}). Remove a product first.`);
    } else {
      toast.success(`"${product.name}" added to compare`);
    }
  };

  const inCompare = compareStore.has(String(product.id));
  const liked = wishlist.has(String(product.id));

  const handleWishlist = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const nowLiked = await wishlist.toggle(String(product.id));
    toast(nowLiked ? `♥ Added to wishlist` : `Removed from wishlist`, {
      icon: nowLiked ? "❤️" : "🧑",
    });
  };

  const navigateToProduct = () => navigate(`/products/${product.id}`);

  return (
    <>
      <article
        onClick={navigateToProduct}
        className="group relative flex flex-col bg-white dark:bg-gray-800 rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-700 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
      >
        {/* Media */}
        <div className="relative aspect-square bg-gradient-to-br from-brand-50 to-brand-100 overflow-hidden">
          <img
            src={imageUrl}
            alt={product.name}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={(e) => {
              const img = e.target as HTMLImageElement;
              if (!img.src.endsWith(PLACEHOLDER)) img.src = PLACEHOLDER;
            }}
          />

          {/* Top-left badge */}
          {outOfStock ? (
            <span className="absolute top-3 left-3 px-2 py-0.5 rounded-full bg-state-danger text-white text-xs font-semibold shadow">
              Out of stock
            </span>
          ) : stock > 0 && stock < 5 ? (
            <span className="absolute top-3 left-3 px-2 py-0.5 rounded-full bg-accent-500 text-brand-950 text-xs font-semibold shadow">
              Only {stock} left
            </span>
          ) : null}

          {/* Top-right wishlist */}
          <button
            type="button"
            aria-label={liked ? "Remove from wishlist" : "Add to wishlist"}
            aria-pressed={liked}
            onClick={handleWishlist}
            className={`absolute top-3 right-3 p-2 rounded-full backdrop-blur-sm shadow transition-colors ${
              liked
                ? "bg-state-danger text-white"
                : "bg-white/80 dark:bg-gray-700/80 text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-700"
            }`}
          >
            <Heart className={`w-4 h-4 ${liked ? "fill-current" : ""}`} />
          </button>

          {/* Hover overlay actions */}
          <div className="absolute inset-x-3 bottom-3 flex gap-2 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200">
            <button
              onClick={handleViewDetails}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-white/90 dark:bg-gray-700/90 backdrop-blur text-gray-900 dark:text-gray-100 text-sm font-medium hover:bg-white dark:hover:bg-gray-700 shadow"
            >
              <Eye className="w-4 h-4" /> Preview
            </button>
            <button
              onClick={handleCompare}
              title={inCompare ? "Remove from compare" : "Add to compare"}
              className={`inline-flex items-center justify-center px-2.5 py-2 rounded-md shadow text-sm font-medium transition-colors ${
                inCompare
                  ? "bg-brand-600 text-white"
                  : "bg-white/90 dark:bg-gray-700/90 backdrop-blur text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-700"
              }`}
            >
              <GitCompareArrows className="w-4 h-4" />
            </button>
            <button
              onClick={addToCart}
              disabled={outOfStock}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-brand-500 hover:bg-brand-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-sm font-semibold shadow"
            >
              <ShoppingCart className="w-4 h-4" /> Add
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-col flex-1 p-4 gap-1.5">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-1">
            {product.name || "Untitled product"}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 min-h-[2.5rem]">
            {product.description || "No description provided."}
          </p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-extrabold text-brand-700 dark:text-blue-400">
              ${Number(product.price || 0).toFixed(2)}
            </span>
            {!outOfStock && (
              <span className="text-xs text-state-success font-medium">
                In stock
              </span>
            )}
          </div>
        </div>
      </article>

      {showDetails && (
        <ProductDetails
          product={product}
          onClose={() => setShowDetails(false)}
        />
      )}
    </>
  );
};

export default ProductCard;
