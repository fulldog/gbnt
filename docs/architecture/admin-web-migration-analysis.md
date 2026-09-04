# 管理后台迁移实施说明

> 目标：将只读原型中的管理后台页面迁移到 `apps/admin-web/`，使用 Vue 3、TypeScript、Element Plus 与 Tailwind CSS。
>
> 决策日期：2026-09-04。

## 1. 已确认的实施基准

本次改造以当前 Go 后端和 `@gbnt/api-client` 的字段、枚举、校验及接口能力为唯一实现基准。

- 后端模型与接口是正式契约；
- `prototypes/static-demo/` 只用于参考页面内容、信息层级和交互形式；
- [`规则说明.md`](../../prototypes/static-demo/规则说明.md) 与 [`更新日志.md`](../../prototypes/static-demo/更新日志.md) 仅在不冲突时作为体验参考；
- 原型与后端冲突时，不在前端添加字段翻译、伪数据或本地补丁，而是直接采用后端行为；
- 后端没有提供的查询、统计、导出或编辑能力，本轮页面不模拟实现；
- 正式前端不得导入、修改、删除或重命名原型目录中的任何文件。

这项决策取代上一版报告中“先修改后端以对齐原型三态和题目”的建议。本轮只实现当前后端已经支持的完整管理端能力。

## 2. 当前后端契约

### 2.1 问题状态与年度

| 字段 | 正式值 | 前端展示 |
| --- | --- | --- |
| `status` | `new` | 待整改 |
| `status` | `pending` | 整改中 |
| `status` | `done` | 已整改 |
| `project_year` | `2020`、`2021`、`2022`、`2023` | 对应年度 |

前端不再引入原型中的 `inspected`。当前后端会将无需整改的新记录直接保存为 `done`，页面按 `done` 展示，不自行推断另一种状态。

### 2.2 问题类型与扩展字段

| 类型 | `type` | 当前扩展字段与题目 |
| --- | --- | --- |
| 机井 | `well` | `build_kind`、出水口/护筒数量、负责人、电话；6 题，包含 `transformer_ok` |
| 道路 | `road` | 长、宽、厚、`tree_survive`、负责人、电话；2 题 `has_shoulder/has_ash` |
| 桥涵闸 | `bridge` | 类型、长、宽、负责人、电话；1 题 `needs_rectify` |
| 林网 | `forest` | 移交数、现有数、存活率、负责人、电话；3 题 |
| 变压器 | `transformer` | 容量、型号、电压、负责人、电话；4 题 |

所有 checklist 项统一提交：

```ts
{
  type: QuizType
  value: boolean
  desc: string
  mustImg: boolean
  files: string[]
}
```

正向题选择“否”、反向题选择“是”时，当前后端要求 `desc`。当 `mustImg = true` 时，当前后端要求至少一个有效附件 ID。前端负责根据当前表单配置生成 `mustImg`，但不得改变字段名称和后端状态推导。

### 2.3 问题工作流

```text
创建排查记录
  ├─ 后端判定需整改 → new
  │    └─ 提交部分整改 → pending
  │          └─ 覆盖全部需整改题目 → done
  └─ 后端判定无需整改 → done

done ──重新整改──→ pending
new/pending ──重新指派──→ 状态不变
```

- 新建必须提交 `report_user_id`、电子签名附件 ID、定位地址、组织、年度和完整 `type_ext`；
- 需整改时必须提交 `plan_date`；
- 整改提交由 `rectify_list` 组成，每项必须有说明和照片；
- 管理端可以删除、重新整改和重新指派；
- 当前更新接口实际只稳定支持基础字段，`type_ext` 与电子签名更新逻辑在后端未启用，因此编辑页只开放后端真实可写字段，不能制造“保存成功但内容未变”的体验。

当前后端还有一个需要保留提示的边界：机井的出水口或护筒损坏数量会使新记录进入 `new`，但这两项不是 `QuizType`，而整改接口只能按 `QuizType` 写入 `rectify_list`。正式前端不会伪造题目类型；当一条机井记录仅由这两个数量字段触发整改时，整改对话框会明确提示当前接口无法映射。要完整闭环该场景，需要后续扩展后端整改项模型。

### 2.4 组织、用户与权限

- 组织层级为 `root → district → street → village`；
- 根节点不可删除，有下级的节点不可删除；
- 新增组织时类型由后端根据上级自动推导；
- 当前组织编辑接口只允许修改名称；
- 人员包含账号、姓名、手机号、组织、角色、状态和超管标识；
- 超级管理员不可编辑或删除；重置密码后密码为账号名；
- 角色权限以 `SysApi` 的数字 ID 保存，前端按 `module/action` 分组展示；
- 新角色即使传入 `status = 0`，当前后端也会默认保存为启用，因此新增界面固定采用启用状态，创建后才允许停用；
- 当前后端 RBAC 控制接口访问，前端用同一 API ID 集合控制菜单和按钮可见性。

