import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { API_URL } from '../api/config';
import { useTranslation } from 'react-i18next';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { AlertTriangle, DollarSign, Package, ShoppingBag, Boxes, Upload, X, CheckCircle, ImageIcon } from 'lucide-react';
import { uploadProductImage } from '../api/products';

/**
 * Phase K — Vendor Dashboard
 * Consumes /vendor/products, /vendor/orders, /vendor/stats. Auth-gated.
 * Visual verification: open with VS Code Live Preview against the Vite dev server.
 */

type Stats = {
  revenue: number;
  units_sold: number;
  orders: number;
  products: number;
  daily_series: { date: string; revenue: number }[];
};

type VendorProduct = {
  id: string;
  name: string;
  price: number;
  stock: number;
  units_sold: number;
  revenue: number;
  created_at: string;
};

type VendorOrder = {
  order_id: string;
  status: string;
  created_at: string;
  vendor_subtotal: number;
  vendor_units: number;
};

const fmt = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });

export const VendorDashboardPage: React.FC = () => {
  const { t } = useTranslation();
  const { token, isAuthenticated } = useAuth();
  const nav = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [products, setProducts] = useState<VendorProduct[]>([]);
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Image upload
  const [uploadTarget, setUploadTarget] = useState<VendorProduct | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadDone, setUploadDone] = useState<string[]>([]);
  const [uploadFail, setUploadFail] = useState<string[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      nav('/login');
      return;
    }
    const headers = { Authorization: `Bearer ${token}` };
    setLoading(true);
    Promise.all([
      fetch(`${API_URL}/vendor/stats`, { headers }).then((r) => r.json()),
      fetch(`${API_URL}/vendor/products`, { headers }).then((r) => r.json()),
      fetch(
        `${API_URL}/vendor/orders${statusFilter ? `?status=${statusFilter}` : ''}`,
        { headers }
      ).then((r) => r.json()),
    ])
      .then(([s, p, o]) => {
        setStats(s);
        setProducts(Array.isArray(p) ? p : []);
        setOrders(Array.isArray(o) ? o : []);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [isAuthenticated, token, nav, statusFilter]);

  const maxRev = useMemo(() => {
    if (!stats?.daily_series?.length) return 1;
    return Math.max(...stats.daily_series.map((d) => d.revenue), 1);
  }, [stats]);

  const lowStock = useMemo(
    () => products.filter((p) => p.stock <= 5),
    [products]
  );

  const handleUploadImages = async (files: FileList) => {
    if (!uploadTarget || !token) return;
    setUploading(true);
    setUploadDone([]);
    setUploadFail([]);
    const results: { name: string; ok: boolean }[] = [];
    for (const file of Array.from(files)) {
      try {
        await uploadProductImage(uploadTarget.id, file, token);
        results.push({ name: file.name, ok: true });
        setUploadDone((prev) => [...prev, file.name]);
      } catch {
        results.push({ name: file.name, ok: false });
        setUploadFail((prev) => [...prev, file.name]);
      }
    }
    setUploading(false);
    void results;
  };
  void maxRev;

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 text-gray-600 dark:text-gray-400">
        Loading vendor dashboard…
      </div>
    );
  }
  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 text-red-600">
        Error: {error}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('vendor.dashboard')}</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Sales performance and product inventory for your store.
        </p>
      </header>

      {/* KPIs */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={<DollarSign className="w-4 h-4" />} label={t('vendor.revenue')} value={fmt(stats?.revenue ?? 0)} />
        <KpiCard icon={<Boxes className="w-4 h-4" />} label={t('vendor.units')} value={(stats?.units_sold ?? 0).toString()} />
        <KpiCard icon={<ShoppingBag className="w-4 h-4" />} label={t('vendor.orders')} value={(stats?.orders ?? 0).toString()} />
        <KpiCard icon={<Package className="w-4 h-4" />} label={t('vendor.products')} value={(stats?.products ?? 0).toString()} />
      </section>

      {/* Daily revenue chart (recharts LineChart) */}
      <section className="bg-white dark:bg-gray-900 rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          {t('vendor.dailyRevenue')}
        </h2>
        {stats?.daily_series && stats.daily_series.length > 0 ? (
          <div className="w-full h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.daily_series} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb33" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v: number) => fmt(v)}
                  contentStyle={{ background: '#1f2937', border: 'none', color: 'white', fontSize: 12 }}
                />
                <Line type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-gray-500 dark:text-gray-400 text-sm">No sales recorded in the last 30 days.</p>
        )}
      </section>

      {/* Low stock alert */}
      {lowStock.length > 0 && (
        <section className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-lg p-4">
          <h3 className="font-semibold text-yellow-800 dark:text-yellow-200 inline-flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4" /> {t('vendor.lowStock')}
          </h3>
          <ul className="text-sm text-yellow-900 dark:text-yellow-100 grid grid-cols-1 sm:grid-cols-2 gap-1">
            {lowStock.map((p) => (
              <li key={p.id} className="flex justify-between">
                <span className="truncate">{p.name}</span>
                <span className="font-mono font-semibold ml-2">{p.stock}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Products */}
      <section className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">My products</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <Th>Name</Th>
                <Th>Price</Th>
                <Th>Stock</Th>
                <Th>Units sold</Th>
                <Th>Revenue</Th>
                <Th>Images</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {products.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                    No products yet.
                  </td>
                </tr>
              )}
              {products.map((p) => (
                <tr key={p.id}>
                  <Td>{p.name}</Td>
                  <Td>{fmt(p.price)}</Td>
                  <Td>{p.stock}</Td>
                  <Td>{p.units_sold}</Td>
                  <Td>{fmt(p.revenue)}</Td>
                  <Td>
                    <button
                      onClick={() => { setUploadTarget(p); setUploadDone([]); setUploadFail([]); }}
                      className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-800 font-medium"
                    >
                      <ImageIcon className="w-3.5 h-3.5" /> Upload
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Image upload modal */}
      {uploadTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !uploading && setUploadTarget(null)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Upload images — <span className="text-brand-600">{uploadTarget.name}</span>
              </h3>
              <button
                aria-label="Close"
                onClick={() => !uploading && setUploadTarget(null)}
                className="text-gray-400 hover:text-gray-600 dark:text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              Select one or more images (JPEG, PNG, WebP, GIF). Each image will be
              automatically compressed and converted to WebP.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => e.target.files && handleUploadImages(e.target.files)}
            />

            <button
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl transition"
            >
              <Upload className="w-4 h-4" />
              {uploading ? 'Uploading…' : 'Choose files'}
            </button>

            {uploadDone.length > 0 && (
              <ul className="space-y-1 text-sm">
                {uploadDone.map((name) => (
                  <li key={name} className="flex items-center gap-2 text-green-700">
                    <CheckCircle className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{name}</span>
                  </li>
                ))}
              </ul>
            )}
            {uploadFail.length > 0 && (
              <ul className="space-y-1 text-sm">
                {uploadFail.map((name) => (
                  <li key={name} className="flex items-center gap-2 text-red-600">
                    <X className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{name} — failed</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Orders */}
      <section className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Recent orders</h2>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border-gray-300 dark:border-gray-600 rounded-md text-sm"
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
            <option value="refunded">Refunded</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <Th>Order</Th>
                <Th>Status</Th>
                <Th>Date</Th>
                <Th>Units (yours)</Th>
                <Th>Subtotal (yours)</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                    No orders matching the filter.
                  </td>
                </tr>
              )}
              {orders.map((o) => (
                <tr key={o.order_id}>
                  <Td className="font-mono text-xs">
                    {o.order_id.slice(0, 8)}…
                  </Td>
                  <Td>
                    <StatusBadge status={o.status} />
                  </Td>
                  <Td>{new Date(o.created_at).toLocaleString()}</Td>
                  <Td>{o.vendor_units}</Td>
                  <Td>{fmt(o.vendor_subtotal)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

const KpiCard = ({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) => (
  <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6">
    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 inline-flex items-center gap-1">
      {icon} {label}
    </dt>
    <dd className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</dd>
  </div>
);

const Th = ({ children }: { children: React.ReactNode }) => (
  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
    {children}
  </th>
);

const Td = ({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) => <td className={`px-6 py-4 whitespace-nowrap text-gray-900 dark:text-gray-100 ${className}`}>{children}</td>;

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  paid: 'bg-blue-100 text-blue-800',
  shipped: 'bg-indigo-100 text-indigo-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
  refunded: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200',
  returned: 'bg-orange-100 text-orange-800',
  confirmed: 'bg-blue-100 text-blue-800',
};

const StatusBadge = ({ status }: { status: string }) => (
  <span
    className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
      STATUS_COLORS[status] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
    }`}
  >
    {status}
  </span>
);

export default VendorDashboardPage;
