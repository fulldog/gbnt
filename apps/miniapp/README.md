# UniApp 小程序

正式小程序使用 UniApp、Vue 3、TypeScript 和 Vite。普通请求使用 `uni.request`，附件上传使用 `uni.uploadFile`，平台无关的请求核心和共享类型来自 `@gbnt/api-client`。

当前首版已实现登录、待办筛选与分页、五类设施巡查上报、问题详情与分项整改、地图、我的清单和修改密码。用户协议与隐私政策仍是明确标识的开发占位内容，不能直接用于正式发布。

## 本地运行

首次运行或依赖版本变化后，在仓库根目录安装依赖：

```bash
pnpm install
```

复制环境变量示例到不会提交的本地配置，并设置完整 API Origin：

```bash
cp apps/miniapp/.env.example apps/miniapp/.env.local
```

启动微信小程序持续编译：

```bash
pnpm dev:mp
```

编译产物位于 `apps/miniapp/dist/dev/mp-weixin`，把这个目录导入微信开发者工具。项目 `AppID` 需要在 `src/manifest.json` 或微信开发者工具项目设置中配置。

小程序不能使用管理后台的 Vite 代理。连接现有 HTTP 测试服务时，可在 `.env.local` 中显式设置 `VITE_API_BASE_URL=http://www.weilone.com`，并且只在微信开发者工具本地调试期间临时关闭合法域名校验；真机和发布环境必须改用已备案、已加入合法域名的 HTTPS 地址。

## 检查和构建

```bash
pnpm --filter @gbnt/miniapp typecheck
pnpm --filter @gbnt/miniapp test
pnpm --filter @gbnt/miniapp build:mp-weixin
```

生产编译产物位于 `apps/miniapp/dist/build/mp-weixin`。发布前还需要在微信公众平台分别配置 request、uploadFile 和 downloadFile 合法域名，并使用微信开发者工具及真机验证定位、相机、Canvas、上传和隐私授权。

构建配置会提前拒绝缺失的 API 地址、`.env.example` 中的示例域名，以及生产模式下的 HTTP 地址，避免生成启动后才发现无法请求的无效发布包。

脚本代码保持 TypeScript `strict`。由于当前 DCloud 编译器配套的 Vue 模板检查器会把 `picker`、`checkbox` 等 UniApp 内置标签误判为未注册组件，`strictTemplates` 暂时关闭；微信端正式编译仍是必跑检查。

## 代码边界

- 页面通过 `src/api/runtime.ts` 导出的 `miniappApi` 调用后端，通过 `toAssetUrl` 补全相对附件地址；
- API Origin 仅通过 `VITE_API_BASE_URL` 注入，生产构建不会回退到测试地址；
- 不从 `prototypes/static-demo/` 导入源码，原型只用于核对界面和业务流程；
- 不在小程序中引入 Axios、Element Plus 或管理后台源码。
