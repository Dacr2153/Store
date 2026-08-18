import React, { useEffect, useRef, useState } from "react";
import { Bell, Check, Trash2, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow } from "date-fns";
import { useNotifications } from "../../store/NotificationsContext";

export const NotificationBell: React.FC = () => {
  const { t } = useTranslation();
  const { items, unread, markAllRead, remove, connected } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors"
        aria-label={t("nav.notifications")}
        title={t("nav.notifications")}
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full h-4 min-w-[1rem] px-1 grid place-items-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
        <span
          className={`absolute bottom-0.5 right-0.5 w-1.5 h-1.5 rounded-full ${
            connected ? "bg-green-400" : "bg-gray-400"
          }`}
          aria-hidden
        />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-[24rem] overflow-y-auto bg-white dark:bg-surface-dark-2 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-700">
            <span className="font-semibold text-sm text-gray-900 dark:text-white">
              {t("nav.notifications")}
            </span>
            {items.length > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-brand-500 hover:text-brand-700 inline-flex items-center gap-1"
              >
                <Check className="w-3 h-3" /> {t("notifications.markAllRead")}
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="p-4 text-sm text-gray-500 dark:text-gray-400 text-center">
              {t("notifications.empty")}
            </p>
          ) : (
            <ul>
              {items.map((n) => {
                const Inner = (
                  <div className="flex-1">
                    <p
                      className={`text-sm ${
                        n.read
                          ? "text-gray-700 dark:text-gray-300"
                          : "font-semibold text-gray-900 dark:text-white"
                      }`}
                    >
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{n.body}</p>
                    )}
                    <p className="text-[10px] text-gray-400 mt-1">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </p>
                  </div>
                );
                return (
                  <li
                    key={n.id}
                    className={`flex items-start gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 ${
                      !n.read ? "bg-brand-50/40 dark:bg-brand-900/10" : ""
                    }`}
                  >
                    {n.href ? (
                      <Link to={n.href} onClick={() => setOpen(false)} className="flex-1">
                        {Inner}
                      </Link>
                    ) : (
                      Inner
                    )}
                    <button
                      onClick={() => remove(n.id)}
                      className="text-gray-400 hover:text-red-600 p-1"
                      aria-label="Dismiss"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
