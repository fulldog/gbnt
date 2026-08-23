# 高标农田专项整治 · 后台 API 文档

> 版本：v1 · Go **1.27** · Gin + Zap + MySQL + JWT + GORM  
> 前端参考：`demo/web`、`demo/miniapp`（本期只交付后台 API，不改前端）

## 1. 概述

后台为管理端与小程序 H5 提供 REST API（路径前缀分离）：

- 管理端：`/api/...`（鉴权、工作台、专项整改、台账、系统配置）
- 小程序：`/api/app/...`（登录、待办、上报、整改、我的）
- **独立附件服务** `/api/attachments/*`（两端共用；批量 init、分片断点续传，业务只存 UUID）

## 2. 运行环境

| 项 | 要求 |
| --- | --- |
| Go | **1.27**（`go.mod` 声明 `go 1.27.0` + `toolchain go1.27.0`） |
| MySQL | 5.7+ / 8.x，库名建议 `gbnt`，utf8mb4 |
| 操作系统 | Windows / Linux / macOS |

### 启动

```bash
cd backend
# 若 proxy.golang.org 超时，可先：
# go env -w GOPROXY=https://goproxy.cn,direct
# 编辑 configs/config.yaml 中 mysql.dsn
go mod tidy
go run ./cmd/server
```

默认监听 `:8080`。健康检查：`GET /api/health`。

种子管理员：`admin` / `123456`（生产务必修改）。

## 3. 统一约定

### 3.1 响应信封

```json
{
  "code": 0,
  "data": {},
  "message": "ok",
  "cost_ms": 12,
  "trace_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

| 字段 | 说明 |
| --- | --- |
| `code` | `0` 成功；`400/401/403/404/409/500` 与 HTTP 对齐 |
| `data` | 业务数据 |
| `message` | 短中文说明 |
| `cost_ms` | 本请求耗时（毫秒），同时响应头 `X-Response-Time` |
| `trace_id` | 请求链路 ID，响应头 `X-Request-Id` |

### 3.2 鉴权与滑动续期

除白名单外均需：

```http
Authorization: Bearer <token>
```

白名单：`/api/health`、`/api/auth/login`、`/api/app/auth/login`。

**滑动续期**（无 Refresh Token）：

| 配置 | 默认 | 说明 |
| --- | --- | --- |
| `jwt.expire_hours` | 72 | token 总有效期 |
| `jwt.renew_before_hours` | 24 | 剩余有效期 ≤ 该值时，本请求自动换发新 token |

换发后写入响应头（前端检测到则替换本地 token）：

```http
X-New-Token: <新 jwt>
X-Token-Expires-At: <RFC3339 过期时间>
```

已过期 token 不续期，直接 401，需重新登录。

### 3.3 日志

目录：`backend/logs/{info,access,error,slow,sql}/`。

| 类型 | 内容 |
| --- | --- |
| info | 启动、迁移等 |
| access | 请求/响应参数（脱敏）、耗时、trace、user |
| error | 异常与失败 |
| slow | SQL ≥ **200ms** |
| sql | 全部 SQL |

切割：文件名含日期；单文件 **>100MB** 滚动（lumberjack）。

### 3.4 迁移与软删

启动时 GORM `AutoMigrate` + 空库种子（组织、admin、角色、字典类型）。

**软删**：所有表含 `is_delete`（`0` 正常 / `1` 已删）。业务 `Delete` 只置位，查询自动过滤已删行（`gorm.io/plugin/soft_delete` flag 模式）。

**迁移开关**（`configs/config.yaml` → `migrate`）：

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `migrate.enabled` | `true` | 启动时是否执行 GORM AutoMigrate |
| `migrate.seed` | `true` | 是否写种子（仅 `enabled=true` 时生效） |

环境变量：`GBNT_MIGRATE_ENABLED`、`GBNT_MIGRATE_SEED`。
## 4. 附件约定

1. 分片上传完成后：`POST .../complete` 返回 `data.list = [{uuid, url}, ...]`
2. 业务提交传 **文件 uuid 列表** `file_uuids`；后台校验均存在且 ready，创建一对多关联，业务表只落 **`photo_ref_uuid` / `rectify_photo_ref_uuid`**
3. 明细查询反查关联，额外返回 `photos` / `rectify_photos`：`[{uuid, url}]`
4. **修改**：若传了 `photo_ref_uuid`（非空）→ 附件不变；若为空 → 用 `file_uuids` 重新关联
5. 也可单独：`POST /api/attachments/bind` → `{ref_uuid, list}`；`GET /api/attachments/refs/:ref_uuid` 反查

本地落盘：`backend/storage/uploads/<uuid>/`。URL 形如 `/api/attachments/{uuid}/download`。

## 5. 模块与路径一览

详见 [api.md](./api.md) 与 Apifox 导入文件 [apifox/openapi.yaml](./apifox/openapi.yaml)。

| 模块 | 前缀 |
| --- | --- |
| 健康检查 | `/api/health` |
| 鉴权（管理端） | `/api/auth` |
| 工作台 | `/api/workbench` |
| 专项整改 | `/api/issues` |
| 台账 | `/api/ledger` |
| 系统 | `/api/sys` |
| 附件（两端共用） | `/api/attachments` |
| **小程序 app API** | `/api/app` |

小程序能力对齐 `demo/miniapp`（登录 / 待办 / 上报 / 整改 / 我的）。附件上传走 `/api/attachments`，业务接口只收 `file_uuids`。详见 [api.md · 小程序 app API](./api.md)。

## 6. 配置要点

`backend/configs/config.yaml`：

- `mysql.dsn`：连接串
- `jwt.secret` / `expire_hours`
- `log.slow_sql_ms: 200`
- `log.max_size_mb: 100`
- `upload.root` / `chunk_size` / `max_file_size`

环境变量覆盖（前缀 `GBNT_`）：如 `GBNT_MYSQL_DSN`、`GBNT_JWT_SECRET`、`GBNT_SERVER_ADDR`。

## 7. 工程结构

```text
backend/
  cmd/server/main.go
  configs/config.yaml
  internal/{config,database,logger,migrate,model,handler,service}
  pkg/{response,jwtutil,middleware}
  storage/uploads/
  logs/
doc/
  README.md
  api.md
  apifox/openapi.yaml
```

## 8. 相关 Skill

Cursor Agent 规范：`.cursor/skills/golang-backend/SKILL.md`。
