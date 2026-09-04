# 小程序 UniApp 改造实施方案

> 目标：将只读原型中的小程序页面迁移到 `apps/miniapp/`，使用 UniApp、Vue 3 与 TypeScript，并接入当前 Go 后端真实接口。
>
> 方案日期：2026-09-04。

## 1. 实施结论

小程序可以采用 UniApp 实现，但不能直接迁移原型 HTML、DOM 脚本和浏览器数据层。

正式实现遵循以下基准：

- 当前 Go 后端和 `@gbnt/api-client` 是字段、枚举、校验及接口能力的唯一正式契约；
- `prototypes/static-demo/` 只用于参考视觉、内容层级、操作路径和业务意图；
- 原型目录保持只读，正式代码不得导入、修改、删除或重命名其中的文件；
- 原型与后端冲突时，前端默认采用后端行为，不添加伪字段、伪状态或仅在本地成立的补丁；
- 对疑似后端建模错误、权限缺口或无法闭环的流程，先确认并修正后端及共享类型，再开发对应页面；
- 后端接口发生变化时，必须同步 `apps/miniapp/src/api/` 或 `packages/api-client/`，具体完成标准见仓库根目录 `AGENTS.md`。

当前 `apps/miniapp/` 已具备业务 API 适配层，但还不是可构建的 UniApp 应用：缺少 Vue/UniApp 编译依赖、`App.vue`、`main.ts`、`pages.json`、`manifest.json`、页面、组件及微信小程序构建脚本。

## 2. 原型迁移范围

### 2.1 正式页面

| 页面 | 建议路由 | 所属包 | 主要能力 |
| --- | --- | --- | --- |
| 登录 | `pages/login/index` | 主包 | 账号密码、滑块验证、协议确认、会话恢复 |
| 待办 | `pages/todo/index` | 主包、TabBar | 搜索、类型/区划/状态筛选、分页列表 |
| 巡查 | `pages/report/index` | 主包、TabBar | 五类设施上报向导、定位、图片、签名 |
| 我的 | `pages/mine/index` | 主包、TabBar | 用户信息、统计入口、设置、退出 |
| 我的清单 | `pages-sub/mine/list` | 分包 | 我上报、待整改、已整改分页列表 |
| 问题详情 | `pages-sub/issue/detail` | 分包 | 基本信息、排查项、附件、整改 |
| 问题地图 | `pages-sub/issue/map` | 分包 | 问题点、当前位置、距离和导航入口 |
| 修改密码 | `pages-sub/account/change-password` | 分包 | 后端规则校验、改密后退出 |
| 用户协议 | `pages-sub/legal/agreement` | 分包 | 正式法务文本 |
| 隐私政策 | `pages-sub/legal/privacy` | 分包 | 正式隐私文本 |

`待办 / 巡查 / 我的` 使用原生 TabBar。低频页面在确认主包体积后再拆分，避免过早形成复杂分包依赖。

### 2.2 不迁移内容

- `demo-phone.html`：浏览器手机桌面模拟；
- `todo-select.html`：旧入口兼容跳转；
- `rectify.html`：已被详情页吸收的兼容入口；
- 手机外壳、模拟状态栏、胶囊和浏览器软导航脚本；
- `localStorage` 种子数据、演示账号和 `picsum.photos` 网络假图；
- MapLibre、浏览器 `FileReader`、`navigator.geolocation`、DOM Canvas 等 Web 专用实现。

### 2.3 可复用视觉资源

- 登录 Logo；
- 登录背景图；
- 列表空状态插图；
- 原型中的政务蓝、绿色强调色、卡片层级和信息密度。

资源进入正式工程前必须压缩并检查版权。当前登录背景约 927 KB、Logo 约 100 KB，不能未经处理直接占用主包空间。

## 3. 技术架构

### 3.1 技术栈

- UniApp CLI；
- Vue 3 与 `<script setup lang="ts">`；
- TypeScript；
- Vite；
- Pinia；
- SCSS 与语义化设计变量；
- Vitest，用于领域规则、映射和校验等纯函数测试；
- 微信开发者工具和 Android/iOS 真机验收。

