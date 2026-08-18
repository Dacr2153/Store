# FinalStore

Full-stack e-commerce platform with AI-powered virtual try-on, voice search, and real-time notifications. Built with Go (backend) + React/TypeScript (frontend) + PostgreSQL.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Go 1.24, gorilla/mux, golang-migrate |
| Frontend | React 18, TypeScript, Vite 5, Tailwind CSS, Zustand |
| Database | PostgreSQL 16 |
| AI Chat | Ollama (local LLM) |
| Auth | JWT (access + refresh tokens), Google OAuth |
| Payments | Stripe Checkout (+ mock fallback) |
| Deployment | Docker + Docker Compose |

---

## Features

- **Product catalog** with categories, variants, filtering, and full-text search
- **Smart search** — `pg_trgm` + `unaccent` + vector index (`btree_gin`)
- **Voice search** — browser Web Speech API → instant product query
- **Virtual Try-On** — AI chat session with product suggestions and camera support
- **Cart & Wishlist** — persistent per-user
- **Checkout** — Stripe-integrated with address management and shipping quote
- **Order lifecycle** — pending → paid → shipped → delivered, with history
- **Returns & refunds** — customer-initiated, admin-approved workflow
- **Loyalty points** — earned on purchase, redeemable at checkout
- **Vendor dashboard** — per-vendor product and order management
- **Admin panel** — orders, returns, role management, product CRUD
- **Email notifications** — transactional emails via SMTP or log fallback in dev
- **Dark mode** — system-aware, toggleable, fully applied across all pages
- **PWA** — service worker in production for offline support
- **Observability** — Prometheus-compatible `/metrics` endpoint

---

## Quick Start (Docker — recommended)

### Prerequisites

- Docker ≥ 24 and Docker Compose v2

## Quick Start (Docker — recommended)

### Prerequisites

- Docker ≥ 24 and Docker Compose v2
- **No need to install Go, Node.js, or PostgreSQL**

### 1. Clone and configure

```bash
git clone <repo-url>
cd FinalStore
cp .env.example .env
```

Open `.env` and at minimum change `JWT_SECRET` by a long random string. Everything else works with the defaults.

### 2. Launch everything

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

That's it. Docker will:
1. Start PostgreSQL and run all migrations automatically
2. Build and start the Go backend (port 5050, internal only)
3. Build the React frontend and serve it via nginx

### 3. Open in browser

```
http://localhost
```

If you are on another machine on the same network, replace `localhost` with the server's IP address.

To stop:

```bash
docker compose -f docker-compose.prod.yml down
```

To stop and delete the database:

```bash
docker compose -f docker-compose.prod.yml down -v
```

---

## Local Development (without Docker)

### Backend

```bash
# Requires: Go 1.24+, PostgreSQL running on localhost:5432
cp .env.example .env        # set DATABASE_URL, JWT_SECRET, etc.
go build -o store .
./store
# Migrations run automatically on startup
```

### Frontend

```bash
cd FrontEnd
npm install
npm run dev
# Runs on http://localhost:5174
```

---

## Environment Variables

Create a `.env` file at the project root (copy from `.env.example`):

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | Postgres DSN for local dev: `postgres://user:pass@localhost:5432/finalstore?sslmode=disable` |
| `DATABASE_URL_DOCKER` | ✅ | Postgres DSN for Docker: `postgres://user:pass@db:5432/finalstore?sslmode=disable` |
| `PORT` | ✅ | Backend listen port, e.g. `:5050` |
| `JWT_SECRET` | ✅ | Random secret for JWT signing (min 32 chars) |
| `ALLOWED_ORIGINS` | ✅ | Comma-separated CORS origins |
| `STRIPE_SECRET_KEY` | ❌ | Stripe secret key — omit to use built-in mock payments |
| `STRIPE_WEBHOOK_SECRET` | ❌ | Stripe webhook signing secret |
| `GOOGLE_CLIENT_ID` | ❌ | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | ❌ | Google OAuth client secret |
| `GOOGLE_REDIRECT_URL` | ❌ | OAuth callback URL |
| `SMTP_HOST` | ❌ | SMTP server for email — omit to log emails instead |
| `SMTP_PORT` | ❌ | SMTP port |
| `SMTP_USER` | ❌ | SMTP username |
| `SMTP_PASS` | ❌ | SMTP password |
| `OLLAMA_HOST` | ❌ | Ollama base URL for AI chat, e.g. `http://localhost:11434` |
| `RESEND_API_KEY` | ❌ | Resend.com API key (alternative to SMTP) |
| `POSTGRES_USER` | Docker | Postgres user (docker-compose.prod.yml) |
| `POSTGRES_PASSWORD` | Docker | Postgres password |
| `POSTGRES_DB` | Docker | Postgres database name |

