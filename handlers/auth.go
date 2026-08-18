package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v4"
	"github.com/kevintovar01/Store/internal/auth"
	"github.com/kevintovar01/Store/internal/notify"
	"github.com/kevintovar01/Store/middleware"
	"github.com/kevintovar01/Store/models"
	"github.com/kevintovar01/Store/repository"
	"github.com/kevintovar01/Store/server"
	"github.com/segmentio/ksuid"
	"golang.org/x/crypto/bcrypt"
)

// AccessTokenTTL is the lifetime of issued JWT access tokens.
const AccessTokenTTL = 24 * time.Hour

type tokenPair struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresAt    int64  `json:"expires_at"`
}

func issueAccessToken(s server.Server, userID string) (string, time.Time, error) {
	exp := time.Now().Add(AccessTokenTTL)
	claims := models.AppClaims{
		UserId: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(exp),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(s.Config().JWTSecret))
	return signed, exp, err
}

// RefreshHandler issues a new (access, refresh) pair given a valid refresh token.
// The previous refresh is revoked (rotation).
func RefreshHandler(s server.Server) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			RefreshToken string `json:"refresh_token"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.RefreshToken) == "" {
			http.Error(w, "refresh_token required", http.StatusBadRequest)
			return
		}
		svc := auth.New(s.DB())
		newRefresh, exp, userID, err := svc.Rotate(r.Context(), body.RefreshToken, r.UserAgent(), r.RemoteAddr)
		if err != nil {
			http.Error(w, "invalid or expired refresh token", http.StatusUnauthorized)
			return
		}
		accessTok, _, err := issueAccessToken(s, userID)
		if err != nil {
			http.Error(w, "token issue failed", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(tokenPair{
			AccessToken:  accessTok,
			RefreshToken: newRefresh,
			ExpiresAt:    exp.Unix(),
		})
	}
}

// LogoutHandler revokes a single refresh token.
func LogoutHandler(s server.Server) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			RefreshToken string `json:"refresh_token"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body.RefreshToken != "" {
			_ = auth.New(s.DB()).RevokeRefresh(r.Context(), body.RefreshToken)
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// LogoutAllHandler revokes every refresh token for the authenticated user.
func LogoutAllHandler(s server.Server) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token, err := middleware.TokenAuth(s, w, *r)
		if err != nil {
			http.Error(w, err.Error(), http.StatusUnauthorized)
			return
		}
		claims, ok := token.Claims.(*models.AppClaims)
		if !ok || !token.Valid {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}
		if err := auth.New(s.DB()).RevokeAllForUser(r.Context(), claims.UserId); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// VerifyEmailHandler consumes a verify_email token and marks the user verified.
// GET /auth/verify-email?token=xxx
func VerifyEmailHandler(s server.Server) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tok := strings.TrimSpace(r.URL.Query().Get("token"))
		if tok == "" {
			http.Error(w, "token required", http.StatusBadRequest)
			return
		}
		svc := auth.New(s.DB())
		userID, err := svc.ConsumeEmailToken(r.Context(), tok, auth.PurposeVerifyEmail)
		if err != nil {
			http.Error(w, "invalid or expired token", http.StatusBadRequest)
			return
		}
		if err := svc.MarkEmailVerified(r.Context(), userID); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "verified"})
	}
}

