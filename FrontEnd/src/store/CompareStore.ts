import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CompareItem {
  id: string;
  name: string;
  price: number;
  image?: string;
  description?: string;
  stock?: number;
  category?: string;
  /** Average rating fetched from product detail (0 if none). */
  avgRating?: number;
  /** Total review count. */
  reviewCount?: number;
}

interface CompareState {
  items: CompareItem[];
  add: (item: CompareItem) => boolean; // returns false if list is full
  remove: (id: string) => void;
  clear: () => void;
  has: (id: string) => boolean;
}

export const MAX_COMPARE = 3;

export const useCompareStore = create<CompareState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (item) => {
        const cur = get().items;
        if (cur.find((i) => i.id === item.id)) return true;
        if (cur.length >= MAX_COMPARE) return false;
        set({ items: [...cur, item] });
        return true;
      },
      remove: (id) => set({ items: get().items.filter((i) => i.id !== id) }),
      clear: () => set({ items: [] }),
      has: (id) => !!get().items.find((i) => i.id === id),
    }),
    { name: "compare-v1" }
  )
);
