export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5050';

/** Converts a potentially-relative image path to an absolute URL.
 *  - Empty / null / undefined → returns "" (caller should fall back to placeholder).
 *  - Full https://... URLs are returned as-is.
 *  - Relative paths (e.g. /uploads/...) are prefixed with API_URL. */
export const toAbsoluteUrl = (url: string | null | undefined): string => {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_URL}${url}`;
};
