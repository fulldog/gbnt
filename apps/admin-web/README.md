# 管理后台

GBNT 正式管理后台，使用 Vue 3、TypeScript、Element Plus、Tailwind CSS 与 Vite。页面字段、枚举和操作能力以 Go 后端及 `@gbnt/api-client` 为准；`prototypes/static-demo/` 仅供视觉和流程参考。

## 本地启动

```bash
pnpm dev:admin
```

开发服务器默认把同源 `/api` 和 `/uploads` 请求代理到远程测试服务
`http://www.weilone.com`。如需切换到本机后端，在 `.env.local` 中覆盖：

```dotenv
VITE_API_PROXY_TARGET=http://127.0.0.1:8080
```

如果前端与后端分别部署，可设置 `VITE_API_BASE_URL` 为后端地址。

## 验证

```bash
pnpm --filter @gbnt/admin-web typecheck
pnpm --filter @gbnt/admin-web test
pnpm --filter @gbnt/admin-web build
```

`src/api/` 按业务域封装 Axios transport，页面不得直接调用 Axios。Token 注入、续期和统一响应解析继续复用 `@gbnt/api-client` 的平台无关请求核心。
