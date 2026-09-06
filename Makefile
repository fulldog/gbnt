SERVER_DIR := apps/server

.PHONY: server-run server-test server-build server-db-check server-db-repair frontend-typecheck frontend-test check

server-run:
	cd $(SERVER_DIR) && go run .

server-test:
	cd $(SERVER_DIR) && go test ./...

server-build:
	cd $(SERVER_DIR) && go build ./...

server-db-check:
	go -C $(SERVER_DIR) run ./cmd/repair-rectify-rounds $(if $(strip $(CONFIG)),--config "$(CONFIG)")

server-db-repair:
	@test -n "$(strip $(DATABASE))" || { echo "请通过 DATABASE 指定已核对的准确数据库名" >&2; exit 1; }
	@test "$(BACKUP_CONFIRMED)" = "yes" || { echo "请先备份并暂停业务写入，再设置 BACKUP_CONFIRMED=yes" >&2; exit 1; }
	go -C $(SERVER_DIR) run ./cmd/repair-rectify-rounds $(if $(strip $(CONFIG)),--config "$(CONFIG)") --apply --database "$(DATABASE)" --backup-confirmed

frontend-typecheck:
	pnpm typecheck

frontend-test:
	pnpm test

check: server-test server-build frontend-typecheck frontend-test
