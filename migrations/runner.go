package migrations

import (
	"errors"
	"fmt"
	"log/slog"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
)

// Run applies all pending migrations from sourcePath against the given databaseURL.
// It is idempotent: ErrNoChange is treated as success.
func Run(sourcePath, databaseURL string) error {
	m, err := migrate.New("file://"+sourcePath, databaseURL)
	if err != nil {
		return fmt.Errorf("migrate.New: %w", err)
	}
	defer func() {
		srcErr, dbErr := m.Close()
		if srcErr != nil {
			slog.Warn("migrate_close_source", "error", srcErr.Error())
		}
		if dbErr != nil {
			slog.Warn("migrate_close_db", "error", dbErr.Error())
		}
	}()
	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("migrate.Up: %w", err)
	}
	v, dirty, _ := m.Version()
	slog.Info("migrations_applied", "version", v, "dirty", dirty)
	return nil
}
