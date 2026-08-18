import React, { useState, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useCart } from "../store/CartContext";
import {
  Trash2,
  Plus,
  Minus,
  ShoppingBag,
  CreditCard,
  LogIn,
  ArrowLeft,
  Truck,
  ShieldCheck,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import {
  listCartItems,
  addItemToWishCar,
  removeItemFromWishCar,
  createOrder,
} from "../api/wishcar";
import { Seo } from "../components/common/Seo";
import { toAbsoluteUrl } from "../api/config";
import { useAuth } from "../store/AuthContext";

export const CartPage: React.FC = () => {
  const { state, dispatch } = useCart();
  const { isAuthenticated } = state;
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  // Use reactive token from AuthContext so stale/expired tokens are always
  // reflected here (AuthContext clears it on 401, which re-runs this effect).
  const { token } = useAuth();

  // Track which token we've already synced for. Without this guard, an
  // unstable AuthContext (e.g. /me 401 -> refresh -> setToken loop) would
  // re-fire this effect on every render, dispatch SET_CART_ITEMS in a tight
  // loop, and lock the page (the bug the user reported).
  const syncedTokenRef = useRef<string | null>(null);

  // Sync with server cart on mount (only when authenticated).
  // Merge strategy: prefer server items; keep local if server returns empty.
  useEffect(() => {
    if (!token) return;
    if (syncedTokenRef.current === token) return; // already synced for this token
    syncedTokenRef.current = token;
    let cancelled = false;
    const fetchCart = async () => {
      try {
        const serverItems = await listCartItems();
        if (cancelled) return;
        if (serverItems.length > 0) {
          // Enrich image URL for display.
          const enriched = serverItems.map((item) => ({
            ...item,
            server_image_url:
              item.server_image_url ||
              (item.url ? toAbsoluteUrl(item.url) : "/placeholder.svg"),
          }));
          dispatch({ type: "SET_CART_ITEMS", payload: enriched });
        }
        // If server returns empty but local cart has items, keep local cart.
      } catch (err) {
        // Network / auth error — keep local cart.
        console.error("Could not sync cart:", err);
      }
    };
    fetchCart();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const updateQuantity = async (id: string, quantity: number) => {
    if (quantity < 1) return;
    if (token) {
      try {
        await addItemToWishCar(id, quantity);
      } catch (err) {
        toast.error("Could not update quantity. Try again.");
        return;
      }
    }
    dispatch({ type: "UPDATE_QUANTITY", payload: { id, quantity } });
  };

  const removeItem = async (id: string) => {
    if (token) {
      try {
        await removeItemFromWishCar(id);
      } catch (err) {
        toast.error("Could not remove item. Try again.");
        return;
      }
    }
    dispatch({ type: "REMOVE_ITEM", payload: id });
  };

  const handleCheckout = async () => {
    setIsCheckingOut(true);
    try {
      await createOrder();
      dispatch({ type: "CLEAR_CART" });
      toast.success("Order placed successfully!");
      navigate("/account");
    } catch (error) {
      toast.error(
        "Error placing order: " +
          (error instanceof Error ? error.message : "Unknown error")
      );
    } finally {
      setIsCheckingOut(false);
    }
  };

  const subtotal = isNaN(state.total) ? 0 : state.total;
  const shipping = subtotal > 50 || subtotal === 0 ? 0 : 5.99;
  const tax = subtotal * 0.08;
  const grandTotal = subtotal + shipping + tax;

  if (state.items.length === 0) {
    return (
      <>
        <Seo title={t('cart.title')} />
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <div className="mx-auto w-20 h-20 rounded-full bg-brand-100 flex items-center justify-center mb-6">
            <ShoppingBag className="w-10 h-10 text-brand-500" />
          </div>
          <h2 className="text-3xl font-extrabold text-gray-900 dark:text-gray-100 mb-2">
            {t('cart.empty')}
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            {t('cart.emptySubtitle')}
          </p>
          <Link
            to="/store"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-semibold shadow"
          >
            <ArrowLeft className="w-4 h-4" /> {t('cart.browse')}
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <Seo title={t('cart.title')} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-extrabold text-gray-900 dark:text-gray-100 mb-8">
          {t('cart.title')}{" "}
          <span className="text-lg font-normal text-gray-500 dark:text-gray-400">
            ({t('cart.itemCount', { count: state.items.length })})
          </span>
        </h1>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Items */}
          <div className="lg:col-span-2 space-y-4">
            {state.items.map((item) => (
              <div
                key={item.id}
                className="flex flex-col sm:flex-row gap-4 bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-card"
              >
                <img
                  src={item.server_image_url || "/placeholder.svg"}
                  alt={item.name}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/placeholder.svg";
                  }}
                  className="w-full sm:w-28 h-28 object-cover rounded-xl bg-brand-50 flex-shrink-0"
                />
                <div className="flex-1 flex flex-col min-w-0">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                    {item.name}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    ${Number(item.price).toFixed(2)} {t('cart.each')}
                  </p>
                  <div className="mt-auto flex items-center justify-between gap-3 pt-3 flex-wrap">
                    <div className="inline-flex items-center rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800">
                      <button
                        onClick={() =>
                          updateQuantity(item.id, item.quantity - 1)
                        }
                        disabled={item.quantity <= 1}
                        className="p-2 hover:bg-gray-50 dark:bg-gray-900 disabled:opacity-50"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="px-3 text-sm font-semibold w-8 text-center">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() =>
                          updateQuantity(item.id, item.quantity + 1)
                        }
                        disabled={item.quantity >= (item.stock ?? 99)}
                        className="p-2 hover:bg-gray-50 dark:bg-gray-900 disabled:opacity-50"
                        aria-label="Increase quantity"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-brand-700">
                        ${(Number(item.price) * item.quantity).toFixed(2)}
                      </span>
                      <button
                        onClick={() => removeItem(item.id)}
                        className="inline-flex items-center gap-1 text-sm text-state-danger hover:underline"
                      >
                        <Trash2 className="w-4 h-4" /> {t('common.remove')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <Link
              to="/store"
              className="inline-flex items-center gap-1.5 text-sm text-brand-500 hover:text-brand-700 font-medium mt-2"
            >
              <ArrowLeft className="w-4 h-4" /> {t('cart.continue')}
            </Link>
          </div>

          {/* Summary */}
          <aside className="lg:col-span-1">
            <div className="sticky top-28 bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-card">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">
                {t('cart.summary')}
              </h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">{t('cart.subtotal')}</dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100">
                    ${subtotal.toFixed(2)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">{t('cart.shipping')}</dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100">
                    {shipping === 0 ? (
                      <span className="text-green-600">{t('cart.free')}</span>
                    ) : (
                      `$${shipping.toFixed(2)}`
                    )}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">{t('cart.tax')}</dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100">
                    ${tax.toFixed(2)}
                  </dd>
                </div>
                <div className="border-t border-gray-100 dark:border-gray-700 pt-3 flex justify-between text-base">
                  <dt className="font-bold text-gray-900 dark:text-gray-100">{t('cart.total')}</dt>
                  <dd className="font-extrabold text-brand-700 text-xl">
                    ${grandTotal.toFixed(2)}
                  </dd>
                </div>
              </dl>

              {isAuthenticated ? (
                <button
                  onClick={handleCheckout}
                  disabled={isCheckingOut}
                  className="mt-6 w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:bg-gray-400 text-white font-semibold shadow-lg shadow-brand-500/20"
                >
                  <CreditCard className="w-5 h-5" />
                  {isCheckingOut ? t('cart.placing') : t('cart.checkout')}
                </button>
              ) : (
                <button
                  onClick={() => {
                    sessionStorage.setItem("returnUrl", "/cart");
                    navigate("/login");
                  }}
                  className="mt-6 w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-semibold shadow-lg shadow-brand-500/20"
                >
                  <LogIn className="w-5 h-5" /> {t('cart.signIn')}
                </button>
              )}

              <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-gray-500 dark:text-gray-400">
                <div className="inline-flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-brand-500" /> {t('cart.freeShipping')}
                </div>
                <div className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-brand-500" /> {t('cart.secure')}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
};

export default CartPage;
