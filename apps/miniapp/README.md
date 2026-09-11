# UniApp 小程序

正式小程序使用 UniApp、Vue 3、TypeScript 和 Vite。普通请求使用 `uni.request`，附件上传使用 `uni.uploadFile`，平台无关的请求核心和共享类型来自 `@gbnt/api-client`。

当前首版已实现登录、待办筛选与分页、五类设施巡查上报、问题详情与分项整改、地图、我的清单和修改密码。用户协议与隐私政策已按只读原型全文复制到 `src/content/legal.ts`，登录页和“我的”入口均使用正式小程序页面阅读。

协议文本沿用原型的更新日期（2026 年 8 月 20 日），本次复制不代表已经完成法务审核。隐私政策第三、六条仍包含“浏览器本地存储”“演示与联调”“清除浏览器缓存”等原型表述，上线前须由业务负责人确认其与小程序、服务端实际数据处理方式及微信隐私保护指引一致。

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

小程序不能使用管理后台的 Vite 代理。当前测试服务使用 `https://nt.kfqzhsq.cn:8443`，与管理后台使用相同 HTTPS 入口，必须保留 `8443` 端口。将 `.env.example` 复制到不提交的 `.env.local` 后即可连接；发布到其他环境时替换为对应的 HTTPS Origin。若本机已有 `.env.development.local`，也需要更新其中的 `VITE_API_BASE_URL`，避免开发模式仍覆盖成旧地址。微信公众平台需配置 request、uploadFile、downloadFile 合法域名；`src/manifest.json` 的正式 `urlCheck: true` 保持不变，开发者工具默认开启域名/HTTPS 校验。

HTTPS 证书可用不代表微信合法域名已配置。若开发者工具报 `request:fail url not in domain list`，先配置或刷新合法域名；仅在用户明确授权的本机联调期间，可在开发者工具项目「本地设置」临时关闭域名/HTTPS 校验，对应开发产物下不提交的 `project.private.config.json`。接口仍使用 HTTPS，不修改正式配置；合法域名配置并验证完成后，再恢复本机校验。

修改环境变量后重新运行 `pnpm dev:mp`，确认开发者工具导入的是 `dist/dev/mp-weixin`，不要混用旧的 `dist/build/mp-weixin`。安全验证提示连接失败时，先检查 Network 中的实际请求 Origin，以及开发者工具的本地设置。接口失败不会自动放行安全验证。

## 检查和构建

```bash
pnpm --filter @gbnt/miniapp typecheck
pnpm --filter @gbnt/miniapp test
pnpm --filter @gbnt/miniapp build:mp-weixin
```

生产编译产物位于 `apps/miniapp/dist/build/mp-weixin`。发布前还需要在微信公众平台分别配置 request、uploadFile 和 downloadFile 合法域名，并使用微信开发者工具及真机验证定位、相机、Canvas、上传和隐私授权。

构建配置会提前拒绝缺失的 API 地址、`.env.example` 中的示例域名，以及生产模式下的 HTTP、本机回环或未指定地址，避免误用本地校验产物。编译成功只证明代码可以编译，不代表 HTTPS 或实际接口联通已经通过。

脚本代码保持 TypeScript `strict`。由于当前 DCloud 编译器配套的 Vue 模板检查器会把 `picker`、`checkbox` 等 UniApp 内置标签误判为未注册组件，`strictTemplates` 暂时关闭；微信端正式编译仍是必跑检查。

## 代码边界

- 页面通过 `src/api/runtime.ts` 导出的 `miniappApi` 调用后端；`toAssetUrl` 复用共享解析器，将相对照片、签名地址拼接为 HTTPS，并兼容当前服务同主机的旧 HTTP 地址（包括历史草稿），保留微信本地临时路径及外部域名原值；
- API Origin 仅通过 `VITE_API_BASE_URL` 注入，生产构建不会回退到测试地址；
- 不从 `prototypes/static-demo/` 导入源码，原型只用于核对界面和业务流程；
- 不在小程序中引入 Axios、Element Plus 或管理后台源码。
