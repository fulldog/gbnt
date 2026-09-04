# 仓库目录设计

## 原则

- `apps/` 只放可独立运行或部署的正式应用。
- `packages/` 只放被至少两个正式前端实际复用的代码。
- `prototypes/` 保存只读参考，不参与正式应用构建。
- `deploy/` 保存环境安装和部署资产，避免与应用源码混放。
- `docs/` 按 API、架构和运维职责组织。

## 应用与接口边界

| 目录 | 职责 | API 范围 |
| --- | --- | --- |
| `apps/server/` | Go 后端 | 提供全部 HTTP API |
| `apps/admin-web/` | 管理后台 | `/api/**` 管理端接口 |
| `apps/miniapp/` | UniApp 小程序 | `/api/app/**` |
| `packages/api-client/` | 两端共享的平台无关请求核心与类型 | `/api/attachments/**` 等真实公共接口 |

后端接口变更必须同步正式前端 API 方法和类型，完成标准见仓库根目录 `AGENTS.md`。

## 工具边界

Go 服务保留独立 `go.mod`。前端使用 pnpm workspace；管理后台请求 transport 使用 Axios，小程序请求 transport 使用 `uni.request`，文件上传使用 `uni.uploadFile`。在正式页面工程尚未初始化、尚未出现多包构建与缓存需求前，不引入 Turborepo。仓库级 Go 命令由根目录 `Makefile` 统一暴露。
