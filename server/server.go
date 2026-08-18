package server

import (
	"context"
	"database/sql"
	"errors"
	"log"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gorilla/handlers"
	"github.com/gorilla/mux"
	"github.com/kevintovar01/Store/database"
	"github.com/kevintovar01/Store/internal/observability"
	"github.com/kevintovar01/Store/repository"
	"github.com/kevintovar01/Store/websocket"
)

type Config struct {
	Port        string
	JWTSecret   string //  secret key to generate tokens
	DatabaseUrl string // DB connection
}

type Server interface {
	Config() *Config
	Hub() *websocket.Hub
	DB() *sql.DB
}

// broker encargado de manejar los servidores
type Broker struct {
	config     *Config
	router     *mux.Router // define las rutas de la API
	hub        *websocket.Hub
	httpServer *http.Server
	db         *sql.DB
}

func (b *Broker) Config() *Config {
	return b.config
}

func (b *Broker) Hub() *websocket.Hub {
	return b.hub
}

func (b *Broker) DB() *sql.DB {
	return b.db
}

// patron factory method

func NewServer(ctx context.Context, config *Config) (*Broker, error) {

	// verification to fields are not empty
	if config.Port == "" {
		return nil, errors.New("port is required")
	}

	if config.JWTSecret == "" {
		return nil, errors.New("key secret is required")
	}

	if config.DatabaseUrl == "" {
		return nil, errors.New("db url is required")
	}

	broker := &Broker{
		config: config,
		router: mux.NewRouter(),
		hub:    websocket.NewHub(),
	}

	return broker, nil
}

func (b *Broker) Start(binder func(s Server, r *mux.Router)) {
	// Crea un nuevo enrutador de mux
	b.router = mux.NewRouter()

	// Inicializa el repositorio ANTES de bindear rutas para que los
	// handlers que usan s.DB() reciban una conexión válida.
	repo, err := database.NewPostgresRepository(b.config.DatabaseUrl)
	if err != nil {
		log.Fatal(err)
	}
	b.db = repo.DB()
	repository.SetRepository(repo)

	// Llama a la función binder para configurar las rutas del servidor
	binder(b, b.router)

	// Configurar orígenes permitidos desde env
	allowedOrigins := os.Getenv("ALLOWED_ORIGINS")
	if allowedOrigins == "" {
		allowedOrigins = "http://localhost:5173,http://localhost:5174,http://localhost:5175,http://127.0.0.1:5173,http://127.0.0.1:5174"
	}
	origins := strings.Split(allowedOrigins, ",")
	allowed := make(map[string]struct{}, len(origins))
	for _, o := range origins {
		allowed[strings.TrimSpace(o)] = struct{}{}
	}

	corsMiddleware := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" {
				if _, ok := allowed[origin]; ok {
					w.Header().Set("Access-Control-Allow-Origin", origin)
					w.Header().Add("Vary", "Origin")
					w.Header().Set("Access-Control-Allow-Credentials", "true")
					w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
					w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
					w.Header().Set("Access-Control-Max-Age", "600")
				}
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}

	handler := corsMiddleware(handlers.CompressHandler(observability.Middleware(requestLogger(b.router))))
	go b.hub.Run()

	log.Println("Start server on port", b.Config().Port)

	srv := &http.Server{
		Addr:              b.config.Port,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	b.httpServer = srv

	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal("ListenAndServe: ", err)
	}
}

// Shutdown realiza un shutdown graceful del servidor HTTP.
func (b *Broker) Shutdown(ctx context.Context) error {
	if b.httpServer == nil {
		return nil
	}
	return b.httpServer.Shutdown(ctx)
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

// requestLogger logs every HTTP request using slog with structured fields.
func requestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		slog.Info("http_request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", rec.status,
			"duration_ms", time.Since(start).Milliseconds(),
			"remote", r.RemoteAddr,
		)
	})
}