---

## API Reference

All endpoints are served on port `:5050`. Protected routes require `Authorization: Bearer <token>`.

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/signup` | — | Register regular user |
| POST | `/signupBusiness` | — | Register business account |
| POST | `/login` | — | Login → returns access + refresh tokens |
| POST | `/auth/refresh` | — | Refresh access token |
| POST | `/auth/logout` | ✅ | Logout (revoke refresh token) |
| POST | `/auth/logout-all` | ✅ | Logout all devices |
| GET | `/auth/verify-email` | — | Verify email from link |
| POST | `/auth/forgot-password` | — | Send reset link |
| POST | `/auth/reset-password` | — | Apply new password |
| GET/POST | `/auth/google/login` | — | Google OAuth |
| GET | `/me` | ✅ | Get current user profile |
| PUT | `/me` | ✅ | Update profile |

### Products

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/products` | — | List products (pagination, filters) |
| GET | `/products/{id}` | — | Get product details |
| POST | `/products` | admin | Create product |
| PUT | `/products/{id}` | admin | Update product |
| DELETE | `/products/{id}` | admin | Delete product |
| POST | `/image/{id}` | admin | Upload product image |
| GET | `/products/{id}/variants` | — | List variants |
| POST | `/products/{id}/variants` | admin | Create variant |
| DELETE | `/products/{id}/variants/{variantId}` | admin | Delete variant |
| GET | `/products/{id}/related` | — | Related products |
| GET | `/products/{id}/reviews` | — | List reviews |
| POST | `/products/{id}/reviews` | ✅ | Submit review |
| POST | `/reviews/{id}/helpful` | ✅ | Mark review helpful |

### Search

| Method | Path | Description |
|--------|------|-------------|
| GET | `/search?q=...` | Full-text catalog search |
| GET | `/search/suggest?q=...` | Autocomplete suggestions |
| GET | `/search/smart?q=...` | AI-enhanced search with ranking |
| GET | `/search/benchmark` | Performance benchmark |
| POST | `/search/refresh` | Rebuild search index (admin) |

### Categories

| Method | Path | Description |
|--------|------|-------------|
| GET | `/categories/tree` | Full category tree |
| GET | `/categories/{slug}/products` | Products in category |

### Recommendations

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/products/recently-viewed` | ✅ | Recently viewed products |
| GET | `/products/trending` | — | Trending products |
| POST | `/products/{id}/view` | — | Track product view |

### Cart (WishCar)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/addItem/{id}` | ✅ | Add to cart |
| GET | `/wishcar` | ✅ | List cart items |
| DELETE | `/wishcar/{id}` | ✅ | Remove cart item |

### Wishlist

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/wishlist` | ✅ | Get wishlist |
| POST | `/wishlist` | ✅ | Add to wishlist |
| DELETE | `/wishlist/{product_id}` | ✅ | Remove from wishlist |

### Orders & Checkout

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/addresses` | ✅ | List saved addresses |
| POST | `/addresses` | ✅ | Add address |
| POST | `/checkout/quote` | ✅ | Shipping cost quote |
| POST | `/checkout` | ✅ | Place order |
| GET | `/orders` | ✅ | List my orders |
| GET | `/orders/{id}` | ✅ | Order detail |
| GET | `/orders/{id}/history` | ✅ | Order status history |
| POST | `/payments/intent` | ✅ | Create Stripe payment intent |
| POST | `/payments/{id}/confirm-mock` | ✅ | Confirm mock payment (dev) |
| POST | `/payments/webhook` | — | Stripe webhook |

