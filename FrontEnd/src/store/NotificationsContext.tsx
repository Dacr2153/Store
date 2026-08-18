import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { API_URL } from "../api/config";
import { useAuth } from "./AuthContext";

export interface AppNotification {
  id: string;
  type: string; // e.g. "order_paid", "shipment_update", "promo"
  title: string;
  body?: string;
  href?: string;
  created_at: string;
  read: boolean;
}

interface NotificationsCtx {
  items: AppNotification[];
  unread: number;
  connected: boolean;
  markAllRead: () => void;
  remove: (id: string) => void;
  clear: () => void;
}

const Ctx = createContext<NotificationsCtx | undefined>(undefined);

const STORAGE_KEY = "notifications-v1";
const MAX_KEEP = 50;

function load(): AppNotification[] {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (!s) return [];
    const arr = JSON.parse(s) as AppNotification[];
    return Array.isArray(arr) ? arr.slice(0, MAX_KEEP) : [];
  } catch {
    return [];
  }
}
function save(items: AppNotification[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_KEEP)));
  } catch {
    /* ignore quota */
  }
}

function wsURL(): string {
  // API_URL could be http://localhost:5050 -> ws://localhost:5050/ws
  const base = API_URL.replace(/^http/, "ws");
  return `${base}/ws`;
}

export const NotificationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, token } = useAuth();
  const [items, setItems] = useState<AppNotification[]>(() => load());
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<number>(0);

  useEffect(() => {
    save(items);
  }, [items]);

  const handleMessage = useCallback((data: unknown) => {
    if (!data || typeof data !== "object") return;
    const obj = data as Record<string, unknown>;
    // Server may send several event shapes — normalise to a notification.
    const type = String(obj.type ?? "info");
    const title = String(obj.title ?? obj.message ?? "Update");
    const body = obj.body ? String(obj.body) : undefined;
    const href = obj.href ? String(obj.href) : undefined;
    const id = String(obj.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    const created_at = String(obj.created_at ?? new Date().toISOString());

    setItems((prev) => {
      if (prev.find((p) => p.id === id)) return prev;
      const next: AppNotification = { id, type, title, body, href, created_at, read: false };
      return [next, ...prev].slice(0, MAX_KEEP);
    });
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      wsRef.current?.close();
      wsRef.current = null;
      setConnected(false);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      try {
        const ws = new WebSocket(wsURL());
        wsRef.current = ws;
        ws.onopen = () => {
          setConnected(true);
          retryRef.current = 0;
          // Identify the user so the backend can route per-user broadcasts.
          ws.send(JSON.stringify({ type: "auth", token }));
        };
        ws.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data);
            handleMessage(data);
          } catch {
            /* ignore non-JSON */
          }
        };
        ws.onclose = () => {
          setConnected(false);
          if (cancelled) return;
          // Exponential backoff up to 30s.
          retryRef.current = Math.min(retryRef.current + 1, 6);
          const delay = Math.min(1000 * 2 ** retryRef.current, 30000);
          timer = setTimeout(connect, delay);
        };
        ws.onerror = () => ws.close();
      } catch {
        if (!cancelled) {
          timer = setTimeout(connect, 5000);
        }
      }
    };

    connect();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [isAuthenticated, token, handleMessage]);

  const markAllRead = useCallback(() => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);
  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((n) => n.id !== id));
  }, []);
  const clear = useCallback(() => setItems([]), []);

  const unread = useMemo(() => items.filter((i) => !i.read).length, [items]);

  return (
    <Ctx.Provider value={{ items, unread, connected, markAllRead, remove, clear }}>
      {children}
    </Ctx.Provider>
  );
};

export function useNotifications() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useNotifications must be used within NotificationsProvider");
  return v;
}
