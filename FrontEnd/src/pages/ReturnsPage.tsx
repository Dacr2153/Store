import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listMyReturns, createReturn, type ReturnRow } from "../api/returns";
import { Loader2, RefreshCw, Plus } from "lucide-react";
import toast from "react-hot-toast";

const STATUS_COLOR: Record<ReturnRow["status"], string> = {
  requested: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200",
  approved: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
};

export const ReturnsPage: React.FC = () => {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderId, setOrderId] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      setRows(await listMyReturns());
    } catch (e) {
      console.error("listMyReturns failed", e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId.trim() || !reason.trim()) return;
    setSubmitting(true);
    try {
      await createReturn(orderId.trim(), reason.trim());
      toast.success("OK");
      setOrderId("");
      setReason("");
      await refresh();
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="max-w-3xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{t("returns.title")}</h1>
        <button
          onClick={() => void refresh()}
          className="inline-flex items-center gap-1 text-sm text-brand-500 hover:text-brand-700"
        >
          <RefreshCw className="w-4 h-4" /> {t("common.retry")}
        </button>
      </div>

      <form
        onSubmit={submit}
        className="mb-8 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3"
      >
        <h2 className="font-semibold">{t("returns.create")}</h2>
        <input
          type="text"
          placeholder="Order ID"
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          required
        />
        <textarea
          placeholder={t("returns.reason")}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          required
        />
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold disabled:opacity-50"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {t("common.save")}
        </button>
      </form>

      {loading ? (
        <div className="flex justify-center py-10 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-center text-gray-500 dark:text-gray-400 py-10">{t("returns.empty")}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li
              key={r.id}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
            >
              <div className="flex items-center justify-between">
                <p className="font-mono text-xs text-gray-500 dark:text-gray-400">#{r.id.slice(0, 8)}</p>
                <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded ${STATUS_COLOR[r.status]}`}>
                  {r.status}
                </span>
              </div>
              <p className="mt-2 text-sm">
                <span className="text-gray-500 dark:text-gray-400">Order:</span> <span className="font-mono">{r.order_id.slice(0, 8)}</span>
              </p>
              <p className="text-sm mt-1">{r.reason}</p>
              {r.refund_amount > 0 && (
                <p className="text-sm mt-1">
                  <span className="text-gray-500 dark:text-gray-400">{t("returns.amount")}:</span>{" "}
                  <span className="font-semibold">${Number(r.refund_amount).toFixed(2)}</span>
                </p>
              )}
              <p className="text-xs text-gray-400 mt-1">{new Date(r.created_at).toLocaleString()}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default ReturnsPage;