当前管理端部分列表接口没有统一按登录用户组织自动裁剪。前端不能把组织筛选误称为安全边界；真正的数据隔离仍以后端返回结果为准。

## 3. 页面范围

正式应用包含登录页和 8 个业务页面。

| 页面 | 路由 | 本轮实现内容 | 不模拟的原型能力 |
| --- | --- | --- | --- |
| 登录 | `/login` | 后端图形验证码、账号密码、记住账号、会话恢复 | 本地验证码、保存明文密码 |
| 工作台 | `/workbench` | 总量、三态数量、完成率、类型分布 | 时间趋势和待办明细，当前接口未返回 |
| 专项整改 | `/issues` | 筛选、分页、列表、详情、新增、基础编辑、删除、整改、重新整改、重新指派、JSON 批量导入 | 原型的全量导出、三级名称联表字段 |
| 街道台账 | `/ledger/street` | 按街道和日期查询，展示后端 `org_id/type/total/pending/done` | 16 列演示台账、移交数量编辑、本地保存、导出 |
| 排查汇总 | `/ledger/survey` | 按街道和日期查询，展示后端 `type/total/pending/done` | 22 列演示汇总和虚构统计字段 |
| 组织架构 | `/system/orgs` | 树形展示、新增下级、改名、删除 | 修改排序，当前更新接口不支持 |
| 工作人员 | `/system/users` | 组织筛选、关键字、分页、增删改、重置密码、Excel 导入导出 | 单独的后端状态筛选 |
| 角色权限 | `/system/roles` | 角色增删改、状态、API 权限树 | 保存原型菜单路径字符串 |
| 操作日志 | `/system/op-logs` | 关键字、分页、详情 | 模块/状态/类型/时间筛选、耗时、method 和导出 |

以下页面不迁移：兼容跳转页、演示入口以及已从菜单删除的 `sys-dict.html`。

## 4. 技术架构

### 4.1 技术栈

- Vue 3 + `<script setup lang="ts">`；
- Vite；
- Vue Router，业务页动态导入；
- Pinia，承载登录会话与全局 UI 偏好；
- Element Plus 与 `@element-plus/icons-vue`；
- Tailwind CSS，通过 Vite 插件接入；
- ECharts，用于工作台类型分布；
- Vitest + Vue Test Utils；
- 现有 Axios transport 与 `@gbnt/api-client`。

### 4.2 分层

```text
路由页面
  └─ 领域组件 / composables / 展示转换
       └─ apps/admin-web/src/api
            └─ packages/api-client
                 └─ apps/server
```

- 页面组件不得直接调用 Axios；
- API 实例通过类型安全的 `provide/inject` 提供；
- Pinia 不缓存全部服务端列表，只保存会话、权限和界面偏好；
- 筛选、分页、loading、error 和弹窗状态留在页面或 composable；
- 展示标签、日期、区划路径等转换集中在 `utils/` 或领域模块，不写进 API 层。

### 4.3 目录

```text
apps/admin-web/
├── index.html
├── vite.config.ts
├── src/
│   ├── main.ts
│   ├── App.vue
│   ├── api/                 # 已有正式接口方法
│   ├── router/
│   ├── stores/
│   ├── layouts/
│   ├── components/
│   ├── composables/
│   ├── constants/
│   ├── utils/
│   ├── views/
│   │   ├── auth/
│   │   ├── workbench/
│   │   ├── issues/
│   │   ├── ledger/
│   │   └── system/
│   └── styles/
└── tests/
```

## 5. Element Plus 与 Tailwind CSS 边界

Element Plus 负责有状态和可访问性要求高的控件：

- `el-form`、`el-input`、`el-select`、`el-date-picker`；
- `el-table`、`el-pagination`、`el-tree`；
- `el-dialog`、`el-drawer`、`el-popconfirm`；
- `el-upload`、`el-image`、`el-tag`、`el-progress`；
- `el-skeleton`、`el-empty`、`el-result`、`el-alert`。

Tailwind CSS 负责：

- 页面网格、Flex、间距、宽高和响应式；
- 页面卡片布局和少量状态修饰；
- 宽表格的滚动容器；
- 登录页背景和应用框架布局。

不使用 Tailwind 重写 Element Plus 的内部控件，也避免大量 `:deep()`。主题通过 `styles/tokens.css` 中的语义变量统一映射。

## 6. 视觉与交互原则

采用数据密集但易扫描的政务管理后台风格：

- 主色沿用原型蓝色，成功/提醒/危险使用绿/琥珀/红；
- 使用 `PingFang SC`、`Microsoft YaHei`、`Noto Sans SC` 等中文系统字体；
- 菜单图标统一使用 Element Plus SVG 图标，不用 Emoji；
- 操作按钮有 loading 与 disabled 状态，避免重复提交；
- 请求失败提供错误原因和重试入口；
- 空数据使用明确空状态；
- 图表同时提供文本化统计，不只依赖颜色；
- 表单使用可见 label，错误显示在对应字段下；
- 键盘焦点可见，图标按钮有 `aria-label`；
- 支持 `prefers-reduced-motion`；
- 管理后台以桌面端为主，窄屏允许侧栏收起、筛选换行和表格横向滚动。

