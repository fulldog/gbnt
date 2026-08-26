# 高标农田专项整治 · 后台 API 文档

> 版本：v1 · Go **1.27** · Gin + Zap + MySQL + JWT + GORM  
> 前端参考：`demo/web`、`demo/miniapp`（本期只交付后台 API，不改前端）

## 1. 概述

后台为管理端与小程序 H5 提供 REST API（路径前缀分离）：

- 管理端：`/api/...`（鉴权、工作台、专项整改、台账、系统配置）
- 小程序：`/api/app/...`（登录、待办、上报、整改、我的）
- **附件直传** `POST /api/attachments/images`（两端共用 multipart 批量上传；排查多图走 `type_ext` 内 `files`，整改走 `file_uuids`，值为上传返回的 `file_id`）

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

种子管理员：`admin` / `admin`（name=超级管理员，org_id=0，role_id=0，phone 空，`is_super_admin=true`；生产务必修改）。

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

白名单：`/api/health`、`/api/auth/captcha`、`/api/auth/login`、`/api/app/auth/slider/start`、`/api/app/auth/slider/finish`、`/api/app/auth/login`。

**人机验证**（`captcha` 配置）：

| 端 | 方式 | 登录字段 |
| --- | --- | --- |
| Web `/api/auth/*` | 4 位数字图形码 | `captcha_id` + `captcha` |
| App `/api/app/auth/*` | 轻量滑动（start → finish → pass_token） | `pass_token` |

`captcha.enabled=false` 时两端可跳过人机步骤（本地压测）。会话存进程内 go-cache，带 TTL，校验成功即删。

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

**RBAC 接口权限**（`rbac.enabled`，默认 `true`）：

JWT 通过后，受保护接口按 `sys_apis` 目录校验；`role_id=1` 超管 bypass。同 `module` 下高阶 action（create/edit/delete/import/export）隐含 `view`。禁用角色（`sys_roles.status=0`）的用户无法登录，已签发 token 下次请求 401。`/api/auth/me`、`PUT /api/auth/password`、`POST /api/auth/logout`、`POST /api/attachments/images` 仅登录即可。**`/api/app/*` 小程序路由不入 sys_apis、不做 RBAC**（仅 JWT）。详见 [api.md · RBAC](./api.md)。

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

启动时 GORM `AutoMigrate`（刷新列类型/索引/**列注释**）+ 空库种子（组织、admin、角色）；并 `ALTER TABLE ... COMMENT` 写入表注释。启动时从 `internal/perm/registry.go` 同步 API 目录。

**审计字段**：`created_id` / `updated_id` 由 GORM 回调写入当前登录用户 ID。

**软删**：所有表含 `is_delete`（`0` 正常 / `1` 已删）。业务 `Delete` 只置位，查询自动过滤已删行（`gorm.io/plugin/soft_delete` flag 模式）。

**迁移开关**（`configs/config.yaml` → `migrate`）：

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `migrate.enabled` | `true` | 启动时是否执行 GORM AutoMigrate |
| `migrate.seed` | `true` | release 模式下空库是否写种子 |
| `server.mode` | `debug` | **`debug` 时每次启动 TRUNCATE 业务表并全量初始化**（忽略 `migrate.seed=false`） |

环境变量：`GBNT_MIGRATE_ENABLED`、`GBNT_MIGRATE_SEED`。
## 4. 附件约定

1. **上传**：`POST /api/attachments/images`（multipart 字段 `files` / `file` + 可选 `watermark`/`lat`/`lng`/`address`）→ `data.list = [{file_id, url}]`；`watermark` 省略或为真时逐张烧录水印（上报人取登录用户姓名），`watermark=0` 则原图入库
2. **访问**：文件 URL 为 **`/uploads/y/m/d/...`**（静态目录，非 API download 路由）
3. **排查多图**：`type_ext.checklist[].files` = `file_id` 数组，校验后原样写入 JSON（无关联表）
4. **整改多图**：body **`file_uuids`** = `file_id` 列表，落库 `photo_file_ids` JSON
5. **查询**：`toVO` 反查 `attachments`，checklist 各项带 **`photos:[{file_id,url}]`**；整改记录带 **`photos`**；可选 **`reporter_signature`**

本地落盘：`backend/storage/uploads/`（配置 `upload.root`）。单张大小受 `upload.max_file_size` 限制；一次最多 20 张。

> 分片 init/chunk/complete 等接口**当前未实现**。

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

小程序能力对齐 `demo/miniapp`（登录 / 待办 / 上报 / 整改 / 我的）。附件上传走 `/api/attachments`，排查图走 `type_ext.checklist[].files`，整改走 `file_uuids`。详见 [api.md · 小程序 app API](./api.md)。

## 6. 配置要点

`backend/configs/config.yaml`：

- `mysql.dsn`：连接串
- `jwt.secret` / `expire_hours`
- `log.slow_sql_ms: 200`
- `log.max_size_mb: 100`
- `upload.root` — 落盘目录（静态 `/uploads`）
- `upload.max_file_size` — 单张图片上限
- `upload.font` — 水印字体
- `upload.chunk_size` — **预留未用**（分片上传未实现，可保留默认值）
- `rbac.enabled`：是否启用接口 RBAC（默认 `true`）

环境变量覆盖（前缀 `GBNT_`）：如 `GBNT_MYSQL_DSN`、`GBNT_JWT_SECRET`、`GBNT_SERVER_ADDR`、`GBNT_RBAC_ENABLED`。

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
