SHELL := /bin/bash
DATABASE_URL ?= $(shell grep -E '^DATABASE_URL=' .env 2>/dev/null | cut -d= -f2-)
MIGRATIONS_DIR := migrations

.PHONY: help build run vet test migrate-up migrate-down migrate-create migrate-version migrate-force fmt frontend-build

help:
	@echo "Targets:"
	@echo "  build            - go build ./..."
	@echo "  vet              - go vet ./..."
	@echo "  test             - go test ./..."
	@echo "  run              - go run ."
	@echo "  fmt              - gofmt -w ."
	@echo "  migrate-up       - apply all pending migrations"
	@echo "  migrate-down     - rollback last migration"
	@echo "  migrate-create name=foo - create new migration pair"
	@echo "  migrate-version  - print current version"
	@echo "  migrate-force v=N- force version (recover from dirty)"
	@echo "  frontend-build   - cd FrontEnd && npm run build"

build:
	go build ./...

vet:
	go vet ./...

test:
	go test ./...

run:
	go run .

fmt:
	gofmt -w .

# Use `go run` to invoke migrate CLI without requiring a separate binary install.
MIGRATE := go run -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate

migrate-up:
	$(MIGRATE) -path $(MIGRATIONS_DIR) -database "$(DATABASE_URL)" up

migrate-down:
	$(MIGRATE) -path $(MIGRATIONS_DIR) -database "$(DATABASE_URL)" down 1

migrate-version:
	$(MIGRATE) -path $(MIGRATIONS_DIR) -database "$(DATABASE_URL)" version

migrate-force:
	$(MIGRATE) -path $(MIGRATIONS_DIR) -database "$(DATABASE_URL)" force $(v)

migrate-create:
	@if [ -z "$(name)" ]; then echo "usage: make migrate-create name=add_widgets"; exit 1; fi
	$(MIGRATE) create -ext sql -dir $(MIGRATIONS_DIR) -seq $(name)

frontend-build:
	cd FrontEnd && npm run build
