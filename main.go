package main

import (
	"context"
	"encoding/json"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/golang-jwt/jwt/v4"
	"github.com/gorilla/mux"
	"github.com/joho/godotenv"
	"github.com/kevintovar01/Store/handlers"
	"github.com/kevintovar01/Store/internal/aichat"
	"github.com/kevintovar01/Store/internal/catalog"
	"github.com/kevintovar01/Store/internal/commerce"
	"github.com/kevintovar01/Store/internal/loyalty"
	"github.com/kevintovar01/Store/internal/notify"
	"github.com/kevintovar01/Store/internal/observability"
	"github.com/kevintovar01/Store/internal/orders"
	"github.com/kevintovar01/Store/internal/recommend"
	"github.com/kevintovar01/Store/internal/returns"
	"github.com/kevintovar01/Store/internal/search"
	"github.com/kevintovar01/Store/internal/vendor"
	"github.com/kevintovar01/Store/middleware"
	"github.com/kevintovar01/Store/migrations"
	"github.com/kevintovar01/Store/models"
	"github.com/kevintovar01/Store/server"
)

func main() {
	// Init slog as global logger with JSON output
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))

	if err := godotenv.Load(".env"); err != nil {
		slog.Warn("env_load_failed", "error", err.Error())
	}

	PORT := os.Getenv("PORT")
	JWT_SECRET := os.Getenv("JWT_SECRET")
	DATABASE_URL := os.Getenv("DATABASE_URL")

	// Apply pending DB migrations (idempotent). Skip with SKIP_MIGRATIONS=1.
	if os.Getenv("SKIP_MIGRATIONS") != "1" {
		if err := migrations.Run("migrations", DATABASE_URL); err != nil {
			log.Fatalf("migrations failed: %v", err)
		}
	}

	s, err := server.NewServer(context.Background(), &server.Config{
		Port:        PORT,
		JWTSecret:   JWT_SECRET,
		DatabaseUrl: DATABASE_URL,
	})
	if err != nil {
		log.Fatal(err)
	}

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	workerCtx, cancelWorker := context.WithCancel(context.Background())
	defer cancelWorker()

	go s.Start(BindRoutes)

	// Start email worker once DB is initialized by server.Start (poll-based fallback).
	go func() {
		// small delay to ensure server.db is set
		time.Sleep(500 * time.Millisecond)
		if s.DB() == nil {
			return
		}
		notify.NewWorker(s.DB(), notify.SelectSenderWithDB(s.DB())).Run(workerCtx)
	}()

	log.Println("Server started. Press Ctrl+C to stop.")
	<-quit
	log.Println("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := s.Shutdown(ctx); err != nil {
		log.Println("error during shutdown:", err)
	}
}

