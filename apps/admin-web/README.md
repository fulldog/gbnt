# 管理后台

正式管理后台目录。当前已在 `src/api/` 按业务域实现后端管理端接口，网络 transport 使用 Axios，平台无关请求核心和共享类型来自 `@gbnt/api-client`。

应用启动时创建一个 API 实例并注入 Token 管理逻辑：

```ts
import { createAdminApi } from "./src/api";

export const api = createAdminApi({
  baseUrl: "",
  getAccessToken: () => localStorage.getItem("token"),
  onTokenRenewed: (token) => localStorage.setItem("token", token),
  onUnauthorized: () => localStorage.removeItem("token"),
});
```

不要从 `prototypes/static-demo/` 直接导入源码；原型只用于核对界面和业务流程。
