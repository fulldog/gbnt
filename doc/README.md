# 高标农田专项整治 · 后台 API 文档

> 版本：v1 · Go **1.27** · Gin + Zap + MySQL + JWT + GORM  
> 前端参考：`demo/web`、`demo/miniapp`（本期只交付后台 API，不改前端）

## 1. 概述

后台为管理端与移动端 H5 提供统一 REST API：

- 鉴权（JWT）
- 工作台统计、专项整改（问题 CRUD / 整改闭环 / 导入）
- 汇总台账聚合
- 系统配置（组织 / 人员 / 角色 / 字典 / 操作日志）
- **独立附件服务**（批量 init、分片断点续传，业务只存 UUID）

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

### 3.2 鉴权

除白名单外均需：

```http
Authorization: Bearer <token>
```

白名单：`/api/health`、`/api/auth/login`。

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

### 3.4 迁移

启动时 GORM `AutoMigrate` + 空库种子（组织、admin、角色、字典类型）。

## 4. 附件约定

1. `POST /api/attachments/init` 或 `batch-init` → 获得 `uuid`
2. 按 `chunk_size` 切分，`PUT .../chunks/{index}` 上传（可断点：先 `GET .../status` 看 `missing_chunks`）
3. `POST .../complete` 合并，`status=ready`
4. 业务提交（上报/整改）只传 `photo_uuids: ["uuid", ...]`

本地落盘：`backend/storage/uploads/<uuid>/`。

## 5. 模块与路径一览

详见 [api.md](./api.md) 与 Apifox 导入文件 [apifox/openapi.yaml](./apifox/openapi.yaml)。

| 模块 | 前缀 |
| --- | --- |
| 健康检查 | `/api/health` |
| 鉴权 | `/api/auth` |
| 工作台 | `/api/workbench` |
| 专项整改 | `/api/issues` |
| 台账 | `/api/ledger` |
| 系统 | `/api/sys` |
| 附件 | `/api/attachments` |

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
