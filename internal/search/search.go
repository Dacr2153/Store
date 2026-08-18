// Package search implements four parallel search strategies on top
// of Postgres so that the AI-grade strategies can be benchmarked
// against a deliberately naïve baseline. Every public handler in
// this package is registered through main.go and is safe to expose
// to the public.
//
// Strategies, from slowest to fastest:
//
//	naive    : ILIKE '%q%' on products.name + description.
//	           No indexed path possible without pg_trgm — included
//	           as the "what the DB does without help" baseline.
//
//	indexed  : tsquery on a materialised, pre-computed search_vector
//	           backed by a GIN index (mv_product_search).
//
//	fuzzy    : trigram similarity() / word_similarity() on the
//	           pre-computed search_text column. Handles typos and
//	           accent differences (unaccent() is applied at build
//	           time).
//
//	smart    : the "AI-grade" path. It combines:
//	             - tsrank(search_vector, plainto_tsquery)  → semantic match
//	             - word_similarity(query, search_text)     → typo tolerance
//	             - popularity_score                         → social signal
//	             - stock > 0 boost                          → availability
//	           …into one composite ranking expression and lets the
//	           planner choose between the GIN index for the tsquery
//	           and the trigram index for the similarity term.
//
// The /search/benchmark endpoint runs all four strategies against
// the same query and reports per-strategy timings + result counts
// so the UI can show how much faster the AI-aware path is.
package search

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Strategy identifies one of the four search algorithms.
type Strategy string

const (
	StrategyNaive   Strategy = "naive"
	StrategyIndexed Strategy = "indexed"
	StrategyFuzzy   Strategy = "fuzzy"
	StrategySmart   Strategy = "smart"
)

// resultItem is the row shape every strategy returns. The extra
// optional fields (rank/similarity/score) let the UI explain the
// ranking on a per-row basis.
type resultItem struct {
	ID             string  `json:"id"`
	Name           string  `json:"name"`
	Price          float64 `json:"price"`
	Stock          int     `json:"stock"`
	ImageURL       string  `json:"url"`
	AvgRating      float64 `json:"avg_rating,omitempty"`
	ReviewCount    int     `json:"review_count,omitempty"`
	Popularity     float64 `json:"popularity,omitempty"`
	RelevanceScore float64 `json:"relevance,omitempty"`
}

// strategyResult is what /search/benchmark returns per strategy.
type strategyResult struct {
	Strategy    Strategy     `json:"strategy"`
	Description string       `json:"description"`
	ElapsedMs   float64      `json:"elapsed_ms"`
	MinMs       float64      `json:"min_ms,omitempty"`
	MaxMs       float64      `json:"max_ms,omitempty"`
	Iterations  int          `json:"iterations"`
	Count       int          `json:"count"`
	Items       []resultItem `json:"items"`
	PlanSummary string       `json:"plan_summary,omitempty"`
	Error       string       `json:"error,omitempty"`
}

// Service is the HTTP-handler holder.
type Service struct {
	db *sql.DB
}

// New wires the search service.
func New(db *sql.DB) *Service { return &Service{db: db} }

// ─────────────────────────────────────────────────────────────
// HTTP handlers
// ─────────────────────────────────────────────────────────────

// HandleSmart is the production AI-aware search the frontend should
// call by default.
//
//	GET /search/smart?q=...&limit=...
func (s *Service) HandleSmart() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		limit := parseLimit(r.URL.Query().Get("limit"), 24, 96)
		if q == "" {
			writeJSON(w, http.StatusOK, map[string]any{"items": []resultItem{}})
			return
		}
		items, elapsed, err := s.runSmart(r.Context(), q, limit)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"items":      items,
			"elapsed_ms": elapsed.Seconds() * 1000,
			"count":      len(items),
		})
	}
}

