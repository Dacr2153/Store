import { API_URL } from "./config";

export interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ProductHit {
  id: string;
  name: string;
  price: number;
  stock: number;
  image?: string;
}

export interface ParsedQuery {
  keywords?: string[];
  brand?: string;
  color?: string;
  size?: string;
  category?: string;
  gender?: string;
  min_price?: number;
  max_price?: number;
}

export interface AssistantPayload {
  products: ProductHit[];
  parsed: ParsedQuery;
  shop_url?: string;
  image_url?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  payload?: AssistantPayload | { image_url?: string } | null;
  created_at: string;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("authToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = { ...(init.headers as Record<string, string> | undefined), ...authHeaders() };
  const r = await fetch(url, { ...init, headers });
  if (r.status !== 401) return r;
  // try one refresh
  const refresh = localStorage.getItem("refreshToken");
  if (!refresh) return r;
  const rr = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  if (!rr.ok) return r;
  const data = await rr.json();
  if (data?.access_token) localStorage.setItem("authToken", data.access_token);
  if (data?.refresh_token) localStorage.setItem("refreshToken", data.refresh_token);
  return fetch(url, {
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), ...authHeaders() },
  });
}

export async function listChatSessions(): Promise<ChatSession[]> {
  const r = await authFetch(`${API_URL}/chat/sessions`);
  if (!r.ok) throw new Error(`listChatSessions ${r.status}`);
  return r.json();
}

export async function createChatSession(title?: string): Promise<ChatSession> {
  const r = await authFetch(`${API_URL}/chat/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: title ?? "" }),
  });
  if (!r.ok) throw new Error(`createChatSession ${r.status}`);
  return r.json();
}

export async function deleteChatSession(id: string): Promise<void> {
  const r = await authFetch(`${API_URL}/chat/sessions/${id}`, { method: "DELETE" });
  if (!r.ok && r.status !== 204) throw new Error(`deleteChatSession ${r.status}`);
}

export async function listChatMessages(sessionId: string): Promise<ChatMessage[]> {
  const r = await authFetch(`${API_URL}/chat/sessions/${sessionId}/messages`);
  if (!r.ok) throw new Error(`listChatMessages ${r.status}`);
  return r.json();
}

export async function sendChatMessage(
  sessionId: string,
  content: string,
  opts?: { imageHint?: string; imageUrl?: string }
): Promise<{ user: ChatMessage; assistant: ChatMessage }> {
  const r = await authFetch(`${API_URL}/chat/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content,
      image_hint: opts?.imageHint ?? "",
      image_url: opts?.imageUrl ?? "",
    }),
  });
  if (!r.ok) throw new Error(`sendChatMessage ${r.status}`);
  return r.json();
}