小程序包应独立锁定一整套经过验证的 `@dcloudio/*`、Vue、Vite、TypeScript 和 `vue-tsc` 版本，不直接沿用管理后台的 Vite/TypeScript 版本。官方 CLI 与 Vue 3/TypeScript 初始化方式参考：[UniApp CLI](https://uniapp.dcloud.net.cn/quickstart-cli.html) 和 [UniApp TypeScript](https://uniapp.dcloud.net.cn/tutorial/typescript-subject.html)。

### 3.2 不采用的技术

- 不使用 Axios：普通请求继续使用 `uni.request`；
- 不使用 Element Plus：它属于管理后台 Web 技术栈；
- 第一阶段不引入 Tailwind CSS：优先使用 SCSS 和设计变量，降低小程序选择器差异及产物体积风险；
- 不在共享 API 包中引用 `uni`、DOM、Axios 或平台组件；
- 不复制原型 DOM 拼接和 HTML 多页导航代码。

### 3.3 请求分层

```text
UniApp 页面 / 组件
  └─ composables / domain / stores
       └─ apps/miniapp/src/api
            ├─ uni.request transport
            ├─ uni.uploadFile 附件实现
            └─ packages/api-client
                 └─ apps/server
```

现有 API 层继续负责：

- `/api/app/auth/**` 登录、用户信息、改密和退出；
- `/api/app/todos` 待办；
- `/api/app/regions` 行政区划；
- `/api/app/issues/**` 新建、详情和整改；
- `/api/app/mine/**` 我的统计和清单；
- `/api/attachments/images` 图片及签名上传。

Token 注入、续期响应头、统一响应信封和通用错误转换继续由共享请求层处理。页面不直接操作 `uni.request`，也不读取底层请求错误的私有结构。

### 3.4 建议目录

```text
apps/miniapp/
├── src/
│   ├── api/                    # 已有正式 API
│   ├── pages/
│   │   ├── login/
│   │   ├── todo/
│   │   ├── report/
│   │   └── mine/
│   ├── pages-sub/
│   │   ├── issue/
│   │   ├── mine/
│   │   ├── account/
│   │   └── legal/
│   ├── components/
│   │   ├── common/
│   │   ├── issue/
│   │   ├── report/
│   │   └── media/
│   ├── composables/
│   │   ├── usePagedList.ts
│   │   ├── useLocation.ts
│   │   ├── useImageUpload.ts
│   │   ├── useReportDraft.ts
│   │   └── useWaterOutEvidence.ts
│   ├── domain/issues/
│   │   ├── definitions.ts
│   │   ├── mapper.ts
│   │   └── validation.ts
│   ├── stores/
│   │   ├── auth.ts
│   │   └── report-draft.ts
│   ├── styles/
│   │   └── tokens.scss
│   ├── static/
│   ├── App.vue
│   ├── main.ts
│   ├── pages.json
│   └── manifest.json
├── tests/
└── vite.config.ts
```

## 4. 当前正式后端契约

### 4.1 状态与年度

| 字段 | 正式值 | 页面展示 |
| --- | --- | --- |
| `status` | `new` | 待整改 |
| `status` | `pending` | 整改中 |
| `status` | `done` | 已整改 |
| `project_year` | `2020`、`2021`、`2022`、`2023` | 对应年度 |

正式小程序不自行增加原型中的 `inspected`。当前后端把无需整改的记录直接保存为 `done`，页面也按 `done` 展示，除非后端契约后续正式调整。

### 4.2 五类设施

| 类型 | `type` | 当前后端字段与排查项 |
| --- | --- | --- |
| 机井 | `well` | `build_kind`、出水口/护筒数量、负责人、电话；6 题，包含 `transformer_ok` |
| 道路 | `road` | 长、宽、厚、`tree_survive`、负责人、电话；2 题 `has_shoulder/has_ash` |
| 桥涵闸 | `bridge` | 类型、长、宽、负责人、电话；1 题 `needs_rectify` |
| 林网 | `forest` | 移交数、现有数、存活率、负责人、电话；3 题 |
| 变压器 | `transformer` | 容量、型号、电压、负责人、电话；4 题 |

页面必须由一份领域配置生成排查项、正反向语义、说明和图片校验，不允许在多个页面重复维护题目常量。

### 4.3 行政区划

当前正式组织层级为：

```text
root → district → street → village
```

上报只保存正式 `org_id`，不在前端额外伪造自然村层级。组织选择器按 `/api/app/regions` 返回的真实树结构渲染。

### 4.4 整改流程

```text
创建排查记录
  ├─ 后端判定需整改 → new
  │    └─ 提交部分异常项整改 → pending
  │          └─ 覆盖全部异常项 → done
  └─ 后端判定无需整改 → done

done ──重新整改──→ pending
```

小程序整改页按 `rectify_list` 对异常题逐项提交：

```ts
{
  rectify_list: [
    {
      type: QuizType,
      note: string,
      file_uuids: string[],
    },
  ],
}
```

每项说明和图片都必须在提交前完成校验。页面不能把整单说明伪装成逐题数据。

## 5. 原型与后端差异及确认项

以下事项会影响正式数据或权限，需要在对应页面开工前确认。

| 优先级 | 事项 | 原型行为 | 当前后端行为 | 默认实施原则 |
| --- | --- | --- | --- | --- |
| P0 | 状态语义 | `pending/done/inspected` | `new/pending/done` | 采用后端三态，不推导 `inspected` |
| P0 | 道路题目 | 路肩、灰土层、道路损坏 | 只有路肩、灰土层，另有 `tree_survive` | 先确认 `tree_survive` 是否建模错误 |
| P0 | 机井题目 | 5 题和独立全景照片 | 6 题且无全景照片字段 | 采用 6 题，不提交后端不存在的全景字段 |
| P0 | 区划层级 | 街道、社区/新村、自然村 | 根、区、街道、村 | 采用后端组织树 |
| P0 | 整改方式 | 一份说明和照片完成整单 | 按异常题提交 `rectify_list` | 页面实现逐项整改 |
| P0 | 责任人 | 按最末级区划自动分配 | 创建时不自动分配，允许符合条件的用户认领 | 必须确认抢单或预指派模式 |
| P0 | 详情权限 | 上报人或责任人访问 | 当前详情按 ID 查询的组织校验不足 | 后端补齐数据范围校验后验收 |
| P1 | 删除 | 上报人可删除 | 小程序无删除接口 | 默认不展示删除按钮 |
| P1 | 搜索 | 编号、上报人、责任人 | 仅编号和地址 | 页面按后端真实搜索能力提示 |
| P1 | 推送 | 演示日志模拟 | 无微信订阅消息或短信能力 | 默认不承诺真实推送 |

还需特别确认机井闭环：出水口或护筒损坏数量会触发待整改，但它们不是 `QuizType`，当前逐题整改接口无法为这两个数量字段生成语义正确的整改项。前端不得伪造题目类型，需要扩展后端模型或明确这类问题的关闭方式。

## 6. 页面实现方案

### 6.1 登录

- 使用当前账号、密码和滑块 `pass_token` 接口；
- 不接入 `uni.login`、OpenID 或微信手机号，除非后端先增加正式绑定模型和接口；
- 密码校验以后端“6～14 位且同时包含字母和数字”为准；
- 登录前必须确认用户协议和隐私政策；
- Token 只通过统一会话 store 管理，不存储明文密码；
- 应用启动和恢复时调用 `getMe` 校验会话；
- 401 清理 Token，并跳转登录页；
- 原型滑块视觉可复用，但结果必须由后端验证。

### 6.2 待办和我的清单

- 使用服务端分页，不能像原型一样一次加载全量数据；
- 支持下拉刷新、触底加载、筛选后重置页码；
- 防止快速切换筛选时旧请求覆盖新结果；
- 卡片展示后端真实可返回的设施编号、状态、计划日期、地址和照片；
- 上报人、责任人名称和组织路径如果接口未返回，不通过逐行请求补齐；
- 图片 URL 统一补全 API origin 后再交给 `uni.previewImage`；
- 加载、空数据、失败重试和分页结束状态必须完整。

### 6.3 巡查上报

上报流程采用配置驱动向导：

```text
基础信息
  → 类型扩展字段
  → 按题排查
  → 整改计划（后端判定需要时）
  → 电子签名
  → 上传附件
  → 创建记录
```

实现要求：

- 五种类型共用向导外壳、进度、上一步/下一步和草稿机制；
- `domain/issues/definitions.ts` 集中定义各类型字段、题目及正反向语义；
- `mapper.ts` 负责将表单映射为后端判别联合 `type_ext`；
- `validation.ts` 负责数量范围、必填说明、照片和日期规则；
- 区划、年度和问题类型都来自正式契约，不使用原型种子数据；
- 设施编号是否重复必须以后端结果为准；
- 多图上传、签名上传和创建记录之间需要可恢复状态；
- 提交按钮必须防重复点击；后续建议为创建接口增加幂等键。

### 6.4 问题详情与整改

- 展示基本字段、类型扩展字段、排查清单、附件和签名；
- 地址入口打开问题地图；
- 整改表单从详情中的异常题生成，不重新维护另一份题目清单；
- 每个异常项独立填写说明和选择整改后图片；
- 提交失败时保留全部输入；
- 是否允许整改、重新整改或删除由后端结果和权限决定；
- 当前无小程序删除接口时不展示删除按钮。

### 6.5 我的

- 用户信息以 `getMe` 返回值为准；
- 统计以 `/api/app/mine/stats` 为准，不在客户端扫描列表重新计算；
- 三个统计入口复用同一个分页清单页面；
- 修改密码成功后清除会话并回到登录页；
- 协议和隐私页使用 `navigateBack` 返回来源页，不固定跳转登录。

## 7. 平台技术难点

### 7.1 定位、地图与中文地址

小程序端 `uni.getLocation` 可以获得坐标，但不会像 App 端一样直接返回中文地址。正式方案建议：

1. 坐标统一采用 GCJ-02；
2. 优先使用 `uni.chooseLocation` 让用户确认位置和地址；
3. 需要自动逆地址解析时，由后端代理正式地图服务；
4. 用户拒绝定位或解析失败时，提供手工填写地址的兜底；
5. 详情页使用 UniApp `<map>`、`markers` 和 `include-points`，不迁移 MapLibre。

参考：[UniApp 定位](https://uniapp.dcloud.net.cn/api/location/location.html) 和 [UniApp 地图](https://uniapp.dcloud.net.cn/component/map.html)。

### 7.2 图片选择和上传

- 微信目标优先使用 `uni.chooseMedia`，不继续使用停止维护的 `chooseImage`；
- 需要严格限制现场拍摄时使用 `sourceType: ['camera']`，必要时采用 `<camera>`；
- 微信端 `uploadFile` 每次上传单个本地文件，现有串行上传实现可以保留；
- 上传中断会留下已经成功的孤儿附件，需要附件清理或服务端批次机制；
- 上传完成后统一保存附件 ID，不把临时文件路径写入业务数据；
- 正式环境必须配置请求、上传和图片下载 HTTPS 合法域名。

参考：[UniApp 图片 API](https://uniapp.dcloud.net.cn/api/media/image.html)、[UniApp uploadFile](https://uniapp.dcloud.net.cn/api/request/network-file.html) 和 [UniApp request](https://uniapp.dcloud.net.cn/api/request/request.html)。

### 7.3 电子签名

- 使用 Canvas 2D 和触摸事件重写，不能迁移浏览器 PointerEvent；
- 按设备 DPR 设置画布尺寸，限制画布实际像素，避免 Android 大画布崩溃；
- 签名时禁用页面滚动；
- 记录是否存在有效笔迹，不能只判断是否成功导出临时图片；
- 使用 `canvasToTempFilePath` 导出 PNG；
- 电子签名上传必须明确传 `watermark: false`；
- 上传完成后把附件 ID 写入 `reporter_signature_file_id`。

参考：[微信 Canvas](https://developers.weixin.qq.com/miniprogram/dev/component/canvas.html) 和 [UniApp canvasToTempFilePath](https://uniapp.dcloud.net.cn/api/canvas/canvasToTempFilePath.html)。

### 7.4 机井一分钟取证

原型要求机井出水为“是”时：仅使用摄像头、至少两张照片、间隔不少于一分钟，并带地址、坐标和时间水印。

如果该规则属于审计证据，不能只依赖客户端倒计时。正式方案还需要后端：

- 记录第一张和后续照片的服务端时间；
- 保存同一取证批次关系；
- 校验照片数量和间隔；
- 确认拍摄来源和水印字段；
- 防止修改客户端时间绕过规则。

在这些字段和校验未进入正式接口前，前端只能提供交互约束，不能宣称完成可信取证。

### 7.5 弱网、草稿和幂等

田间环境下，上报会经历多张图片上传、签名上传和创建记录多个步骤。需要：

- 本地草稿和离页确认；
- 每个附件的待上传、上传中、成功、失败状态；
- 失败文件单独重试；
- 应用切后台和恢复后的状态重建；
- 创建成功后的草稿清理；
- 防止重复提交的客户端锁；
- 服务端创建幂等键及孤儿附件清理机制。

`uni.setStorageSync` 只保存 Token、轻量缓存和草稿，不作为业务数据库。

### 7.6 权限与附件安全

- App 路由的数据级权限必须由后端 service 校验，前端按钮隐藏不是安全边界；
- 详情、待办和整改都要验证登录人组织范围及责任人关系；
- 需要确认“组织队列内认领”还是“创建时预先指派”；
- 现场照片和签名不建议通过无需鉴权的永久公开 URL 暴露；
- 需要确认图片预览是否允许长按保存和转发；
- Token、AppSecret、地图服务密钥等不得写入 `VITE_*` 客户端变量。

### 7.7 微信平台准入

上线前需要准备：

- 微信小程序 AppID 和主体；
- 支持定位能力的服务类目及接口申请；
- API、上传、下载合法域名和有效 HTTPS 证书；
- 相机、相册、定位用途声明；
- 正式用户协议与隐私政策；
- 如果改用微信登录，后端新增 OpenID/UnionID 绑定、首次绑定、解绑和禁用策略。

开发者工具中的“跳过域名和 TLS 校验”只能用于本地调试，不能作为测试或验收结论。

## 8. 开工前待确认清单

### Gate A：接口与数据契约

- [ ] 道路 `tree_survive` 是否为正式字段；
- [ ] 是否需要正式增加 `has_road_damage`；
- [ ] 机井是否固定为当前后端 6 道题；
- [ ] 机井全景照片是否需要独立后端字段；
- [ ] `done` 是否继续同时代表“无需整改”和“整改完成”；
- [ ] 自然村是否进入正式组织模型；
- [ ] 出水口/护筒损坏如何通过 `rectify_list` 完成闭环。

### Gate B：权限与业务流程

- [ ] 待整改采用后台预指派还是组织内认领；
- [ ] 待办、详情和整改的组织范围规则；
- [ ] 上报人是否能删除，允许删除哪些状态；
- [ ] “我的待整改”是否包含 `new` 和 `pending`；
- [ ] 是否需要微信订阅消息、短信或只做站内红点。

### Gate C：微信能力与合规

- [ ] 继续使用账号密码，还是改为微信登录并绑定账号；
- [ ] AppID、主体和服务类目是否已准备；
- [ ] 定位接口是否可申请；
- [ ] 逆地址解析服务商和调用边界；
- [ ] GCJ-02 是否作为正式坐标标准；
- [ ] 用户拒绝定位时是否允许手工填写；
- [ ] 现场照片是否允许保存和转发；
- [ ] 正式协议、隐私政策和授权文案由谁提供；
- [ ] 机井一分钟取证是否属于后端强审计要求。

## 9. 实施顺序

### 阶段 0：契约冻结

1. 完成 Gate A、B、C 的确认；
2. 把正式结论写入本方案或新的决策记录，不修改只读原型；
3. 先修改后端模型、接口和测试；
4. 同步 `packages/api-client` 与 `apps/miniapp/src/api/`；
5. 确认 Apifox/测试环境接口与正式契约一致。

Gate：道路、机井、状态、组织、整改和责任人流程不存在无法提交或无法关闭的场景。

### 阶段 1：基础工程

1. 初始化 UniApp Vue 3/TypeScript/Vite；
2. 增加微信开发和生产构建命令；
3. 创建 `App.vue`、`main.ts`、`pages.json` 和 `manifest.json`；
4. 建立设计变量、API 注入、Pinia 会话 store 和路由鉴权；
5. 实现原生 TabBar、页面安全区和通用加载/空/错误状态；
6. 在根目录增加 `dev:mp` 等统一命令。

Gate：可以产出 `dist/dev/mp-weixin`，在微信开发者工具中启动，并能连接测试环境恢复登录会话。

### 阶段 2：登录与我的

1. 登录、滑块和协议确认；
2. 会话恢复和 401 处理；
3. 我的信息、统计入口和退出；
4. 我的清单；
5. 修改密码、协议和隐私页面。

Gate：真实账号可以完成登录、刷新恢复、改密和退出，统计及清单来自测试后端。

### 阶段 3：待办、详情和地图

1. 服务端分页和筛选；
2. 下拉刷新和触底加载；
3. 问题卡片、附件预览和异常状态；
4. 问题详情；
5. 原生地图、当前位置、问题点及定位失败兜底。

Gate：不同组织和责任人账号只能看到并操作后端授权范围内的数据。

### 阶段 4：巡查上报

1. 五类设施的配置驱动表单；
2. 行政区划、年度、编号和定位；
3. 普通图片与机井特殊取证；
4. 电子签名；
5. 草稿、弱网恢复、失败重试和重复提交保护；
6. 创建成功后的列表刷新和草稿清理。

Gate：五类设施均能提交正常和异常两种记录，后端保存结果、状态及附件完全符合契约。

### 阶段 5：整改闭环

1. 从异常题生成逐项整改表单；
2. 整改图片上传和失败恢复；
3. 部分整改、全部完成和重新整改；
4. 责任人权限、组织范围和并发认领处理。

Gate：每种可触发待整改的条件都有合法整改项，并能按正式规则流转到完成状态。

### 阶段 6：真机与发布加固

1. 微信合法域名和隐私配置；
2. 包体积检查和资源压缩；
3. Android/iOS 真机定位、地图、相机、Canvas、上传和安全区验收；
4. 弱网、切后台、授权拒绝和接口超时测试；
5. 生产构建及发布清单。

Gate：开发者工具和两类真机均通过核心流程，生产构建没有依赖代理或调试豁免。

## 10. 测试与验收

### 10.1 自动化检查

- TypeScript 类型检查；
- 微信小程序生产构建；
- 题目正反向判定单元测试；
- 五种 `type_ext` payload 映射测试；
- 数量、日期、说明、图片和签名校验测试；
- 分页合并、筛选重置和请求乱序测试；
- Token 续期及 401 测试；
- `git diff --check`。

目标命令：

```bash
pnpm dev:mp
pnpm --filter @gbnt/miniapp typecheck
pnpm --filter @gbnt/miniapp test
pnpm --filter @gbnt/miniapp build:mp-weixin
```

这些命令需要在阶段 1 初始化时正式加入。

### 10.2 联调矩阵

每类设施至少覆盖：

- 全部正常；
- 一个异常项；
- 多个异常项；
- 必填说明缺失；
- 必填图片缺失；
- 上传中断后重试；
- 重复点击提交；
- 定位拒绝与手工地址；
- 部分整改与全部整改；
- 无权限访问或操作。

### 10.3 真机必测项

- 相机和相册权限；
- 定位授权、拒绝和重新授权；
- 地图坐标偏移；
- Canvas 签名触摸、旋转和高 DPR；
- 图片压缩、上传进度和预览；
- 前后台切换；
- 弱网、断网和超时；
- 刘海屏、底部安全区和小尺寸设备；
- 用户协议及隐私授权流程。

## 11. 非目标

首轮不包含：

- 把浏览器原型封装成 WebView；
- 继续使用 `localStorage` 作为业务数据源；
- 为后端不存在的字段和统计制造前端假数据；
- 直接从小程序调用管理端接口；
- 在小程序端保存微信 AppSecret、JWT 密钥或地图服务私钥；
- 未经确认上线真实短信、微信订阅消息或第三方地图服务；
- 为追求原型像素一致而复制手机外壳、模拟状态栏和 WebGL 背景。

## 12. 下一步

先完成第 8 节 Gate A 的字段和整改闭环确认。其中优先级最高的是道路 `tree_survive`、机井出水口/护筒损坏整改映射以及状态 `done` 的业务语义。确认后先调整后端及共享 API 类型，再进入 UniApp 基础工程初始化。
