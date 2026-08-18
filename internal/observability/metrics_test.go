package observability

// Smoke tests for observability path simplification and metrics counters.

import "testing"

func TestSimplifyPath(t *testing.T) {
	cases := map[string]string{
		"/products/abc12345678901234567/edit": "/products/:id/edit",
		"/products/123":                       "/products/:id",
		"/health":                             "/health",
		"/":                                   "/",
		"/users/3DVy5FVyxX055B0N12YHBEF5f2T":  "/users/:id",
	}
	for in, want := range cases {
		got := simplifyPath(in)
		if got != want {
			t.Errorf("simplifyPath(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestStatusClass(t *testing.T) {
	cases := map[int]string{200: "2xx", 301: "3xx", 404: "4xx", 500: "5xx", 100: "1xx"}
	for code, want := range cases {
		if got := statusClass(code); got != want {
			t.Errorf("statusClass(%d)=%q, want %q", code, got, want)
		}
	}
}
