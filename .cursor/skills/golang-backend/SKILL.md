---
name: golang-backend
description: >-
  Go backend conventions for gbnt (Gin + Zap + MySQL + JWT + GORM).
  Use when writing or changing backend/, API handlers, middleware, migrations,
  attachment upload, logging, or OpenAPI under doc/.
---

# gbnt Golang Backend

## Stack

- Go 1.27+, Gin, Zap + lumberjack, GORM + MySQL, golang-jwt
- Config: `backend/configs/config.yaml` + env override
- Attachments: local disk under `storage/uploads/`

## Layout

```text
backend/
  cmd/server/main.go
  configs/
  internal/{config,middleware,logger,model,migrate,handler,service,repo,upload}
  pkg/{response,jwtutil,traceid}
  storage/uploads/
  logs/{info,access,error,slow,sql}/
```

## API rules

- Prefix `/api`, kebab-case paths
- Envelope: `{ code, data, message, cost_ms, trace_id }` — success `code === 0`
- Return request duration in body `cost_ms` and header `X-Response-Time`
- Propagate `X-Request-Id` / `trace_id` through context → logs → SQL

## Logging

- Types: `info` / `access` / `error` / `slow` / `sql`
- Rotate by date filename + size > 100MB (lumberjack)
- Slow SQL threshold: 200ms (configurable)
- Every DB op logged to sql; slow duplicated to slow
- Access logs: request/response params (mask password/token) + chain via trace_id

## Auth

- JWT Bearer; whitelist login/health
- Sliding renew: when remaining TTL ≤ `renew_before_hours`, middleware issues new token via headers `X-New-Token` + `X-Token-Expires-At` (no refresh token)
- Comments in Chinese for business intent; mark `[PRD]` where rules come from PRD

## Attachments

- Independent module: batch init + chunked resumable upload
- Complete returns `data.list=[{uuid,url}]`
- Business submits `file_uuids`; backend Bind → `ref_uuid` stored on business row
- Tables: `attachment_refs` + `attachment_ref_items` (1:N)
- Query expands `ref_uuid` → `photos/rectify_photos` with real uuid+url
- Update: non-empty `photo_ref_uuid` = unchanged; empty = re-bind via `file_uuids`

## Docs

- Project docs: `doc/`
- Apifox import: `doc/apifox/openapi.yaml` (OpenAPI 3)

## Migration

- Config `migrate.enabled` / `migrate.seed` (env: `GBNT_MIGRATE_ENABLED`, `GBNT_MIGRATE_SEED`)
- When enabled: GORM AutoMigrate on startup; optional seed on empty DB
- Soft delete: every table has `is_delete` (0/1); `Delete()` only flags, queries exclude deleted
- Column order: business fields first; embed `Base` (`id/created_at/updated_at/is_delete`) at struct end

## Do not

- Put secrets in repo; use `.env.example`
- Log plaintext passwords
- Store file bytes in business tables