## 7. 关键实现规则

### 7.1 登录与 API

- 使用 `VITE_API_BASE_URL` 注入 API 地址，默认同源；
- Token 存储由会话 store 管理，并由已有请求层自动注入；
- 响应头返回新 Token 时立即更新；
- 401 清理会话并跳转登录；
- 只持久化 Token 和用户选择的“记住账号”，不持久化密码；
- 登录后和浏览器刷新时调用 `getMe` 校验会话；
- 页面统一处理 `ApiError`，不读取 Axios 私有错误结构。

### 7.2 专项整改

- 使用共享类型中的判别联合构造 `type_ext`；
- 新建对话框按类型展示对应字段和完整 checklist；
- checklist 的 `files` 来自附件上传接口返回的 `file_id`；
- 电子签名使用独立画布组件，转为 PNG 后上传；
- 编辑只提交当前后端真实可写的基础字段；
- 整改对话框从详情中的问题项生成 `rectify_list`；
- 重新指派人员从 `users.listByOrg(issue.org_id)` 获取；
- 列表按后端 `id DESC` 顺序展示，不做原型业务排序；
- 所有操作成功后重新请求当前列表，失败时保留用户输入。

### 7.3 字典与关联名称

组织和角色等基础数据在进入相关页面时一次加载：

- 组织 `id → 名称/路径`；
- 角色 `id → 名称`；
- 用户 `id → 姓名/账号` 仅在接口允许的范围内加载。

这只是展示转换。页面不通过逐行 API 请求补字段，也不假定前端映射构成数据权限。

### 7.4 权限

- 超管的 `apis = "*"` 视为拥有全部权限；
- 普通用户使用 API ID 集合；
- 通过 `/api/sys/apis` 获取 `method/path/module/action` 映射；
- 路由菜单以模块对应的 `view` 权限控制；
- 创建、编辑、删除、导入、导出按钮按对应 action 控制；
- 前端权限只用于界面收敛，后端拒绝仍需正常展示错误。

## 8. 实施顺序

### 阶段 1：基础工程

1. 初始化 Vite、Vue、Router、Pinia、Element Plus、Tailwind；
2. 建立主题、API 注入、会话 store 和路由守卫；
3. 实现登录页和管理后台布局。

完成标准：可连接真实后端登录、恢复会话、退出和处理 401。

### 阶段 2：核心业务

1. 工作台；
2. 专项整改列表与详情；
3. 新增、基础编辑、整改、重新整改、重新指派、删除和导入。

完成标准：页面只使用真实字段，所有已接入按钮都能调用现有接口，不存在占位成功提示。

### 阶段 3：台账与系统配置

1. 两个当前后端口径的台账页面；
2. 组织架构；
3. 工作人员及 Excel 导入导出；
4. 角色与 API 权限；
5. 操作日志。

完成标准：页面展示与 API 响应一致，未支持的原型能力不出现可点击入口。

### 阶段 4：验证

1. 规则和展示转换单元测试；
2. 会话、权限、问题表单和列表组件测试；
3. `vue-tsc` 严格模板检查；
4. Vite 生产构建；
5. 检查原型目录未变化和 `git diff --check`。

## 9. 本轮验收清单

- [x] `apps/admin-web` 可通过 pnpm 启动和构建；
- [x] Vue SFC 全部使用 `<script setup lang="ts">`；
- [x] 登录与路由守卫接入真实 API；
- [x] 8 个业务页面均有真实数据加载、loading、empty、error；
- [x] 后端已支持且可由现有字段表达的写操作可从界面完成；
- [x] 状态、年度、类型字段与 `packages/api-client/src/types.ts` 完全一致；
- [x] 正式页面不出现 `inspected`、2024、道路第三题等非后端字段；
- [x] 不使用原型模拟数据或 `localStorage` 保存业务数据；
- [x] 原型目录没有任何修改；
- [x] 类型检查、测试、构建和差异检查通过。

## 10. 官方技术参考

- [Vue：TypeScript 与组合式 API](https://vuejs.org/guide/typescript/composition-api)
- [Vue：`<script setup>`](https://vuejs.org/api/sfc-script-setup.html)
- [Vue Router](https://router.vuejs.org/)
- [Pinia](https://pinia.vuejs.org/core-concepts/)
- [Element Plus：Quick Start](https://element-plus.org/en-US/guide/quickstart)
- [Element Plus：Table](https://element-plus.org/en-US/component/table)
- [Tailwind CSS：Vite 安装](https://tailwindcss.com/docs/installation/using-vite)
