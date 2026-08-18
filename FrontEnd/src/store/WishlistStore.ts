/**
 * WishlistStore — persists favourites both in the backend (when logged in)
 * and in localStorage (guests / offline fallback).
 *
 * Backend endpoints:
 *   GET    /wishlist            → [{ product_id, name, price, stock, added_at }]
 *   POST   /wishlist            ← { product_id }
 *   DELETE /wishlist/{product_id}
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { API_URL } from "../api/config";

// ---------- helpers ----------------------------------------------------------

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("authToken");
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

function isLoggedIn(): boolean {
  return !!localStorage.getItem("authToken");
}

// ---------- store ------------------------------------------------------------

interface WishlistState {
  /** Set of product IDs the user has favourited. */
  ids: string[];

  /** Returns true if product is in the wishlist. */
  has: (productId: string) => boolean;

  /**
   * Toggle favourite. Calls backend when authenticated.
   * Returns the new liked state.
   */
  toggle: (productId: string) => Promise<boolean>;

  /**
   * Load the wishlist from the backend (call after login / on app start).
   * No-ops for guests.
   */
  loadFromServer: () => Promise<void>;

  /** Remove a product (used internally on remove). */
  _remove: (productId: string) => void;

  /** Add a product id locally. */
  _add: (productId: string) => void;
}

export const useWishlistStore = create<WishlistState>()(
  persist(
    (set, get) => ({
      ids: [],

      has: (productId) => get().ids.includes(productId),

      _add: (productId) =>
        set((s) => ({ ids: s.ids.includes(productId) ? s.ids : [...s.ids, productId] })),

      _remove: (productId) =>
        set((s) => ({ ids: s.ids.filter((id) => id !== productId) })),

      toggle: async (productId) => {
        const isLiked = get().has(productId);

        // Optimistic update
        if (isLiked) {
          get()._remove(productId);
        } else {
          get()._add(productId);
        }

        if (!isLoggedIn()) {
          // Guest: persisted in localStorage via zustand/persist, that's all.
          return !isLiked;
        }

        try {
          if (isLiked) {
            await fetch(`${API_URL}/wishlist/${productId}`, {
              method: "DELETE",
              headers: authHeaders(),
            });
          } else {
            const res = await fetch(`${API_URL}/wishlist`, {
              method: "POST",
              headers: authHeaders(),
              body: JSON.stringify({ product_id: productId }),
            });
            if (!res.ok) throw new Error(await res.text());
          }
        } catch {
          // Revert optimistic update on error
          if (isLiked) {
            get()._add(productId);
          } else {
            get()._remove(productId);
          }
          return isLiked;
        }

        return !isLiked;
      },

      loadFromServer: async () => {
        if (!isLoggedIn()) return;
        try {
          const res = await fetch(`${API_URL}/wishlist`, { headers: authHeaders() });
          if (!res.ok) return;
          const data: { product_id: string }[] = await res.json();
          if (!Array.isArray(data)) return;
          const ids = data.map((it) => it.product_id).filter(Boolean);
          set({ ids });
        } catch {
          // ignore — offline or server error, keep local state
        }
      },
    }),
    {
      name: "wishlist-v1",
      // Only persist the ids array — methods are recreated by zustand.
      partialize: (s) => ({ ids: s.ids }),
    }
  )
);
