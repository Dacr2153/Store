// Helpers around the backend recommendation endpoints
// (registered in main.go via internal/recommend).
//
//   POST /products/{id}/view              \u2014 records a product view (cookie based)
//   GET  /products/recently-viewed        \u2014 returns the user/cookie's last viewed items
//   GET  /products/trending?window=7d     \u2014 globally trending products in window
//
// These endpoints are unauthenticated and degrade gracefully on failure.
import axios from "axios";
import { API_URL } from "./config";
import type { Product } from "./products";

const TIMEOUT_MS = 4000;

export const trackView = async (productId: string | number): Promise<void> => {
  try {
    await axios.post(`${API_URL}/products/${productId}/view`, null, { timeout: TIMEOUT_MS, withCredentials: true });
  } catch {
    // Tracking is best-effort; never bubble errors to the UI.
  }
};

export const getRecentlyViewed = async (): Promise<Product[]> => {
  try {
    const r = await axios.get<Product[]>(`${API_URL}/products/recently-viewed`, {
      timeout: TIMEOUT_MS,
      withCredentials: true,
    });
    return Array.isArray(r.data) ? r.data : [];
  } catch {
    return [];
  }
};

export const getTrending = async (window: "1d" | "7d" | "30d" = "7d"): Promise<Product[]> => {
  try {
    const r = await axios.get<Product[]>(`${API_URL}/products/trending`, {
      params: { window },
      timeout: TIMEOUT_MS,
      withCredentials: true,
    });
    return Array.isArray(r.data) ? r.data : [];
  } catch {
    return [];
  }
};
