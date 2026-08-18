import axios from "axios";
import { API_URL } from "./config";

export interface SearchSuggestion {
  id: string;
  name: string;
  price?: number;
  image?: string;
}

/**
 * Calls the existing GET /search/suggest?q=... endpoint.
 * The backend returns at most ~10 suggestions and is FTS-backed.
 */
export async function searchSuggest(q: string, signal?: AbortSignal): Promise<SearchSuggestion[]> {
  const trimmed = q.trim();
  if (trimmed.length < 2) return [];
  try {
    const r = await axios.get<unknown>(`${API_URL}/search/suggest`, {
      params: { q: trimmed },
      signal,
      timeout: 4000,
    });
    const data = r.data;
    if (!Array.isArray(data)) return [];
    return (data as Array<Record<string, unknown>>)
      .map((row) => ({
        id: String(row.id ?? ""),
        name: String(row.name ?? ""),
        price: typeof row.price === "number" ? row.price : undefined,
        image: typeof row.image === "string" ? row.image : undefined,
      }))
      .filter((row) => row.id && row.name);
  } catch {
    return [];
  }
}
