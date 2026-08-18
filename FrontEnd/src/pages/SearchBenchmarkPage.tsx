import { useState } from 'react';
import { API_URL, toAbsoluteUrl } from '../api/config';

type StrategyName = 'naive' | 'indexed' | 'fuzzy' | 'smart';

interface ResultItem {
  id: string;
  name: string;
  price: number;
  stock: number;
  url: string;
  relevance?: number;
}

interface StrategyResult {
  strategy: StrategyName;
  description: string;
  elapsed_ms: number;
  min_ms?: number;
  max_ms?: number;
  iterations: number;
  count: number;
  items: ResultItem[] | null;
  plan_summary?: string;
  error?: string;
}

interface BenchmarkResponse {
  query: string;
  limit: number;
  iterations: number;
  strategies: StrategyResult[];
}

const STRATEGY_COLORS: Record<StrategyName, string> = {
  naive: 'border-red-500/40 bg-red-500/5',
  indexed: 'border-amber-500/40 bg-amber-500/5',
  fuzzy: 'border-blue-500/40 bg-blue-500/5',
  smart: 'border-emerald-500/50 bg-emerald-500/10',
};

const STRATEGY_LABELS: Record<StrategyName, string> = {
  naive: 'Naïve (ILIKE)',
  indexed: 'Indexed (tsvector + GIN)',
  fuzzy: 'Fuzzy (pg_trgm)',
  smart: 'AI Smart (composite)',
};

