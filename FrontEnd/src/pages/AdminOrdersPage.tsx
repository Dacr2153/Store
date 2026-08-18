import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { API_URL } from '../api/config';

/**
 * Phase L — Admin Orders Panel.
 * Consumes /admin/orders and offers actions:
 *   - mark-paid (POST /admin/orders/{id}/mark-paid)
 *   - transition (POST /orders/{id}/transition)
 *   - view history (GET /orders/{id}/history)
 */

type AdminOrder = {
  id: string;
  user_id: string;
  status: string;
  total: number;
  created_at: string;
};

type HistoryEntry = {
  from: string;
  to: string;
  by: string;
  reason: string;
  at: string;
};

const STATUSES = [
  '',
  'pending',
  'paid',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
  'returned',
];

const ALLOWED_NEXT: Record<string, string[]> = {
  pending: ['paid', 'cancelled'],
  paid: ['shipped', 'cancelled', 'refunded'],
  shipped: ['delivered', 'returned'],
  delivered: ['returned'],
  returned: ['refunded'],
  cancelled: [],
  refunded: [],
};

const fmt = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });

export const AdminOrdersPage: React.FC = () => {
  const { token, isAuthenticated } = useAuth();
  const nav = useNavigate();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [filter, setFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [history, setHistory] = useState<{
    orderId: string;
    items: HistoryEntry[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = React.useCallback(() => {
    if (!isAuthenticated) {
      nav('/login');
      return;
    }
    setLoading(true);
    fetch(`${API_URL}/admin/orders${filter ? `?status=${filter}` : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      })
      .then((data) => setOrders(Array.isArray(data) ? data : []))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [filter, isAuthenticated, nav, token]);

  useEffect(() => {
    load();
  }, [load]);

  const action = async (
    method: 'POST',
    path: string,
    body?: unknown
  ): Promise<void> => {
    const r = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) {
      throw new Error(await r.text());
    }
  };

  const markPaid = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await action('POST', `/admin/orders/${id}/mark-paid`);
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyId(null);
    }
  };

  const transition = async (id: string, to: string) => {
    setBusyId(id);
    setError(null);
    try {
      await action('POST', `/orders/${id}/transition`, { to, reason: 'admin' });
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyId(null);
    }
  };

  const showHistory = async (id: string) => {
    setError(null);
    try {
      const r = await fetch(`${API_URL}/orders/${id}/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(await r.text());
      const items = await r.json();
      setHistory({ orderId: id, items });
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Admin — Orders</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Manage orders, payments and state transitions.
          </p>
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="border-gray-300 dark:border-gray-600 rounded-md text-sm"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === '' ? 'All statuses' : s}
            </option>
          ))}
        </select>
      </header>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded">
          {error}
        </div>
      )}

      <section className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-x-auto">
        {loading ? (
          <p className="px-6 py-8 text-gray-500 dark:text-gray-400">Loading…</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <Th>Order</Th>
                <Th>User</Th>
                <Th>Status</Th>
                <Th>Total</Th>
                <Th>Date</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                    No orders.
                  </td>
                </tr>
              )}
              {orders.map((o) => {
                const next = ALLOWED_NEXT[o.status] ?? [];
                return (
                  <tr key={o.id}>
                    <Td className="font-mono text-xs">{o.id.slice(0, 8)}…</Td>
                    <Td className="font-mono text-xs">{o.user_id.slice(0, 8)}…</Td>
                    <Td>
                      <StatusBadge status={o.status} />
                    </Td>
                    <Td>{fmt(o.total)}</Td>
                    <Td>{new Date(o.created_at).toLocaleString()}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {o.status === 'pending' && (
                          <button
                            onClick={() => markPaid(o.id)}
                            disabled={busyId === o.id}
                            className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                          >
                            Mark paid
                          </button>
                        )}
                        {next.map((to) => (
                          <button
                            key={to}
                            onClick={() => transition(o.id, to)}
                            disabled={busyId === o.id}
                            className="text-xs px-2 py-1 bg-gray-200 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
                          >
                            → {to}
                          </button>
                        ))}
                        <button
                          onClick={() => showHistory(o.id)}
                          className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:bg-gray-900"
                        >
                          History
                        </button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {history && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setHistory(null)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2">
              Order {history.orderId.slice(0, 8)}… — history
            </h3>
            <ul className="space-y-2 max-h-96 overflow-y-auto">
              {history.items.map((h, i) => (
                <li key={i} className="text-sm border-l-2 border-blue-500 pl-3">
                  <div>
                    <strong>{h.from || '∅'}</strong> → <strong>{h.to}</strong>
                  </div>
                  <div className="text-gray-500 dark:text-gray-400">
                    {new Date(h.at).toLocaleString()} · {h.reason || '—'}
                  </div>
                </li>
              ))}
            </ul>
            <button
              onClick={() => setHistory(null)}
              className="mt-4 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded hover:bg-gray-200"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

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

export default AdminOrdersPage;
