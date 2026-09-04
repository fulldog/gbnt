# UniApp 小程序

正式小程序目录。当前已在 `src/api/` 按业务域实现 `/api/app/**` 接口，普通请求使用 `uni.request`，附件上传使用 `uni.uploadFile`，平台无关请求核心和共享类型来自 `@gbnt/api-client`。

应用启动时创建一个 API 实例并注入 Token 管理逻辑：

```ts
import { createMiniappApi } from "./src/api";

export const api = createMiniappApi({
  baseUrl: "https://api.example.com",
  request: (options) => uni.request(options),
  uploadFile: (options) => uni.uploadFile(options),
  getAccessToken: () => uni.getStorageSync("token") || null,
  onTokenRenewed: (token) => uni.setStorageSync("token", token),
  onUnauthorized: () => uni.removeStorageSync("token"),
});
```

发布到具体小程序平台前，需要在平台后台配置 API 与上传域名白名单。

不要从 `prototypes/static-demo/` 直接导入源码；原型只用于核对界面和业务流程。
