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

- JWT Bearer; whitelist login/health/captcha/public attachment download if needed
- Comments in Chinese for business intent; mark `[PRD]` where rules come from PRD

## Attachments

- Independent module: batch init + chunked resumable upload
- After complete, return/use `uuid`; business tables store UUID only

## Docs

- Project docs: `doc/`
- Apifox import: `doc/apifox/openapi.yaml` (OpenAPI 3)

## Migration

- GORM AutoMigrate on startup + versioned SQL in `internal/migrate/sql/`
- Record versions in `schema_migrations`

## Do not

- Put secrets in repo; use `.env.example`
- Log plaintext passwords
- Store file bytes in business tables
