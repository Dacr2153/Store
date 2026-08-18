// Package auth provides refresh-token and email-token (verify/reset) flows.
// Tokens are opaque random strings; only their SHA-256 hash is persisted.
package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"time"
)

const (
	RefreshTokenTTL = 7 * 24 * time.Hour
	EmailTokenTTL   = 24 * time.Hour
	ResetTokenTTL   = 1 * time.Hour

	PurposeVerifyEmail   = "verify_email"
	PurposeResetPassword = "reset_password"
)

var (
	ErrInvalidToken = errors.New("invalid or expired token")
)

// generateOpaqueToken returns 32 cryptographically random bytes hex-encoded (64 chars).
func generateOpaqueToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("rand.Read: %w", err)
	}
	return hex.EncodeToString(b), nil
}

func hashToken(t string) string {
	sum := sha256.Sum256([]byte(t))
	return hex.EncodeToString(sum[:])
}

// stripPort returns the host portion of a possibly host:port address.
// Postgres INET cannot accept a port, so we drop it. Empty input -> empty output.
func stripPort(addr string) string {
	if addr == "" {
		return ""
	}
	if h, _, err := net.SplitHostPort(addr); err == nil {
		return h
	}
	return addr
}

// Service exposes auth-token operations.
type Service struct {
	db *sql.DB
}

func New(db *sql.DB) *Service { return &Service{db: db} }

// ---- REFRESH TOKENS ----

// IssueRefresh creates a new refresh token for the user and returns the plain token.
// The plain token is shown to the client only once; we store only its hash.
func (s *Service) IssueRefresh(ctx context.Context, userID, userAgent, ip string) (string, time.Time, error) {
	plain, err := generateOpaqueToken()
	if err != nil {
		return "", time.Time{}, err
	}
	exp := time.Now().Add(RefreshTokenTTL)
	ip = stripPort(ip)
	var ipArg interface{}
	if ip != "" {
		ipArg = ip
	}
	_, err = s.db.ExecContext(ctx,
		`INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip)
		 VALUES ($1,$2,$3,NULLIF($4,''),$5)`,
		userID, hashToken(plain), exp, userAgent, ipArg,
	)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("insert refresh: %w", err)
	}
	return plain, exp, nil
}

// ValidateRefresh returns the userID owning the token if active.
// On success, it does NOT rotate; caller can choose to rotate via Rotate.
func (s *Service) ValidateRefresh(ctx context.Context, plain string) (string, error) {
	var userID string
	err := s.db.QueryRowContext(ctx,
		`SELECT user_id FROM refresh_tokens
		 WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at > now()`,
		hashToken(plain),
	).Scan(&userID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrInvalidToken
	}
	if err != nil {
		return "", fmt.Errorf("query refresh: %w", err)
	}
	return userID, nil
}

// RevokeRefresh marks one refresh token as revoked.
func (s *Service) RevokeRefresh(ctx context.Context, plain string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE refresh_tokens SET revoked_at = now()
		 WHERE token_hash=$1 AND revoked_at IS NULL`,
		hashToken(plain),
	)
	return err
}

// RevokeAllForUser invalidates every active refresh token for the user.
func (s *Service) RevokeAllForUser(ctx context.Context, userID string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE refresh_tokens SET revoked_at = now()
		 WHERE user_id=$1 AND revoked_at IS NULL`,
		userID,
	)
	return err
}

// Rotate revokes the current refresh and issues a new one in a transaction.
func (s *Service) Rotate(ctx context.Context, oldPlain, userAgent, ip string) (string, time.Time, string, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", time.Time{}, "", err
	}
	defer func() { _ = tx.Rollback() }()

	var userID string
	err = tx.QueryRowContext(ctx,
		`UPDATE refresh_tokens SET revoked_at = now()
		 WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at > now()
		 RETURNING user_id`,
		hashToken(oldPlain),
	).Scan(&userID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", time.Time{}, "", ErrInvalidToken
	}
	if err != nil {
		return "", time.Time{}, "", err
	}

	newPlain, err := generateOpaqueToken()
	if err != nil {
		return "", time.Time{}, "", err
	}
	exp := time.Now().Add(RefreshTokenTTL)
	ip = stripPort(ip)
	var ipArg interface{}
	if ip != "" {
		ipArg = ip
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip)
		 VALUES ($1,$2,$3,NULLIF($4,''),$5)`,
		userID, hashToken(newPlain), exp, userAgent, ipArg,
	); err != nil {
		return "", time.Time{}, "", err
	}
	if err := tx.Commit(); err != nil {
		return "", time.Time{}, "", err
	}
	return newPlain, exp, userID, nil
}

// ---- EMAIL TOKENS (verify_email, reset_password) ----

// IssueEmailToken creates a single-use token for the given purpose.
// Returns the plain token (only this once).
func (s *Service) IssueEmailToken(ctx context.Context, userID, purpose string, ttl time.Duration) (string, error) {
	plain, err := generateOpaqueToken()
	if err != nil {
		return "", err
	}
	exp := time.Now().Add(ttl)
	_, err = s.db.ExecContext(ctx,
		`INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at)
		 VALUES ($1,$2,$3,$4)`,
		hashToken(plain), userID, purpose, exp,
	)
	if err != nil {
		return "", fmt.Errorf("insert email_token: %w", err)
	}
	return plain, nil
}

// ConsumeEmailToken validates and atomically marks the token as used.
// Returns the userID on success.
func (s *Service) ConsumeEmailToken(ctx context.Context, plain, purpose string) (string, error) {
	var userID string
	err := s.db.QueryRowContext(ctx,
		`UPDATE email_tokens
		 SET used_at = now()
		 WHERE token_hash=$1 AND purpose=$2 AND used_at IS NULL AND expires_at > now()
		 RETURNING user_id`,
		hashToken(plain), purpose,
	).Scan(&userID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrInvalidToken
	}
	if err != nil {
		return "", fmt.Errorf("consume email_token: %w", err)
	}
	return userID, nil
}

// MarkEmailVerified updates users.email_verified_at = now().
func (s *Service) MarkEmailVerified(ctx context.Context, userID string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE users SET email_verified_at = now() WHERE id=$1 AND email_verified_at IS NULL`,
		userID,
	)
	return err
}

// UpdatePassword sets a new bcrypt password hash for the user.
func (s *Service) UpdatePassword(ctx context.Context, userID, bcryptHash string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE users SET password=$1 WHERE id=$2`, bcryptHash, userID,
	)
	return err
}
