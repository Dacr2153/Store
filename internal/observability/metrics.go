// Package observability provides minimal request/response metrics and a
// Prometheus-compatible /metrics handler. It avoids pulling in the full
// prometheus client to keep dependencies light; the exposition format
// emitted is the standard text format v0.0.4.
package observability

import (
	"fmt"
	"net/http"
	"sort"
	"sync"
	"sync/atomic"
	"time"
)

// Metric counters keyed by (method, path_template, status_class).
type key struct {
	Method     string
	Path       string
	StatusCode int
}

var (
	mu              sync.RWMutex
	requestCounters = map[key]*uint64{}
	durationSums    = map[key]*uint64{} // milliseconds
	startTime       = time.Now()
)

func incCounter(m *map[key]*uint64, k key, delta uint64) {
	mu.RLock()
	c, ok := (*m)[k]
	mu.RUnlock()
	if !ok {
		mu.Lock()
		c, ok = (*m)[k]
		if !ok {
			var v uint64
			c = &v
			(*m)[k] = c
		}
		mu.Unlock()
	}
	atomic.AddUint64(c, delta)
}

// Middleware wraps handlers and records request count + duration.
func Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		k := key{Method: r.Method, Path: simplifyPath(r.URL.Path), StatusCode: rec.status}
		incCounter(&requestCounters, k, 1)
		incCounter(&durationSums, k, uint64(time.Since(start).Milliseconds()))
	})
}

// Handler exposes /metrics in Prometheus text format.
func Handler() http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
		mu.RLock()
		defer mu.RUnlock()
		fmt.Fprintln(w, "# HELP process_uptime_seconds Server uptime in seconds")
		fmt.Fprintln(w, "# TYPE process_uptime_seconds counter")
		fmt.Fprintf(w, "process_uptime_seconds %d\n", int(time.Since(startTime).Seconds()))

		fmt.Fprintln(w, "# HELP http_requests_total Total HTTP requests")
		fmt.Fprintln(w, "# TYPE http_requests_total counter")
		keys := make([]key, 0, len(requestCounters))
		for k := range requestCounters {
			keys = append(keys, k)
		}
		sort.Slice(keys, func(i, j int) bool {
			if keys[i].Path != keys[j].Path {
				return keys[i].Path < keys[j].Path
			}
			if keys[i].Method != keys[j].Method {
				return keys[i].Method < keys[j].Method
			}
			return keys[i].StatusCode < keys[j].StatusCode
		})
		for _, k := range keys {
			fmt.Fprintf(w,
				"http_requests_total{method=%q,path=%q,status=%q} %d\n",
				k.Method, k.Path, statusClass(k.StatusCode), atomic.LoadUint64(requestCounters[k]))
		}
		fmt.Fprintln(w, "# HELP http_request_duration_ms_sum Total HTTP duration ms")
		fmt.Fprintln(w, "# TYPE http_request_duration_ms_sum counter")
		for _, k := range keys {
			d := durationSums[k]
			if d == nil {
				continue
			}
			fmt.Fprintf(w,
				"http_request_duration_ms_sum{method=%q,path=%q,status=%q} %d\n",
				k.Method, k.Path, statusClass(k.StatusCode), atomic.LoadUint64(d))
		}
	}
}

// statusRecorder captures the status code written by handlers.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func statusClass(code int) string {
	switch {
	case code >= 500:
		return "5xx"
	case code >= 400:
		return "4xx"
	case code >= 300:
		return "3xx"
	case code >= 200:
		return "2xx"
	default:
		return "1xx"
	}
}

// simplifyPath collapses path-id segments into placeholders so the
// metric cardinality remains bounded. e.g. /products/abc123 -> /products/:id
func simplifyPath(p string) string {
	// quick heuristic: tokens that look like ids become :id
	out := make([]byte, 0, len(p))
	parts := splitNonEmpty(p, '/')
	for _, seg := range parts {
		out = append(out, '/')
		if looksLikeID(seg) {
			out = append(out, ':', 'i', 'd')
		} else {
			out = append(out, seg...)
		}
	}
	if len(out) == 0 {
		return "/"
	}
	return string(out)
}

func splitNonEmpty(s string, sep byte) []string {
	var parts []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == sep {
			if i > start {
				parts = append(parts, s[start:i])
			}
			start = i + 1
		}
	}
	if start < len(s) {
		parts = append(parts, s[start:])
	}
	return parts
}

func looksLikeID(s string) bool {
	if len(s) >= 20 {
		return true
	}
	// uuid pattern
	if len(s) == 36 && s[8] == '-' && s[13] == '-' {
		return true
	}
	// pure numeric
	allDigits := len(s) > 0
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			allDigits = false
			break
		}
	}
	return allDigits && len(s) > 0
}
