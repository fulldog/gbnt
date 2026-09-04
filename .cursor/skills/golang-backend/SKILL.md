---
name: golang-backend
description: >-
  Go backend conventions for gbnt (Gin + Zap + MySQL + JWT + GORM).
  Use when writing or changing apps/server/, API handlers, middleware, migrations,
  attachment upload, or logging. Do not edit docs/api/ files unless the user
  explicitly asks to rebuild API docs.
---

# gbnt Golang Backend

## Stack

- Go 1.27+, Gin, Zap + lumberjack, GORM + MySQL, golang-jwt
- Config: `apps/server/configs/config.yaml` + env override
- Attachments: local disk under `storage/uploads/`

## Layout

```text
apps/server/
  cmd/server/main.go
  configs/
  internal/{config,middleware,logger,model,migrate,handler,service,repo,upload}
  pkg/{response,jwtutil,traceid,xlsxutil}
  storage/uploads/
  logs/{info,access,error,slow,sql}/
```

## API rules

- Prefix `/api`, kebab-case paths
- Envelope: `{ code, data, message, cost_ms, trace_id }` — success `code === 0`
- Return request duration in body `cost_ms` and header `X-Response-Time`
- Propagate `X-Request-Id` / `trace_id` through context → logs → SQL
- **Comments required**: every new/changed exported API type, handler, and request/response field needs Chinese comments (see `.cursor/rules/api-comments.mdc`)
- **Do not** update `docs/api/api.md` / `docs/api/apifox/openapi.yaml` during ordinary code changes. Only when the user explicitly asks to rebuild API docs: delete those files and rewrite them from current code.
- Every backend HTTP API addition, change, or deletion must also update the corresponding formal frontend API method and TypeScript types following the root `AGENTS.md`; never use `prototypes/static-demo/` as the target.

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
- Change password: `PUT /api/auth/password` (and app mirror) — JWT only, RBAC skip; Reset: `POST /api/sys/users/:id/reset-password` → password=username
- Logout: `POST /api/auth/logout` — ban JWT `jti` until expiry (in-process cache); password change/reset bumps `token_ver` to invalidate all tokens
- Comments in Chinese for business intent; mark `[PRD]` where rules come from PRD

## Attachments

- Direct batch images: `POST /api/attachments/images` (multipart `files` + optional `watermark`/`lat`/`lng`/`address`); `watermark` omit/true burns watermark (name from JWT `UserInfo`), `watermark=0` keeps original; return `data.list=[{file_id,url}]`
- `upload.chunk_size` is reserved (chunk upload not implemented); only `root`, `max_file_size`, `font` are used
- Quiz 多图：入参 `type_ext.checklist[].files`（file_id 列表），校验存在后原样写入 `issues.type_ext` JSON；无关联表
- 整改多图：入参 `rectify_list[].file_uuids`，落库 `issue_rectify_records.photo_file_ids`（JSON 数组）+ `quiz_type`
- 回显：`toVO` 按 file_id 查 `attachments`，checklist 各项填 `photos:[{file_id,url}]`，整改记录同理（含 `quiz_type`）；签名可返回 `reporter_signature`

## Issues (report / rectify)

- Status: `new` / `pending` / `done`; Create derives from QuizBool → `needs_rectify` (`false`→`done`, `true`→`new`)
- Region: 单一 `org_id`（`sys_orgs.id`，新建必填且须存在）；QuizBool = `{type,value,desc,mustImg,files}` in `type_ext.checklist[]`; `mustImg=true` 时 `files` 长度须 >0
- Create input aligned to miniapp wizard: no `project_name`/`description`/`measures`/`location_text`/`reporter_*`/`assignee_*` in API; `address` required; reporter=`created_id`; assignee=`assignee_user`（Rectify 写成当前用户）
- Rectify: body `rectify_list[]`（`type`/`note`/`file_uuids`，type 可重复）；`Need`=checklist 需整改 QuizType；`Covered`=历史∪本次；齐全 → `done` 否则 `pending`；`Need` 空 → `done`
- App `GET /api/app/todos`：登录用户组织子树 ∩ query `org_id` 子树（均含自身）；用户 `OrgID=0` 不限权限范围；`status` 空/`all` 查全部，排序 `new > pending > done`
- App rectify/re-rectify：`assignee_user>0` 且 ≠ 当前用户 → 拒绝；管理端不校验
- Admin `POST /api/issues/:id/reassign`：body `{assignee_user}`，须启用用户；只改认领人
- `POST .../re-rectify`：`done`→`pending`，不删历史（累计覆盖）

## Docs

- Project API docs live under `docs/api/` (`api.md`, Apifox `docs/api/apifox/openapi.yaml`)
- Agents must **not** patch these on feature work. Rebuild only on explicit user request: delete then rewrite from handlers/routes/DTOs.

## Migration

- Config `migrate.enabled` / `migrate.seed` (env: `GBNT_MIGRATE_ENABLED`, `GBNT_MIGRATE_SEED`)
- **`server.mode=debug` or `dev`**: every startup DROP all tables in the current database, AutoMigrate from models, then full seed (orgs, roles, APIs, super admin `admin/admin`). Do **not** write DROP COLUMN / legacy-table migrations for this mode.
- User super-admin: `sys_users.is_super_admin` (exactly one); cannot edit/delete that user; change/reset password allowed; RBAC bypass via flag
- **`server.mode=release`**: `AutoMigrate` + `SyncSysAPIs` only (additive; no history DROP scripts); seed only on empty DB when `migrate.seed=true`
- Package layout: `migrate.go` (entry), `schema.go`, `dev_reset.go`, `seed.go`, `rbac.go`, `org_seed.go`, `sync_apis.go`
- Soft delete: every table has `is_delete` (0/1); `Delete()` only flags, queries exclude deleted
- Column order: business fields first; embed `Base` (`id/created_at/updated_at/created_id/update_id/is_delete`) at struct end
- `created_id` / `update_id` filled from JWT `UserInfo` in request context via GORM callback
- OpLog stores `request` / `response` (masked) for POST/PUT/PATCH/DELETE `/api/*`
- Attachments: `POST /api/attachments/images` (optional `watermark`); disk `y/m/d/{orig}_{user_id}_{unix_ms}{ext}`; table `attachments` has `file_id`/`orig_name`/`file_name`; multi-image IDs stored as JSON on the business row, VO hydrates via `ListByFileIDs` / lookup

## Do not

- Put secrets in repo; use `.env.example`
- Log plaintext passwords
- Store file bytes in business tables