func BindRoutes(s server.Server, r *mux.Router) {
	r.PathPrefix("/uploads/").Handler(
		http.StripPrefix("/uploads/",
			http.FileServer(http.Dir("./uploads"))),
	)

	// API documentation (Redoc rendering of api/openapi.yaml)
	r.HandleFunc("/docs", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./api/docs.html")
	}).Methods(http.MethodGet)
	r.PathPrefix("/api/").Handler(http.StripPrefix("/api/", http.FileServer(http.Dir("./api"))))

	r.Use(middleware.CheckAuthMiddleware(s))

	// Health
	r.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	}).Methods(http.MethodGet)

	// Metrics (Phase P)
	r.HandleFunc("/metrics", observability.Handler()).Methods(http.MethodGet)

	// Users / auth
	r.HandleFunc("/", handlers.HomeHandler(s)).Methods(http.MethodGet)
	r.HandleFunc("/signup", middleware.RateLimitAuth(handlers.SingUpHandler(s))).Methods(http.MethodPost)
	r.HandleFunc("/signupBusiness", middleware.RateLimitAuth(handlers.InsertUserBusinessHandler(s))).Methods(http.MethodPost)
	r.HandleFunc("/login", middleware.RateLimitAuth(handlers.LoginHandler(s))).Methods(http.MethodPost)
	r.HandleFunc("/me", handlers.MyHandler(s)).Methods(http.MethodGet)
	r.HandleFunc("/me", handlers.UpdateProfileHandler(s)).Methods(http.MethodPut)

	// Auth: refresh / logout / email verify / password reset / OAuth
	r.HandleFunc("/auth/refresh", middleware.RateLimitAuth(handlers.RefreshHandler(s))).Methods(http.MethodPost)
	r.HandleFunc("/auth/logout", handlers.LogoutHandler(s)).Methods(http.MethodPost)
	r.HandleFunc("/auth/logout-all", handlers.LogoutAllHandler(s)).Methods(http.MethodPost)
	r.HandleFunc("/auth/verify-email", handlers.VerifyEmailHandler(s)).Methods(http.MethodGet)
	r.HandleFunc("/auth/forgot-password", middleware.RateLimitAuth(handlers.ForgotPasswordHandler(s))).Methods(http.MethodPost)
	r.HandleFunc("/auth/reset-password", middleware.RateLimitAuth(handlers.ResetPasswordHandler(s))).Methods(http.MethodPost)
	r.HandleFunc("/auth/google/login", handlers.GoogleOAuthLoginHandler(s)).Methods(http.MethodGet, http.MethodPost)

	// Products
	r.HandleFunc("/products", middleware.RoleProxy([]string{"admin"}, s)(handlers.InsertProductHandler(s))).Methods(http.MethodPost)
	r.HandleFunc("/image/{id}", middleware.RoleProxy([]string{"admin"}, s)(handlers.InsertImageHandler(s))).Methods(http.MethodPost)
	// Phase N: recommendations — MUST be registered before /products/{id} to avoid mux capture
	recSvc := recommend.New(s)
	r.HandleFunc("/products/recently-viewed", recSvc.HandleRecentlyViewed()).Methods(http.MethodGet)
	r.HandleFunc("/products/trending", recSvc.HandleTrending()).Methods(http.MethodGet)
	r.HandleFunc("/products/{id}/view", recSvc.HandleTrackView()).Methods(http.MethodPost)
	r.HandleFunc("/products/{id}", handlers.GetProductByIdHandler(s)).Methods(http.MethodGet)
	r.HandleFunc("/products/{id}", middleware.RoleProxy([]string{"admin"}, s)(handlers.UpdateProductHandler(s))).Methods(http.MethodPut)
	r.HandleFunc("/products/{id}", middleware.RoleProxy([]string{"admin"}, s)(handlers.DeleteProductHandler(s))).Methods(http.MethodDelete)
	r.HandleFunc("/products", handlers.ListProductHandler(s)).Methods(http.MethodGet)

	// Catalog (Phase D)
	catalogSvc := catalog.New(s.DB())
	r.HandleFunc("/categories/tree", catalogSvc.HandleCategoryTree()).Methods(http.MethodGet)
	r.HandleFunc("/categories/{slug}/products", catalogSvc.HandleCategoryProducts()).Methods(http.MethodGet)
	r.HandleFunc("/products/{id}/variants", catalogSvc.HandleListVariants()).Methods(http.MethodGet)
	r.HandleFunc("/products/{id}/variants", middleware.RoleProxy([]string{"admin"}, s)(catalogSvc.HandleCreateVariant())).Methods(http.MethodPost)
	r.HandleFunc("/products/{id}/variants/{variantId}", middleware.RoleProxy([]string{"admin"}, s)(catalogSvc.HandleDeleteVariant())).Methods(http.MethodDelete)
	r.HandleFunc("/products/{id}/related", catalogSvc.HandleRelated()).Methods(http.MethodGet)
	r.HandleFunc("/search", catalogSvc.HandleSearch()).Methods(http.MethodGet)
	r.HandleFunc("/search/suggest", catalogSvc.HandleSuggest()).Methods(http.MethodGet)

	// AI-grade optimised search: smart endpoint + head-to-head benchmark.
	searchSvc := search.New(s.DB())
	r.HandleFunc("/search/smart", searchSvc.HandleSmart()).Methods(http.MethodGet)
	r.HandleFunc("/search/benchmark", searchSvc.HandleBenchmark()).Methods(http.MethodGet)
	r.HandleFunc("/search/refresh", middleware.RoleProxy([]string{"admin"}, s)(searchSvc.HandleRefresh())).Methods(http.MethodPost)

	// Phase Q: AI Chat (shopping assistant) — requires authenticated user
	chatSvc := aichat.New(s)
	r.HandleFunc("/chat/sessions", chatSvc.HandleListSessions()).Methods(http.MethodGet)
	r.HandleFunc("/chat/sessions", chatSvc.HandleCreateSession()).Methods(http.MethodPost)
	r.HandleFunc("/chat/sessions/{id}", chatSvc.HandleDeleteSession()).Methods(http.MethodDelete)
	r.HandleFunc("/chat/sessions/{id}/messages", chatSvc.HandleListMessages()).Methods(http.MethodGet)
	r.HandleFunc("/chat/sessions/{id}/messages", chatSvc.HandleSendMessage()).Methods(http.MethodPost)

	// Cart
	r.HandleFunc("/addItem/{id}", handlers.AddItemHandler(s)).Methods(http.MethodPost)
	r.HandleFunc("/wishcar", handlers.ListItemHandler(s)).Methods(http.MethodGet)
	r.HandleFunc("/wishcar/{id}", handlers.RemoveItemHandler(s)).Methods(http.MethodDelete)

	// Wishlist v2 (Phase E) — persistent across devices
	wishSvc := commerce.New(s)
	r.HandleFunc("/wishlist", wishSvc.HandleList()).Methods(http.MethodGet)
	r.HandleFunc("/wishlist", wishSvc.HandleAdd()).Methods(http.MethodPost)
	r.HandleFunc("/wishlist/{product_id}", wishSvc.HandleRemove()).Methods(http.MethodDelete)

	// Reviews (Phase I)
	r.HandleFunc("/products/{id}/reviews", wishSvc.HandleListReviews()).Methods(http.MethodGet)
	r.HandleFunc("/products/{id}/reviews", wishSvc.HandleCreateReview()).Methods(http.MethodPost)
	r.HandleFunc("/reviews/{id}/helpful", wishSvc.HandleMarkHelpful()).Methods(http.MethodPost)

	// Orders
	r.HandleFunc("/orders", handlers.CreateOrderHandler(s)).Methods(http.MethodPost)
	r.HandleFunc("/orders", handlers.ListOrdersHandler(s)).Methods(http.MethodGet)
	r.HandleFunc("/orders/{id}", handlers.GetOrderHandler(s)).Methods(http.MethodGet)

	// Phase F/G/H: checkout, addresses, mock payments, order state machine
	ordSvc := orders.New(s)
	r.HandleFunc("/addresses", ordSvc.HandleListAddresses()).Methods(http.MethodGet)
	r.HandleFunc("/addresses", ordSvc.HandleCreateAddress()).Methods(http.MethodPost)
	r.HandleFunc("/checkout/quote", ordSvc.HandleQuote()).Methods(http.MethodPost)
	r.HandleFunc("/checkout", ordSvc.HandleCheckout()).Methods(http.MethodPost)
	r.HandleFunc("/payments/intent", ordSvc.HandleCreatePaymentIntent()).Methods(http.MethodPost)
	r.HandleFunc("/payments/{id}/confirm-mock", ordSvc.HandleConfirmPaymentMock()).Methods(http.MethodPost)
	// Stripe webhook (public endpoint, signature-verified). Activated when STRIPE_SECRET_KEY is set.
	r.HandleFunc("/payments/webhook", ordSvc.HandleStripeWebhook()).Methods(http.MethodPost)
	r.HandleFunc("/orders/{id}/history", ordSvc.HandleHistory()).Methods(http.MethodGet)
	r.HandleFunc("/orders/{id}/transition", middleware.RoleProxy([]string{"admin"}, s)(ordSvc.HandleTransition())).Methods(http.MethodPost)
	r.HandleFunc("/admin/orders", middleware.RoleProxy([]string{"admin"}, s)(ordSvc.HandleAdminListOrders())).Methods(http.MethodGet)
	r.HandleFunc("/admin/orders/{id}/mark-paid", middleware.RoleProxy([]string{"admin"}, s)(ordSvc.HandleAdminMarkPaid())).Methods(http.MethodPost)

	// Phase N: recommendations routes /products/recently-viewed, /trending, /{id}/view registered earlier (before /products/{id})

	// Phase K: vendor dashboard endpoints
	vendorSvc := vendor.New(s)
	r.HandleFunc("/vendor/products", vendorSvc.HandleListMyProducts()).Methods(http.MethodGet)
	r.HandleFunc("/vendor/orders", vendorSvc.HandleListMyOrders()).Methods(http.MethodGet)
	r.HandleFunc("/vendor/stats", vendorSvc.HandleStats()).Methods(http.MethodGet)

	// Returns / RMA (customer + admin)
	retSvc := returns.New(s)
	r.HandleFunc("/returns", retSvc.HandleListMine()).Methods(http.MethodGet)
	r.HandleFunc("/returns", retSvc.HandleCreate()).Methods(http.MethodPost)
	r.HandleFunc("/admin/returns", middleware.RoleProxy([]string{"admin"}, s)(retSvc.HandleAdminList())).Methods(http.MethodGet)
	r.HandleFunc("/admin/returns/{id}/{action}", middleware.RoleProxy([]string{"admin"}, s)(retSvc.HandleAdminTransition())).Methods(http.MethodPost)

	// Loyalty / referrals
	loyaltySvc := loyalty.New(s)
	r.HandleFunc("/loyalty/me", loyaltySvc.HandleMe()).Methods(http.MethodGet)
	r.HandleFunc("/loyalty/redeem", loyaltySvc.HandleRedeem()).Methods(http.MethodPost)

	// Wire orders -> loyalty so paying an order credits points without an import cycle.
	ordSvc.OnOrderPaid = func(ctx context.Context, uid, orderID string, total float64) {
		if err := loyaltySvc.AwardForOrderPaid(ctx, uid, orderID, total); err != nil {
			slog.Warn("loyalty_award_failed", "user", uid, "order", orderID, "error", err.Error())
		}
	}

	// Roles
	r.HandleFunc("/createRole", middleware.RoleProxy([]string{"admin"}, s)(handlers.CreateRoleHandler(s))).Methods(http.MethodPost)
	r.HandleFunc("/listRoles", middleware.RoleProxy([]string{"admin"}, s)(handlers.ListRolesHandler(s))).Methods(http.MethodGet)
	r.HandleFunc("/getRole", handlers.GetRoleHandler(s)).Methods(http.MethodGet)
	r.HandleFunc("/setRole", middleware.RoleProxy([]string{"admin"}, s)(handlers.SetRoleUserHandler(s))).Methods(http.MethodPost)
	r.HandleFunc("/getUserRoles", handlers.GetUserRolesHandler(s)).Methods(http.MethodGet)

	// Wire WS authenticator: accepts a JWT from the {type:"auth",token:...} handshake
	// frame and associates the connection with the user id for per-user broadcasts.
	s.Hub().SetAuthenticator(func(token string) (string, error) {
		t, err := jwt.ParseWithClaims(token, &models.AppClaims{}, func(t *jwt.Token) (interface{}, error) {
			return []byte(s.Config().JWTSecret), nil
		})
		if err != nil || t == nil || !t.Valid {
			if err == nil {
				err = jwt.ErrSignatureInvalid
			}
			return "", err
		}
		c, ok := t.Claims.(*models.AppClaims)
		if !ok || c == nil {
			return "", jwt.ErrSignatureInvalid
		}
		return c.UserId, nil
	})

	r.HandleFunc("/ws", s.Hub().HandleWebSocket)
}