// ForgotPasswordHandler issues a reset_password token and enqueues an email.
// Always returns 200 to avoid leaking which emails exist.
func ForgotPasswordHandler(s server.Server) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Email string `json:"email"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid body", http.StatusBadRequest)
			return
		}
		body.Email = strings.TrimSpace(strings.ToLower(body.Email))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
		// Best-effort issue + enqueue (don't await; user cannot tell either way).
		// Use detached background context so the goroutine outlives the request.
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			user, err := repository.GetUserByEmail(ctx, body.Email)
			if err != nil || user.Id == "" {
				return
			}
			tok, err := auth.New(s.DB()).IssueEmailToken(ctx, user.Id, auth.PurposeResetPassword, auth.ResetTokenTTL)
			if err != nil {
				return
			}
			frontURL := os.Getenv("FRONTEND_URL")
			if frontURL == "" {
				frontURL = "http://localhost:5173"
			}
			_ = notify.NewQueue(s.DB()).Enqueue(ctx, user.Email, "reset_password", map[string]any{
				"reset_url": frontURL + "/auth/reset-password/" + tok,
				"ttl_min":   int(auth.ResetTokenTTL.Minutes()),
			})
		}()
	}
}

// ResetPasswordHandler consumes a reset_password token and sets a new password.
func ResetPasswordHandler(s server.Server) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Token       string `json:"token"`
			NewPassword string `json:"new_password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid body", http.StatusBadRequest)
			return
		}
		if !validatePassword(body.NewPassword) {
			http.Error(w, "password must be at least 8 characters", http.StatusBadRequest)
			return
		}
		svc := auth.New(s.DB())
		userID, err := svc.ConsumeEmailToken(r.Context(), body.Token, auth.PurposeResetPassword)
		if err != nil {
			http.Error(w, "invalid or expired token", http.StatusBadRequest)
			return
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(body.NewPassword), HASH_COST)
		if err != nil {
			http.Error(w, "hash failed", http.StatusInternalServerError)
			return
		}
		if err := svc.UpdatePassword(r.Context(), userID, string(hash)); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		// Revoke all sessions on password change.
		_ = svc.RevokeAllForUser(r.Context(), userID)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "password_updated"})
	}
}

// GoogleOAuthLoginHandler:
//   - If GOOGLE_CLIENT_ID is set: real OAuth implementation pending — returns 501.
//   - If OAUTH_GOOGLE_MOCK=1     : PROVISIONAL mock — body {"email":"x@example.com"} (or default)
//     authenticates as that email, creating the user if absent, and returns the same
//     {access_token,refresh_token,expires_at,token} pair as POST /login.
//   - Otherwise: 501 with explanatory error.
func GoogleOAuthLoginHandler(s server.Server) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		mock := os.Getenv("OAUTH_GOOGLE_MOCK") == "1"
		if !mock && os.Getenv("GOOGLE_CLIENT_ID") == "" {
			http.Error(w, "Google OAuth not configured: set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URL — or OAUTH_GOOGLE_MOCK=1 for the dev bridge", http.StatusNotImplemented)
			return
		}
		if !mock {
			http.Error(w, "Google OAuth real flow pending — credentials detected, contact maintainer", http.StatusNotImplemented)
			return
		}
		// PROVISIONAL mock branch
		var body struct {
			Email string `json:"email"`
			Name  string `json:"name"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		email := strings.TrimSpace(strings.ToLower(body.Email))
		if email == "" {
			email = "mockuser@google-mock.local"
		}
		user, err := repository.GetUserByEmail(r.Context(), email)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if user == nil || user.Id == "" {
			// auto-create the mock user with a random password (cannot be used to log in normally)
			randPass, _ := bcrypt.GenerateFromPassword([]byte("mock-"+time.Now().Format(time.RFC3339Nano)), bcrypt.DefaultCost)
			id, err2 := ksuid.NewRandom()
			if err2 != nil {
				http.Error(w, err2.Error(), http.StatusInternalServerError)
				return
			}
			newUser := models.User{Id: id.String(), Email: email, Password: string(randPass)}
			if err := repository.InsertUser(r.Context(), &newUser); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			user = &newUser
		}
		claims := models.AppClaims{
			UserId: user.Id,
			RegisteredClaims: jwt.RegisteredClaims{
				ExpiresAt: jwt.NewNumericDate(time.Now().Add(AccessTokenTTL)),
				IssuedAt:  jwt.NewNumericDate(time.Now()),
			},
		}
		tokString, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(s.Config().JWTSecret))
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		refresh, exp, err := auth.New(s.DB()).IssueRefresh(r.Context(), user.Id, r.UserAgent(), r.RemoteAddr)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"access_token":  tokString,
			"token":         tokString,
			"refresh_token": refresh,
			"expires_at":    exp.Unix(),
			"user":          map[string]string{"id": user.Id, "email": user.Email},
			"_note":         "PROVISIONAL Google OAuth mock — replace with real flow when GOOGLE_CLIENT_ID/SECRET are provided",
		})
	}
}

// Sentinel
var _ = errors.New
