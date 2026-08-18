import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getLoyaltyMe, applyReferral, type LoyaltyMe } from "../api/loyalty";
import { Loader2, Award, Copy, Share2 } from "lucide-react";
import toast from "react-hot-toast";

export const LoyaltyPage: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<LoyaltyMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [referralInput, setReferralInput] = useState("");

  const refresh = async () => {
    setLoading(true);
    try {
      setData(await getLoyaltyMe());
    } catch (e) {
      console.error("loyalty fetch failed", e);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const copy = async () => {
    if (!data?.referral_code) return;
    try {
      await navigator.clipboard.writeText(data.referral_code);
      toast.success("Copied");
    } catch {
      toast.error("Failed");
    }
  };

  const share = async () => {
    if (!data?.referral_code) return;
    const url = `${window.location.origin}/user-registration?ref=${encodeURIComponent(data.referral_code)}`;
    type NavWithShare = Navigator & { share?: (d: { title: string; url: string }) => Promise<void> };
    const n = navigator as NavWithShare;
    if (n.share) {
      try {
        await n.share({ title: "FinalStore", url });
      } catch {
        /* user cancelled */
      }
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    }
  };

  const redeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!referralInput.trim()) return;
    try {
      await applyReferral(referralInput.trim());
      toast.success("OK");
      setReferralInput("");
      await refresh();
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || "error");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <section className="max-w-2xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold mb-6 inline-flex items-center gap-2">
        <Award className="w-6 h-6 text-accent-500" />
        {t("loyalty.title")}
      </h1>

      <div className="bg-gradient-to-br from-brand-500 to-accent-500 text-white rounded-xl p-6 shadow-lg mb-6">
        <p className="text-sm uppercase tracking-wide opacity-80">{t("loyalty.points")}</p>
        <p className="text-4xl font-extrabold mt-1">{data?.balance ?? 0}</p>
      </div>

      {data?.referral_code && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-6">
          <p className="text-sm font-semibold mb-2">{t("loyalty.referral")}</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded font-mono text-sm">
              {data.referral_code}
            </code>
            <button
              onClick={copy}
              className="p-2 rounded-md bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
              aria-label="Copy"
            >
              <Copy className="w-4 h-4" />
            </button>
            <button
              onClick={share}
              className="p-2 rounded-md bg-brand-500 hover:bg-brand-600 text-white"
              aria-label={t("loyalty.share")}
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <form
        onSubmit={redeem}
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-6"
      >
        <p className="text-sm font-semibold mb-2">Redeem code</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={referralInput}
            onChange={(e) => setReferralInput(e.target.value.toUpperCase())}
            placeholder="ABCD1234"
            className="flex-1 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-md bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold"
          >
            {t("common.save")}
          </button>
        </div>
      </form>

      <div>
        <h2 className="font-semibold mb-2">{t("loyalty.history")}</h2>
        {!data?.history || data.history.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm">—</p>
        ) : (
          <ul className="space-y-2">
            {data.history.map((h) => (
              <li
                key={h.id}
                className="flex items-center justify-between bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2"
              >
                <div>
                  <p className="text-sm">{h.reason}</p>
                  <p className="text-xs text-gray-400">{new Date(h.created_at).toLocaleString()}</p>
                </div>
                <span
                  className={`font-bold ${h.delta >= 0 ? "text-green-600" : "text-red-600"}`}
                >
                  {h.delta > 0 ? "+" : ""}
                  {h.delta}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

export default LoyaltyPage;