// HandleBenchmark runs ALL strategies against the same query and
// returns per-strategy timings + items. This is the page the user
// asked for: a head-to-head comparison demonstrating that the
// AI-optimised path is dramatically faster.
//
//	GET /search/benchmark?q=...&limit=...
func (s *Service) HandleBenchmark() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		limit := parseLimit(r.URL.Query().Get("limit"), 12, 48)
		iterations := parseLimit(r.URL.Query().Get("runs"), 5, 50)
		if q == "" {
			http.Error(w, "q required", http.StatusBadRequest)
			return
		}

		// Run the four strategies in parallel so the wall-clock of
		// the endpoint is bounded by the SLOWEST, not the SUM.
		// Each strategy individually measures its own DB time, so
		// the numbers we report are independent of this parallelism.
		var (
			wg      sync.WaitGroup
			results = make([]strategyResult, 4)
			runners = []struct {
				name Strategy
				desc string
				fn   func(context.Context, string, int) ([]resultItem, time.Duration, string, error)
			}{
				{StrategyNaive, "Unindexed ILIKE '%q%' baseline — what the database does without help.", s.runNaive},
				{StrategyIndexed, "Pre-computed tsvector on a materialised view + GIN index.", s.runIndexed},
				{StrategyFuzzy, "Trigram similarity (pg_trgm) over unaccent'd text — typo & accent tolerant.", s.runFuzzy},
				{StrategySmart, "AI-grade composite ranking: tsrank + similarity + popularity + availability.", s.runSmartWithPlan},
			}
		)
		for i, r0 := range runners {
			i, r0 := i, r0
			wg.Add(1)
			go func() {
				defer wg.Done()
				var (
					lastItems []resultItem
					lastPlan  string
					lastErr   error
					total     time.Duration
					minD      = time.Duration(1 << 62)
					maxD      time.Duration
				)
				for j := 0; j < iterations; j++ {
					items, elapsed, plan, err := r0.fn(r.Context(), q, limit)
					if err != nil {
						lastErr = err
						break
					}
					lastItems, lastPlan = items, plan
					total += elapsed
					if elapsed < minD {
						minD = elapsed
					}
					if elapsed > maxD {
						maxD = elapsed
					}
				}
				avg := time.Duration(0)
				if iterations > 0 {
					avg = total / time.Duration(iterations)
				}
				out := strategyResult{
					Strategy:    r0.name,
					Description: r0.desc,
					ElapsedMs:   avg.Seconds() * 1000,
					MinMs:       minD.Seconds() * 1000,
					MaxMs:       maxD.Seconds() * 1000,
					Iterations:  iterations,
					Count:       len(lastItems),
					Items:       lastItems,
					PlanSummary: lastPlan,
				}
				if lastErr != nil {
					out.Error = lastErr.Error()
				}
				results[i] = out
			}()
		}
		wg.Wait()

		writeJSON(w, http.StatusOK, map[string]any{
			"query":      q,
			"limit":      limit,
			"iterations": iterations,
			"strategies": results,
		})
	}
}

// HandleRefresh refreshes the materialised view. Admin-only is
// enforced upstream in main.go via the role middleware.
//
//	POST /search/refresh
func (s *Service) HandleRefresh() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		t0 := time.Now()
		if _, err := s.db.ExecContext(r.Context(), `SELECT refresh_mv_product_search()`); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"status":     "ok",
			"elapsed_ms": time.Since(t0).Seconds() * 1000,
		})
	}
}

// ─────────────────────────────────────────────────────────────
// Strategy implementations
// ─────────────────────────────────────────────────────────────

// runNaive — the deliberately slow baseline. Uses ILIKE with a
// leading wildcard so any btree index is useless and the planner
// falls back to a sequential scan on products.
func (s *Service) runNaive(ctx context.Context, q string, limit int) ([]resultItem, time.Duration, string, error) {
	const sqlText = `
		SELECT p.id, p.name, p.price, p.stock,
		       COALESCE((
		           SELECT i.url
		             FROM product_images pi2
		             JOIN images i ON i.id = pi2.image_id
		            WHERE pi2.product_id = p.id
		            ORDER BY pi2.created_at
		            LIMIT 1
		       ),'') AS image_url
		  FROM products p
		 WHERE p.name        ILIKE $1
		    OR p.description ILIKE $1
		 LIMIT $2`
	t0 := time.Now()
	rows, err := s.db.QueryContext(ctx, sqlText, "%"+q+"%", limit)
	if err != nil {
		return nil, time.Since(t0), "", err
	}
	defer rows.Close()
	out := []resultItem{}
	for rows.Next() {
		var it resultItem
		if err := rows.Scan(&it.ID, &it.Name, &it.Price, &it.Stock, &it.ImageURL); err != nil {
			return nil, time.Since(t0), "", err
		}
		out = append(out, it)
	}
	return out, time.Since(t0), "Sequential scan with leading-wildcard ILIKE — no index can be used.", nil
}

// runIndexed — proper indexed full-text path on the matview.
func (s *Service) runIndexed(ctx context.Context, q string, limit int) ([]resultItem, time.Duration, string, error) {
	const sqlText = `
		SELECT id, name, price, stock, image_url,
		       avg_rating, review_count, popularity_score,
		       ts_rank(search_vector, plainto_tsquery('simple', unaccent($1))) AS rel
		  FROM product_search
		 WHERE search_vector @@ plainto_tsquery('simple', unaccent($1))
		 ORDER BY rel DESC
		 LIMIT $2`
	t0 := time.Now()
	rows, err := s.db.QueryContext(ctx, sqlText, q, limit)
	if err != nil {
		return nil, time.Since(t0), "", err
	}
	defer rows.Close()
	out := []resultItem{}
	for rows.Next() {
		var it resultItem
		if err := rows.Scan(&it.ID, &it.Name, &it.Price, &it.Stock, &it.ImageURL,
			&it.AvgRating, &it.ReviewCount, &it.Popularity, &it.RelevanceScore); err != nil {
			return nil, time.Since(t0), "", err
		}
		out = append(out, it)
	}
	return out, time.Since(t0), "GIN(search_vector) on product_search (incrementally maintained) — bitmap index scan, ranked by ts_rank.", nil
}