export const SearchBenchmarkPage = () => {
  const [query, setQuery] = useState('laptop');
  const [limit, setLimit] = useState(8);
  const [runs, setRuns] = useState(10);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<BenchmarkResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runBenchmark = async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const url = `${API_URL}/search/benchmark?q=${encodeURIComponent(q)}&limit=${limit}&runs=${runs}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json: BenchmarkResponse = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // Calculate metrics
  const naive = data?.strategies.find(s => s.strategy === 'naive');
  const smart = data?.strategies.find(s => s.strategy === 'smart');
  const speedup =
    naive && smart && smart.elapsed_ms > 0
      ? naive.elapsed_ms / smart.elapsed_ms
      : null;
  const maxMs = data ? Math.max(...data.strategies.map(s => s.elapsed_ms)) : 0;

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <div className="max-w-7xl mx-auto px-4 py-10">
        <header className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            AI-Optimized Search Benchmark
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400 max-w-3xl">
            Live comparison of four real PostgreSQL strategies on the same dataset:
            a naïve sequential scan, a classic tsvector full-text index, a trigram
            fuzzy index, and an AI-grade composite ranker that fuses semantic match,
            similarity, popularity and stock availability. All times are measured
            inside the backend — no simulation.
          </p>
        </header>

        {/* Controls */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/60 p-4 md:p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-6">
              <label className="block text-sm font-medium mb-1">Query</label>
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && runBenchmark()}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="e.g. laptop, café, keybord (typo intentional)"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Limit</label>
              <input
                type="number"
                min={1}
                max={48}
                value={limit}
                onChange={e => setLimit(Math.max(1, Math.min(48, Number(e.target.value) || 1)))}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Iterations</label>
              <input
                type="number"
                min={1}
                max={50}
                value={runs}
                onChange={e => setRuns(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2"
              />
            </div>
            <div className="md:col-span-2">
              <button
                onClick={runBenchmark}
                disabled={loading}
                className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:cursor-not-allowed text-white font-semibold px-4 py-2 transition"
              >
                {loading ? 'Running…' : 'Benchmark'}
              </button>
            </div>
          </div>
          {error && (
            <p className="mt-3 text-sm text-red-500">Error: {error}</p>
          )}
        </div>

        {/* Headline metric */}
        {data && naive && smart && speedup !== null && (
          <div className="mb-8 rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-emerald-500/10 to-transparent p-6">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-wider text-emerald-400 font-medium">
                  Result
                </p>
                <p className="mt-1 text-2xl md:text-3xl font-bold">
                  AI-optimized search is{' '}
                  <span className="text-emerald-400">{speedup.toFixed(2)}×</span>{' '}
                  {speedup >= 1 ? 'faster' : 'the speed of'} the naïve scan
                </p>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  Averaged over <strong>{data.iterations}</strong> iterations per
                  strategy. Naïve: <strong>{naive.elapsed_ms.toFixed(3)} ms</strong> ·
                  Smart: <strong>{smart.elapsed_ms.toFixed(3)} ms</strong>.
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wider text-gray-500">Query</p>
                <p className="text-xl font-mono">“{data.query}”</p>
              </div>
            </div>
          </div>
        )}

        {/* Bar chart */}
        {data && (
          <div className="mb-8 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
            <h2 className="text-lg font-semibold mb-4">Average query time (ms, lower is better)</h2>
            <div className="space-y-3">
              {data.strategies.map(s => {
                const pct = maxMs > 0 ? (s.elapsed_ms / maxMs) * 100 : 0;
                const isWinner = s === smart;
                return (
                  <div key={s.strategy}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">
                        {STRATEGY_LABELS[s.strategy]}
                        {isWinner && (
                          <span className="ml-2 inline-block rounded-full bg-emerald-500/20 text-emerald-400 px-2 py-0.5 text-xs">
                            AI
                          </span>
                        )}
                      </span>
                      <span className="font-mono">
                        {s.elapsed_ms.toFixed(3)} ms
                        {s.min_ms !== undefined && (
                          <span className="ml-2 text-xs text-gray-500">
                            (min {s.min_ms.toFixed(2)} · max {s.max_ms?.toFixed(2)})
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="h-3 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          isWinner
                            ? 'bg-emerald-500'
                            : s.strategy === 'naive'
                            ? 'bg-red-500'
                            : s.strategy === 'indexed'
                            ? 'bg-amber-500'
                            : 'bg-blue-500'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Strategy cards */}
        {data && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {data.strategies.map(s => (
              <div
                key={s.strategy}
                className={`rounded-2xl border ${STRATEGY_COLORS[s.strategy]} p-4 flex flex-col`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">{STRATEGY_LABELS[s.strategy]}</h3>
                  <span className="text-xs text-gray-500">×{s.iterations}</span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-3 min-h-[3em]">
                  {s.description}
                </p>
                <div className="mb-3">
                  <div className="text-3xl font-bold font-mono">
                    {s.elapsed_ms.toFixed(2)}
                    <span className="text-base font-normal text-gray-500 ml-1">ms</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {s.count} result{s.count === 1 ? '' : 's'}
                  </div>
                </div>
                {s.plan_summary && (
                  <p className="text-[11px] italic text-gray-500 dark:text-gray-400 mb-3 border-l-2 border-gray-300 dark:border-gray-700 pl-2">
                    {s.plan_summary}
                  </p>
                )}
                {s.error && (
                  <p className="text-xs text-red-500 mb-3">⚠ {s.error}</p>
                )}
                <div className="flex-1 space-y-2 mt-auto">
                  {(s.items ?? []).slice(0, 5).map(item => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 rounded-lg bg-white/60 dark:bg-gray-900/60 p-2"
                    >
                      <img
                        src={toAbsoluteUrl(item.url) || 'https://via.placeholder.com/48'}
                        alt={item.name}
                        className="w-10 h-10 rounded object-cover flex-shrink-0"
                        loading="lazy"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">{item.name}</p>
                        <p className="text-[11px] text-gray-500">
                          ${item.price.toFixed(2)}
                          {item.relevance !== undefined && (
                            <span className="ml-1">
                              · rel {item.relevance.toFixed(3)}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                  {(s.items ?? []).length === 0 && !s.error && (
                    <p className="text-xs text-gray-500 italic">No matches.</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Technical footnote */}
        <details className="mt-10 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40 p-4">
          <summary className="cursor-pointer font-medium">How this works</summary>
          <div className="mt-3 text-sm text-gray-700 dark:text-gray-300 space-y-2">
            <p>
              The backend exposes <code>GET /search/benchmark?q=…&amp;limit=…&amp;runs=…</code>
              which runs the four strategies in parallel goroutines. Each strategy
              re-executes its query <em>runs</em> times and reports the average,
              min and max wall-clock time measured around the DB round-trip.
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>
                <strong>Naïve</strong> — <code>WHERE name ILIKE '%q%' OR description ILIKE '%q%'</code>.
                Cannot use any index because of the leading wildcard, so PostgreSQL
                performs a sequential scan over the full <code>products</code> table.
              </li>
              <li>
                <strong>Indexed</strong> — queries the <code>mv_product_search</code>{' '}
                materialised view, matching against a pre-computed{' '}
                <code>tsvector</code> with weighted fields (name ▸ description ▸ category
                slugs) through a GIN index, ranked by <code>ts_rank</code>.
              </li>
              <li>
                <strong>Fuzzy</strong> — uses <code>pg_trgm</code>'s word-similarity
                operator <code>&lt;%</code> against an <code>unaccent</code>'d text
                column, so typos and missing accents still match (try “keybord” or
                “cafe”).
              </li>
              <li>
                <strong>AI Smart</strong> — a composite ranker computed in a single
                SQL statement:{' '}
                <code>0.55·ts_rank + 0.20·word_similarity + 0.20·(popularity/max) + 0.05·(stock&gt;0)</code>,
                where <code>popularity_score</code> is precomputed in the matview
                from sales, wishlist hits, reviews and average rating.
              </li>
            </ul>
          </div>
        </details>
      </div>
    </div>
  );
};
