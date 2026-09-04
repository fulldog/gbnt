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

## 前端本地运行

所有前端依赖和命令都从仓库根目录执行，统一使用根 `package.json` 声明的 pnpm 版本。首次运行或依赖发生变化时先执行：

```bash
pnpm install
```

### 管理后台

启动正式管理后台：

```bash
pnpm dev:admin
```

- 访问地址以 Vite 终端实际输出为准，默认通常为 `http://localhost:5173`；
- 默认将同源 `/api` 和 `/uploads` 代理到测试服务 `http://www.weilone.com`；
- 连接本机后端时，在不提交的 `apps/admin-web/.env.local` 中设置 `VITE_API_PROXY_TARGET=http://127.0.0.1:8080`，并保持 `VITE_API_BASE_URL` 为空以继续使用同源代理；
- 前后端分别部署或不使用开发代理时，通过 `VITE_API_BASE_URL` 注入完整后端 Origin；
- 不得在源码或共享包中硬编码本机、测试或生产地址，也不得提交 `.env.local` 和任何密钥。

管理后台完成修改后，按影响范围运行：

```bash
pnpm --filter @gbnt/admin-web typecheck
pnpm --filter @gbnt/admin-web test
pnpm --filter @gbnt/admin-web build
```

### UniApp 小程序

当前 `apps/miniapp/` 只有 API 适配层，还没有 `App.vue`、`pages.json`、`manifest.json` 和 UniApp 构建依赖，因此目前不能启动或导入微信开发者工具。不得把 `prototypes/static-demo/` 当作正式小程序运行，也不得声称 `pnpm dev:mp` 当前可用。

完成 UniApp 工程初始化时，必须同时维护根目录统一命令：

```bash
pnpm dev:mp
pnpm --filter @gbnt/miniapp typecheck
pnpm --filter @gbnt/miniapp test
pnpm --filter @gbnt/miniapp build:mp-weixin
```

- `dev:mp` 应持续编译微信小程序开发产物到 `apps/miniapp/dist/dev/mp-weixin`，再将该目录导入微信开发者工具；
- 小程序运行时使用 `uni.request` 和 `uni.uploadFile`，不能依赖管理后台的 Axios 或 Vite 代理；
- 测试和生产 API 必须使用对应环境配置注入的 HTTPS 地址，并在微信公众平台配置 request、uploadFile 和 downloadFile 合法域名；
- 定位、相机、Canvas、上传和隐私授权不能只在 H5 或浏览器中验收，必须使用微信开发者工具及真机验证；
- 在上述脚本和产物尚未落地时，涉及页面运行或真机验收的任务应明确报告阻塞，不能用原型运行结果代替。

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
