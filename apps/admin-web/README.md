# 管理后台

GBNT 正式管理后台，使用 Vue 3、TypeScript、Element Plus、Tailwind CSS 与 Vite。页面字段、枚举和操作能力以 Go 后端及 `@gbnt/api-client` 为准；`prototypes/static-demo/` 仅供视觉和流程参考。

## 本地启动

```bash
pnpm dev:admin
```

开发服务器默认把同源 `/api` 和 `/uploads` 请求代理到远程测试服务
`https://nt.kfqzhsq.cn:8443`（与小程序使用相同 HTTPS 入口，必须保留 `8443` 端口）。如需切换到本机后端，在 `.env.local` 中覆盖：

```dotenv
VITE_API_PROXY_TARGET=http://127.0.0.1:8080
```

如果前端与后端分别部署，在构建环境设置 `VITE_API_BASE_URL=https://nt.kfqzhsq.cn:8443`；同源部署时保持为空，继续走同源 `/api` 和 `/uploads`（域名相同但端口不同仍属于跨源）。`VITE_API_PROXY_TARGET` 只影响开发代理，不会改变生产包的 API 地址。若本机已有 `.env.local` 或 `.env.development.local`，也需要更新旧的接口或代理地址，并重启开发服务器；生产包需要重新构建发布。

图片与签名共用资源地址解析：相对路径沿用同源代理或配置的 API 地址；历史 HTTP 绝对地址仅在与 HTTPS API 地址或当前 HTTPS 页面同主机时升级协议，不改写第三方地址和本地预览路径。

## 验证

```bash
pnpm --filter @gbnt/admin-web typecheck
pnpm --filter @gbnt/admin-web test
pnpm --filter @gbnt/admin-web build
```

`build` 包含生产分包初始化检查；也可以对已经构建的 `dist` 单独运行：

```bash
pnpm --filter @gbnt/admin-web check:production
pnpm --filter @gbnt/admin-web preview --host 127.0.0.1 --port 4173
```

分包检查用独立 Node 进程和 jsdom 直接导入非 HTML 入口的生产 ESM 文件，不经过 Vite/Vitest 转换，禁止网络请求；缺少产物、导入异常或超时都会返回非零退出码。它只检查模块求值，不替代浏览器里的入口挂载、登录、路由切换和真实接口联调。验收生产预览时至少检查登录、工作台、专项整改、两张台账和系统页面，并检查浏览器控制台；不能只验收 `dev:admin`。

## 生产构建与发布注意事项

- 从仓库根目录使用 `package.json` 声明的 pnpm 版本，以 `pnpm install --frozen-lockfile` 安装依赖；本次修复不升级依赖、不重建锁文件。
- Vite 的 `build.rolldownOptions.output.strictExecutionOrder` 必须保留。当前分包可能存在循环依赖，关闭该项会让运行时辅助函数在赋值前被调用，出现 `TypeError: e is not a function`。该选项以少量包装代码换取模块初始化顺序保障。
- 构建和验收通过后，发布同一次构建的完整 `dist`，确保 `index.html` 与 `assets/` 匹配，并保留旧版本以便回滚。分包检查不提供原子发布或自动回滚能力；不要直接覆盖正在提供服务的产物后再做首次验证。
- 本次修复仅涉及前端，不需要启动、迁移或重启后端；不要为重建前端调用会同时重启后端的全栈 `force` 部署流程。

`src/api/` 按业务域封装 Axios transport，页面不得直接调用 Axios。Token 注入、续期和统一响应解析继续复用 `@gbnt/api-client` 的平台无关请求核心。