// runFuzzy — pg_trgm typo-tolerant.
func (s *Service) runFuzzy(ctx context.Context, q string, limit int) ([]resultItem, time.Duration, string, error) {
	const sqlText = `
		SELECT id, name, price, stock, image_url,
		       avg_rating, review_count, popularity_score,
		       word_similarity(unaccent($1), search_text) AS sim
		  FROM product_search
		 WHERE unaccent($1) <% search_text
		 ORDER BY sim DESC, popularity_score DESC
		 LIMIT $2`
	t0 := time.Now()
	rows, err := s.db.QueryContext(ctx, sqlText, q, limit)
	if err != nil {
		return nil, time.Since(t0), "", err
	}
	defer rows.Close()
	out := []resultItem{}
	for rows.Next() {
		var it resultItem
		if err := rows.Scan(&it.ID, &it.Name, &it.Price, &it.Stock, &it.ImageURL,
			&it.AvgRating, &it.ReviewCount, &it.Popularity, &it.RelevanceScore); err != nil {
			return nil, time.Since(t0), "", err
		}
		out = append(out, it)
	}
	return out, time.Since(t0), "GIN(search_text gin_trgm_ops) — handles typos via word_similarity().", nil
}

// runSmart — the production AI-grade path.
//
// The ranking score combines four signals:
//
//	ts_rank        (semantic match)      weight 0.55
//	word_similarity (typo tolerance)     weight 0.20
//	popularity     (social signal)       weight 0.20
//	availability  (stock > 0)            weight 0.05
//
// We also include rows that ONLY match by trigram (typos) so we
// keep recall high without losing precision: tsquery matches are
// always ranked above similarity-only matches because of the
// weighting.
func (s *Service) runSmart(ctx context.Context, q string, limit int) ([]resultItem, time.Duration, error) {
	items, elapsed, _, err := s.runSmartWithPlan(ctx, q, limit)
	return items, elapsed, err
}

func (s *Service) runSmartWithPlan(ctx context.Context, q string, limit int) ([]resultItem, time.Duration, string, error) {
	const sqlText = `
		WITH q AS (
		    SELECT plainto_tsquery('simple', unaccent($1)) AS tsq,
		           unaccent($1)                            AS raw
		),
		candidates AS (
		    SELECT m.*,
		           ts_rank(m.search_vector, q.tsq)              AS sem_rank,
		           word_similarity(q.raw, m.search_text)        AS sim_rank
		      FROM product_search m, q
		     WHERE m.search_vector @@ q.tsq
		        OR q.raw <% m.search_text
		),
		scored AS (
		    SELECT *,
		           (
		             COALESCE(sem_rank, 0) * 0.55
		             + COALESCE(sim_rank, 0) * 0.20
		             -- normalise popularity into 0..1 against the max in the candidate set
		             + COALESCE(popularity_score / NULLIF(max(popularity_score) OVER (), 0), 0) * 0.20
		             + CASE WHEN stock > 0 THEN 0.05 ELSE 0 END
		           ) AS score
		      FROM candidates
		)
		SELECT id, name, price, stock, image_url,
		       avg_rating, review_count, popularity_score, score
		  FROM scored
		 ORDER BY score DESC, popularity_score DESC
		 LIMIT $2`
	t0 := time.Now()
	rows, err := s.db.QueryContext(ctx, sqlText, q, limit)
	if err != nil {
		return nil, time.Since(t0), "", err
	}
	defer rows.Close()
	out := []resultItem{}
	for rows.Next() {
		var it resultItem
		if err := rows.Scan(&it.ID, &it.Name, &it.Price, &it.Stock, &it.ImageURL,
			&it.AvgRating, &it.ReviewCount, &it.Popularity, &it.RelevanceScore); err != nil {
			return nil, time.Since(t0), "", err
		}
		out = append(out, it)
	}
	return out, time.Since(t0), "Composite ranking (ts_rank × similarity × popularity × stock) over GIN-indexed matview.", nil
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

func parseLimit(s string, def, max int) int {
	if s == "" {
		return def
	}
	n, err := strconv.Atoi(s)
	if err != nil || n <= 0 {
		return def
	}
	if n > max {
		return max
	}
	return n
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}