### Admin — Orders

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/admin/orders` | admin | List all orders |
| POST | `/admin/orders/{id}/mark-paid` | admin | Mark order as paid |
| POST | `/orders/{id}/transition` | admin | Transition order state |

### Returns

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/returns` | ✅ | My return requests |
| POST | `/returns` | ✅ | Create return request |
| GET | `/admin/returns` | admin | All return requests |
| POST | `/admin/returns/{id}/{action}` | admin | Approve/reject return |

### Loyalty

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/loyalty/me` | ✅ | My points balance |
| POST | `/loyalty/redeem` | ✅ | Redeem points |

### Vendor

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/vendor/products` | vendor | My products |
| GET | `/vendor/orders` | vendor | My orders |
| GET | `/vendor/stats` | vendor | Sales stats |

### AI Chat (Virtual Try-On)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/chat/sessions` | ✅ | List chat sessions |
| POST | `/chat/sessions` | ✅ | New session |
| DELETE | `/chat/sessions/{id}` | ✅ | Delete session |
| GET | `/chat/sessions/{id}/messages` | ✅ | Message history |
| POST | `/chat/sessions/{id}/messages` | ✅ | Send message |

### Roles & System

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/createRole` | admin | Create role |
| GET | `/listRoles` | admin | List roles |
| GET | `/getRole` | ✅ | Get current user role |
| GET | `/health` | — | Health check |
| GET | `/metrics` | — | Prometheus metrics |

---

## Project Structure

```
FinalStore/
├── main.go                 # Entry point — wires server, DB, routes
├── go.mod / go.sum
├── Dockerfile              # Dev image (Air hot reload)
├── Dockerfile.prod         # Production multi-stage image
├── docker-compose.yml      # Dev stack (hot reload)
├── docker-compose.prod.yml # Production stack (nginx + static build)
├── Makefile                # Build / migrate helpers
├── .env                    # Local env vars (not committed)
├── .env.example            # Template for env vars
│
├── handlers/               # HTTP handler functions
├── middleware/             # Auth, rate limiting, CORS
├── models/                 # Shared data models
├── repository/             # Database abstraction
├── server/                 # Server interface
├── websocket/              # WebSocket hub
│
├── internal/               # Domain services
│   ├── aichat/             # AI chat with Ollama
│   ├── auth/               # Refresh & email token flows
│   ├── catalog/            # Categories, variants, search
│   ├── commerce/           # Wishlist, reviews
│   ├── imgutil/            # Image compression → WebP
│   ├── loyalty/            # Points engine
│   ├── notify/             # Transactional email
│   ├── observability/      # Prometheus metrics middleware
│   ├── orders/             # Order lifecycle + Stripe
│   ├── recommend/          # View tracking, trending, recently viewed
│   ├── returns/            # Returns workflow
│   ├── search/             # Smart search with pg_trgm
│   └── vendor/             # Vendor-scoped endpoints
│
├── migrations/             # SQL migrations (up + down)
├── database/               # PostgreSQL container setup
├── uploads/                # Product images (bind-mounted in Docker)
│
└── FrontEnd/
    ├── src/
    │   ├── api/            # Typed API client modules
    │   ├── components/     # Reusable UI components
    │   ├── pages/          # Route-level page components
    │   ├── store/          # Zustand stores + React contexts
    │   └── utils/          # Utility functions
    ├── Dockerfile          # Dev: Vite dev server / Prod: nginx
    ├── vite.config.ts
    └── tailwind.config.js
```

---

## Database Migrations

Migrations run automatically on backend startup. Migration files live in `migrations/` as numbered pairs (`000001_*.up.sql` / `000001_*.down.sql`).

---

## License

MIT
