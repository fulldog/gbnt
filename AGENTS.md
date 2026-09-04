# GBNT 仓库协作约定

## 适用范围

本文件适用于整个仓库。修改子目录前，还需遵守该目录下更具体的 `AGENTS.md`，以及 `.cursor/rules/` 中的现有约束。

当前正式后端位于 `apps/server/`。

## 项目边界

- `apps/server/`：Go 后端服务。
- `apps/admin-web/`：管理后台正式前端。
- `apps/miniapp/`：UniApp 小程序正式前端。
- `packages/api-client/`：两端共享的平台无关请求核心、接口类型和公共 API 契约。
- `prototypes/static-demo/`：只读演示参考，不是正式前端，不得作为接口同步目标；不得创建、修改、删除或重命名其中的内容。
- `docs/`：接口、架构和运维文档。普通功能开发不得自动修改 API 文档；仅在用户明确要求重建接口文档时处理。

## 后端接口与前端 API 同步（强制）

新增、修改或删除后端 HTTP 接口时，任务只有在正式前端对应的 API 方法同步完成后才算完成。不得只提交后端实现，把前端方法留作 TODO。

### 接口归属

- `/api/app/**`：同步到 `apps/miniapp/src/api/` 对应的业务模块。
- `/api/**` 中的管理端接口：同步到 `apps/admin-web/src/api/` 对应的业务模块。
- `/api/attachments/**` 等两端实际共用的接口：请求/响应契约和统一方法入口同步到 `packages/api-client/src/shared/`；Axios `FormData` 与小程序 `uni.uploadFile` 实现分别留在对应应用的 `src/api/`。
- 同一业务同时存在管理端和小程序契约时，分别维护 `admin` 与 `miniapp` 方法；不要因为业务名称相同而强行共用不同的请求或响应结构。

如果正式前端尚未初始化（例如目标应用还没有 `package.json`）或 API 目标路径不存在，不得改写 `prototypes/static-demo/` 代替正式实现；应明确报告阻塞，且不得声称接口同步已经完成。

### 同步内容

前端 API 方法必须与后端当前实现一致，包括：

- HTTP method、URL、path/query/body/form 参数及必填规则；
- 请求类型、响应类型、分页结构和枚举值；
- 鉴权要求、上传方式以及必要的请求头或响应头；
- 接口新增时增加可调用方法，接口变更时更新现有方法，接口删除时清理失效方法和导出。

复用统一响应信封 `{ code, data, message, cost_ms, trace_id }`。Token 注入、续期响应头处理和通用错误转换放在共享请求层；请求 transport 由应用注入：管理后台使用 Axios，小程序使用 `uni.request`，小程序文件上传使用 `uni.uploadFile`。共享包不得直接依赖 `fetch`、Axios、`uni` 或 DOM 类型。路由跳转、Toast 和页面状态等端侧行为留在各自应用内。API 基础地址必须由应用环境配置注入，不得在共享包中硬编码。

API 文件按业务域拆分，例如 `auth.ts`、`issues.ts`、`ledger.ts`；禁止持续堆积到单个大型 `api.ts`。只有被两个正式前端实际复用的能力才进入 `packages/api-client/src/shared/`。

## 完成前检查

涉及后端接口的变更至少需要确认：

1. 后端路由、请求 DTO、响应结构与业务实现一致，并补充约定要求的中文注释。
2. 受影响的正式前端 API 方法和 TypeScript 类型已经同步，不存在占位实现或遗留 TODO。
3. 管理端、小程序和共享接口放在正确边界，没有跨应用直接导入另一个应用的源码。
4. 运行后端测试，以及所有受影响前端包的类型检查或测试；无法运行时说明具体原因。
5. 检查 `git diff`，确保没有误改 `prototypes/static-demo/`，并执行 `git diff --check`。

普通接口开发仍遵循 `.cursor/rules/api-comments.mdc`：同步正式前端 API 方法是必需项，但不因此自动改写 `docs/api/api.md` 或 `docs/api/apifox/openapi.yaml`。
