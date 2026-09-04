SERVER_DIR := apps/server

.PHONY: server-run server-test server-build frontend-typecheck check

server-run:
	cd $(SERVER_DIR) && go run .

server-test:
	cd $(SERVER_DIR) && go test ./...

server-build:
	cd $(SERVER_DIR) && go build ./...

frontend-typecheck:
	pnpm typecheck

check: server-test server-build frontend-typecheck
