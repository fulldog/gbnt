# 高标农田专项整治 · 后台服务

技术栈：Go 1.27 · Gin + Zap + MySQL + JWT + GORM  
工程规范：见 `.cursor/skills/golang-backend/SKILL.md`

## 快速启动

```bash
# 1. 准备 MySQL，修改 configs/config.yaml 或环境变量
# 2. 若 proxy.golang.org 超时：go env -w GOPROXY=https://goproxy.cn,direct
# 3. 进入目录
cd backend
go mod tidy
go run ./cmd/server
```

默认监听 `:8080`。健康检查：`GET /api/health`

默认管理员：`admin` / `123456`（种子数据，生产务必修改）。

## 目录

| 路径 | 说明 |
| --- | --- |
| `cmd/server` | 入口 |
| `configs` | 配置 |
| `internal` | 业务与基建 |
| `pkg` | 可复用工具 |
| `storage/uploads` | 附件本地存储 |
| `logs` | 五类日志 |

## 文档与接口

- 项目文档：`../doc/`
- Apifox 导入：`../doc/apifox/openapi.yaml`
