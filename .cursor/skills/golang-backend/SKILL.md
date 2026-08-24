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

- JWT Bearer; whitelist login/health; token claims only `user_id`
- JWT middleware loads active `UserInfo` from DB by `user_id` (status=1); failure → 401
- Sliding renew: when remaining TTL ≤ `renew_before_hours`, middleware issues new token via headers `X-New-Token` + `X-Token-Expires-At` (no refresh token)
- Comments in Chinese for business intent; mark `[PRD]` where rules come from PRD

## Attachments

- Direct batch images: `POST /api/attachments/images` (multipart `files` + `lat`/`lng`/`address`); watermark name from JWT `UserInfo` in context; return `data.list=[{file_id,url}]`
- `upload.chunk_size` is reserved (chunk upload not implemented); only `root`, `max_file_size`, `font` are used
- Business submits `file_uuids` (file_id 列表); backend Bind → `att_id` stored as `photo_ref_uuid`
- Table: `attachment_ref_items` (`att_id` + `file_id`)

## Docs

- Project docs: `doc/`
- Apifox import: `doc/apifox/openapi.yaml` (OpenAPI 3)

## Migration

- Config `migrate.enabled` / `migrate.seed` (env: `GBNT_MIGRATE_ENABLED`, `GBNT_MIGRATE_SEED`)
- **`server.mode=debug`**: every startup TRUNCATE business tables + full bootstrap (orgs, roles, APIs, admin `admin/123456`, dict)
- **`server.mode=release`**: `AutoMigrate` + `SyncSysAPIs`; seed only on empty DB when `migrate.seed=true`
- Package layout: `migrate.go` (entry), `schema.go`, `dev_reset.go`, `seed.go`, `rbac.go`, `org_seed.go`, `sync_apis.go`
- Soft delete: every table has `is_delete` (0/1); `Delete()` only flags, queries exclude deleted
- Column order: business fields first; embed `Base` (`id/created_at/updated_at/created_id/update_id/is_delete`) at struct end
- `created_id` / `update_id` filled from JWT `UserInfo` in request context via GORM callback
- OpLog stores `request` / `response` (masked) for POST/PUT/PATCH/DELETE `/api/*`
- Attachments: `POST /api/attachments/images`; disk `y/m/d/{orig}_{user_id}_{unix_ms}{ext}`; table `attachments` has `file_id`/`orig_name`/`file_name`; group table `attachment_ref_items` (`att_id` + `file_id`)

## Do not

- Put secrets in repo; use `.env.example`
- Log plaintext passwords
- Store file bytes in business tables
