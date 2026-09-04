# @gbnt/api-client

后台管理端与 UniApp 小程序共用的平台无关 TypeScript 接口基础包，包含：

- 可注入 transport 的统一请求、鉴权、错误和 Token 续期处理；
- 后端通用响应、业务实体和请求参数类型；
- 两个前端共同使用的附件上传契约。

Axios transport 位于 `apps/admin-web/src/api/`，`uni.request` 与 `uni.uploadFile` 实现位于 `apps/miniapp/src/api/`。共享包不得依赖任何单一运行平台。

业务页面行为、路由跳转和消息提示仍由各前端项目负责。
