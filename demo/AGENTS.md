# AGENTS.md · 高标农田专项整治平台

> 面向 Cursor / AI Agent 的项目说明。
> **维护约定：凡改动目录结构、路由、入口、样式主题、模块依赖、公共组件 API、登录/验证交互或跨模块约定，须在同一次工作中同步更新本文件，无需用户另行提醒。**
> **代码改完 ≠ 完成；本文件「最后核对」未更新 = 未完成。**

最后核对：2026-08-23 · 数据字典左栏 #sd-tree-toggle 收起钮

---

## 技术栈

- 档位：**栈 B（localStorage）**
- 前端：原生 HTML + CSS + JavaScript（无构建、无框架）
- 数据：经 `frontend/js/storage.js`（`AppStorage`）读写 localStorage；**无** `backend/`、FastAPI、SQLite、`api.js`
- 工程规范：根目录 `开发规范.md`（只遵守栈 B 适用章节）
- 定位：客户演示用静态交互；真实前后端由专业团队另做。本仓库不追求生产级权限与持久化。
- 推进方式：**双端一把梭**（管理端 + 移动端 H5 同步落地），不做「先做一端」。

### 视觉

- 政府主色：`#015cbb`（写入 `frontend/css/variables.css` 的 `--app-primary`）
- 辅助绿：`#1a7f4b`（`--app-accent`）
- 禁止：CDN、emoji 图标、浏览器原生弹窗、常规 UI 阴影（壳 `drop-shadow` 等规范已列例外除外）

### 演示登录

| 项 | 约定 |
| --- | --- |
| 账号 / 密码 | 固定：`admin` / `123456`（管理端与移动端共用；写入种子会话即可） |
| 管理端验证码 | 随机 **4 位数字**；每次打开或刷新登录页都重新生成；点验证码图也可刷新 |
| 移动端验证 | **滑动验证** `#v40-slider-container`（对齐 PFF `captcha.html` 基础滑块）；逻辑见下「移动端登录页」 |

---

## 交叉验证

每次产出代码或修改后，**动态对照《通用型开发规范》逐条自查**（只检查本档位适用项），并确认本文件已同步。

### 共用

- 命名、目录、文件存放是否合规
- 字号、圆角、图标、阴影、内联样式是否符合规范
- 是否误用了业务页 `index.html`、CDN、emoji 图标、浏览器弹窗（选端页根目录 `index.html` 除外）
- 表单标签是否同行右对齐（登录页刻意无标签的除外，见下）
- 对客文案是否出现「演示」「Demo」等禁用词
- 图表若使用：是否 ECharts 且本地化

### 仅栈 B

- 启动脚本是否仅静态服务、动态端口、无后端逻辑
- 数据是否只经 `storage.js` / `AppStorage`，键名是否带项目前缀 `hsf:`
- 未创建 `backend/`、未引入 FastAPI / SQLite / `api.js`
- 地图若使用：已与用户确认离线或获准外链方案（无擅自接外网瓦片）

**发现遗漏或不合规时**：在下一次用户提问时，先自动修复已发现的问题，再交付用户本次需求的结果。两项一起回答，不要分两次。

---

## 项目概览

**高标准农田建设突出问题专项整治** —— 村级排查上报 → 待整改清单 → 整改回传照片闭环；管理端看工作台、专项整改、汇总管理与组织人员。

- 业务材料：`原始需求.md`、`街道专项排查台账.xls`、`高标农田专项整治平台.xmind` / `.png`
- 脑图只框方向；字段以台账表为准（类型选机井/道路/桥涵后，表单字段对齐对应 Sheet）
- 交付形态：管理后台（Admin 骨架）+ 移动端 H5（外罩手机壳），**不是**真实微信小程序

---

## 业务约定（讨论结论）

### 主链路

1. 工作人员账号进入即可上报（无单独「发布」闸门）。
2. **提交排查 = 生成待整改清单项**。
3. 上报时填写**整改责任人**与联系电话；闭环为：待整改 → 整改 → 提交整改后照片 → 完成。
4. 整改照片路径在**移动端 H5**上传（演示可用预设图 / 本机摄像头 / 相册）。

### 问题类型与字段

- 类型仅三类：**机井、道路、桥涵**（台账 Sheet）；待办统计另含 **桥涵闸**（同 `bridge`）、**林网**、**变压器** 分类入口（可扩展上报）。
- 各类型字段对齐 `街道专项排查台账.xls` 对应 Sheet；不必在脑图级展开检查项，实现时按表头落地。

### 导入

- **后台**做表格导入：按台账格式填写后导入。
- 导入结果进入同一套清单数据（localStorage）。

### 权限（演示级）

- **不做**真实登录联调（后台加账号再切到「小程序」验权）。
- 增删改查落 localStorage 即可。
- 数据范围概念上按**组织层级**（见下树）；**不做**人员级「只能看自己的单」。
- 整改责任人字段用于业务指向；演示不必做严格「仅指定人可提交」。

### 组织层级

```text
聊城经开区管委会（全称：聊城经济技术开发区管委会）
├─ 行政部门：农业农村局、产业发展园区
├─ 东城街道
│  └─ 李太屯社区、大胡社区、辛屯社区、单光屯社区、光岳社区、团结新村、大学城新村
├─ 北城街道
│  └─ 物流园社区、和谐新村、孙屯新村、常楼新村、邱张新村、河刘新村、
│     新水河新村、三官庙新村、运东新村、周集新村、中心新村、杨集新村
└─ 蒋官屯街道
   └─ 中心社区、滨河社区、李官屯新村、程麻新村、冯庄新村、
      海盛新村、久安新村、泰和新村、河东新村
```

村/社区名录对齐国家统计局统计用区划代码（2023）。样例排查单落在蒋官屯街道。

### 照片水印

- 样式：左下角；**地址**加粗（全屏预览约 16px）；黄竖条 + **度分秒** `22°32'44"N, 114°03'10"E`；**时间** `YYYY年M月D日 HH:MM`；白字轻阴影（对齐现场取证风，**无**整块黑底渐变）
- **入库原图**：`photos[]` / `photoSrc` **不烧录**水印；列表缩略图无水印
- **全屏预览**：`AppWatermark.openPreview` 用 **DOM 叠层**（地址 16px 加粗 + 黄竖条 + 度分秒 + 中文时间）；无黑底渐变，白字靠 `text-shadow` 可读；不二次 canvas 烧到原图
- 元数据：`address` / `lat` / `lng` / `photoAt|createdAt`；`AppWatermark.metaFromIssue(issue)`
- 定位：优先浏览器 GPS + 逆地理；失败再用固定示例地址

### 工作台 vs 汇总管理

- **工作台**：发现问题 / 已整改 / 待整改、排行与待办等运营视图。
- **汇总管理**：严格对齐 `街道专项排查台账.xls` 中 **街道台账**、**街道排查汇总** 两张 Sheet（表头合并单元格、底注）；筛选 **街道 + 起止日期**；列表壳对齐专项整改（无分页/无新增/无详情）；导出 **xlsx**（含合并格）。

### 管理端模块

- 登录（账密 + 随机 4 位数字验证码）
- 工作台
- 专项整改（finance hub 列表壳：筛选 / 工具栏 / 分页 / 新增 / 详情 / CSV）
- 汇总管理（街道台账、街道排查汇总）
- 系统配置（组织架构、工作人员、角色权限、数据字典、操作日志）

### 移动端模块

- 手机壳桌面 → 登录（滑动验证）→ 待办 / 上报 / 我的 / **问题详情（查看或页内提交整改）**
- 上报提交即生成待整改；整改在详情页上传整改后照片闭环（`rectify.html` 仅跳转兼容）

---

## 入口与双端形态

| 入口 | 路径 | 说明 |
| --- | --- | --- |
| 选端页 | `index.html` | 根目录唯一 HTML；点端口进对应登录 |
| Web 登录 | `web/login.html` | 管理后台 |
| Web 业务 | `web/*.html` | 工作台 / 整改 / 汇总管理 / 组织 / 系统 |
| 小程序登录 | `miniapp/login.html` | 手机壳内 H5 |
| 小程序业务 | `miniapp/*.html` | 待办 / 上报 / 我的 / 整改 / 桌面壳 |

公共资产：`frontend/`（与 `web/`、`miniapp/` 平级）。  
媒体素材：`media/`（与 `frontend/` 平级；图标 / logo / 背景图等）。  
手机壳：`frontend/assets/phone/`、`frontend/css/device-shell.css`、`frontend/js/device-shell.js`。

### 小程序顶栏（公共封装 · 必读）

所有 `miniapp/*.html`（除桌面壳可隐藏顶栏外）经 `device-shell.js` 自动挂载微信式两行顶栏：

1. **系统行**：时间 · 信号 · 5G · 电量  
2. **导航行**：左侧标题 + 右侧胶囊（··· | 关闭）

**页面声明**（写在 `#app-viewport` 上）：

| 属性 | 取值 | 说明 |
| --- | --- | --- |
| `data-mp-status` | `transparent` / `solid` | 登录、主界面用 `transparent`；子界面用 `solid`（白底） |
| `data-mp-title` | 文案 | 导航行左侧标题；可空；与内容区 **16px** 左对齐 |
| `data-mp-back` | 相对路径 | 有则显示返回箭头；**无则** `.app-device__nav-left` 隐藏不占位（勿只靠 `:empty` 缩宽） |

**运行时 API**（`window.HSFDevice`）：`setStatusMode` / `setNavTitle` / `setNavBack` / `getMountRoot()`。

| 页面 | status | title | back |
| --- | --- | --- | --- |
| `login.html` | transparent | — | — |
| `todo.html` | transparent | 高标农田专项整治 | — |
| `issue-detail.html` | solid | 问题详情 | `./todo.html` |
| `issue-map.html` | solid | 位置 | `./todo.html` |
| `report.html` / `mine.html` | transparent | — | — |
| `mine-list.html` | solid | 我上报 / 待整改 / 已整改 | `./mine.html` |
| `rectify.html` | solid | 提交整改（跳转详情） | `./todo.html` |
| `agreement.html` | solid | 用户协议 | `./login.html` |
| `privacy.html` | solid | 隐私政策 | `./login.html` |

**透明顶栏叠层**：`.app-device__status--transparent` 为 `position: absolute`、**无底色**（`background: none`），叠在内容上不占行高，便于登录全屏背景。透明页带 `.m-hd` 时色条 `padding-top: 100px` 上延；**待办 / 上报 / 我的**主界面用内容区自带顶距，**不再**叠蓝 `m-hd`。

### 小程序软跳转（防闪屏 · 必读）

| 项 | 说明 |
| --- | --- |
| 脚本 | `frontend/js/mp-nav.js`（在 `device-shell.js` 之后） |
| API | `HSFNav.go(href)`；同目录 `<a>` 自动拦截 |
| 原理 | `fetch` → 只换 `#app-viewport` → 更新顶栏 → **补载本页尚未引入的依赖**（框架脚本 + 如 `maplibre-gl.js` 等库）→ 重载 `js/pages/*`；壳与流体背景不销毁 |
| 首屏 | `<html class="hsf-mp">`，挂壳后 `hsf-shell-ready` |
| 清理 | 跳转前 `hsf-page-leave`；`document` 级监听须在此释放 |
| 例外 | `demo-phone.html` 进出仍整页跳转 |

页内跳转优先 `HSFNav.go(...)`，勿裸写 `location.href`（桌面壳除外）。

### 轻提示与日志（小程序 · 必读）

| 项 | 约定 |
| --- | --- |
| 轻提示 | `AppUI.toast`；有手机壳时挂到 `.app-device__screen`（`app-toast-host--in-device`），样式写在 `device-shell.css`（小程序未引 `layout.css`，toast 不能只依赖 layout） |
| 日志 | 业务排错用 `AppLog.info/warn/error(scope, message, detail)`（规范 §6.3.8）；禁止无标签 `console.log`；`AppUI.toast` 同步打 `ui.toast` 日志 |
| 底栏 | `.m-tabbar` / `.m-tab`：文案 **无下划线**（`text-decoration: none`，含 hover/focus/active/visited）；勿依赖浏览器 `<a>` 默认样式 |

### 管理端骨架（vben 壳 · 必读）

对齐路域资源项目标准后台：`#menu-root` 侧栏菜单、`<vben-header>` 顶栏+多页签、`.sidebar-footer` 底部折叠钮。

| 项 | 约定 |
| --- | --- |
| 布局 | `.app-container` > `<vben-sidebar>` + `.main-wrapper`（`<vben-header>` + `.content-container` + `<vben-footer>`） |
| 菜单数据 | `frontend/js/nav-config.js`（`HSF_NAV`）→ `frontend/js/vben-bridge.js`（`HSF_VBEN_MENU`） |
| 根路径 | 各业务页 `<script>window.HSF_BASE='../'; window.HSF_VBEN_DEFAULT_TAG={ title, path };</script>` |
| 样式 | `frontend/css/vben-shell.css`（与 `variables.css` / `layout.css` 同引；业务页内容样式仍用 `layout.css` 表格/表单类） |
| 组件脚本 | `frontend/js/vben/sidebar.js` · `header.js` · `footer.js` · `layout.js`；图标桥 `vben/icons-bridge.js`（`AppIcons` → `window.Icons`） |
| 加载顺序 | `icons.js` → `nav-config.js` → `icons-bridge` → `vben-bridge` → vben 组件 → `layout.js`（会话校验）→ 页脚本 |
| 侧栏 Logo | `media/favicon.png`；底栏 `#btn-collapse-mini` 切换 `.mini`（64px）；顶栏折叠钮派发 `app-toggle-hide` |
| 顶栏 | 面包屑监听 `app-menu-change`；页签存 `sessionStorage` 键 `hsf:vben-tags`；菜单搜索 ⌘K；退出确认后清 `session` 跳 `web/login.html` |
| 会话 | `layout.js` 在存在 `<vben-header>` 时调用 `AppNav.requireSession`；用户区读 `AppStorage` 会话姓名首字头像 |
| 废弃 | 各页内联 `.admin-layout` / `.app-sidebar` / `.app-header` 勿再恢复；`AppNav.setBreadcrumb` 仍可用（转发 `app-menu-change`） |

### 管理端登录页（`web/login.html` · 必读）

| 项 | 约定 |
| --- | --- |
| 布局 | `login.png` **全视口铺满**（`.login-visual` `fixed` + `cover`，不被表单列挤压）；右侧约 **40%** 白底 `.login-panel` **悬浮叠在底图之上** |
| Logo | `.login-panel__logo` 用 `media/favicon.png`（**128px**，无圆角裁切） |
| 标题 | Logo 下「欢迎使用」+ `AppConfig.appName`（**20px 加粗**）；**左对齐** |
| 表单 | 账号 / 密码 / 验证码：**标签在上**；输入框 **白底 + 描边**；验证码 Canvas **无框无底**、白底一体；右侧 **phone** / **eye·eyeOff** 图标；**三项齐全**后登录钮可点 |
| 记住密码 | `#rememberPwd`；`AppStorage` 键 `loginRemember`；未勾选时默认填充 `AppConfig.demoAccount`（`admin` / `123456`） |
| 脚本 | `frontend/js/pages/login.js` |

### 管理端工作台（`web/workbench.html` · 必读）

| 项 | 约定 |
| --- | --- |
| 布局 | 无页头标题；`.wb-page` 栅格 **14px** 间距（含内容区内边距） |
| 指标卡 | 四格：**上报数量** / **待整改** / **已整改** / **整改完成率**；上报·待整改为**真实面积折线**（随趋势时间维度、悬停 tooltip）；已整改为 **6 类柱状图**（各类型已整改数）；完成率用进度条 |
| 趋势区 | **单卡片**：Tab「整改趋势」+ 时间筛选（**近七天/近一个月/近半年/全部**）；左双面积折线、右类型排名 |
| 趋势粒度 | 近七天·近一个月=**日**；近半年=**月**；全部=**年** |
| 类型排名 | **类型整改排名**；固定 6 类（机井/道路/桥涵闸/林网/变压器/其他），序号+名称+数量，无进度条 |
| 待办 | 底栏 **待办列表** 表格（待整改项）；列含**行政区划**（街道 / 村）；**居中**对齐 |
| 脚本 | `frontend/js/pages/workbench.js` |

### 管理端专项整改（`web/rectify.html` · 必读）

对齐路域 finance hub：`query-card` 筛选 + `#table-tools-rf` 工具栏 + `vben-table-std` 列表 + 底部分页器。

| 项 | 约定 |
| --- | --- |
| 布局 | `.content-container.rf-page`；`#query-group-rf`（折叠筛选）+ `#combined-table-rf`（表头工具/表体/分页） |
| 筛选 | 默认 **问题类型 + 整改状态 + 操作区**（重置/查询/展开）；展开后 **关键词** + **行政区划** 树（`HSFRegionTreeSelect`）；类型/状态用 **`HSFAtomicSelect`**（PFF 所属部门） |
| 下拉组件 | 单选 `frontend/js/atomic-select.js` + `atomic-select.css`（`HSFAtomicSelect.create`）；多选 `HSFAtomicSelect.createMulti`（PFF 多选项目）；弹层内 `fixedDropdown: true` |
| 卡片圆角 | 筛选 `#query-group-rf` 与列表 `#combined-table-rf` 两块独立白底、**卡片壳无外描边**；`.rf-page` **`gap:10px`**；筛选仅 **上圆角**，列表仅 **下圆角**；表体 `#rf-scroll-wrap` **1px** `#e8e8e8` 描边 |
| 工具栏 | `#table-tools-rf`：**导出/导入 xlsx**（`btn-ghost`；模板 `media/专项整改导入模板.xlsx`，对齐街道专项排查台账）、新增、隐藏查询、刷新、全屏、列设置 |
| 列表列 | 序号 / 类型 / 编号 / 街道 / 村/社区 / 整改责任人 / 联系电话 / 计划完成 / **倒计时**（`col-countdown` 180px 不省略；**逾期**行浅红底 `#fff1f0`、倒计时字 `#cf1322`）/ 状态 / 操作；**无**问题描述列；单元格 **无 title 悬停** |
| 导入导出 | `frontend/libs/xlsx/` + `rectify-xlsx.js`（`HSFRectifyXlsx`）；支持「专项整改」统一表及机井/道路/桥涵台账 Sheet |
| 列表 | 固定左序号、右操作（查看 / 编辑 / 删除）；行点击高亮；**无**「完成」——整改闭环由移动端提交整改结果+照片触发 |
| 分页 | `#rf-pagination-ct`；10/20/50 条每页 |
| 新增/编辑 | `#rf-form` **五列栅格**（`标签|控件|中缝|标签|控件`；标签列 `10rem` 不换行，弹窗 **1100px**，中缝 `12px+9.5rem`；`display:contents` 拍平嵌套）；**聚焦仅描边无阴影**；**现场照片**标题与上传说明同行、照片条与说明左对齐；**上报人/联系电话**在问题类型上方，新增时自动读当前登录人员、可改；**项目名称**与行政区划同排；类型块同行对齐；**单选项行高 36px**、`.m-yn` 打钩打叉对齐 `miniapp/report`；**必填***：行政区划、**项目名称**、问题类型、问题描述、现场照片、地址、计划完成、整改责任人、联系电话；带单位输入 **单位在框内**（`km`/`m` 等）；样式 `rf-form-report.css` |
| 详情 | `#rf-detail-overlay` + `rectify-detail.js`；双栏各自滚动、**文字即时展示**；照片区对齐待办 `m-media` 扫光占位后 **canvas 烧录水印**（右键另存含水印；全屏预览 `baked` 不叠第二层）；待整改右栏倒计时等待区 |
| 样式 | `frontend/css/pages/rectify-hub.css` · `rectify-modal.css` · `rf-form-report.css` |
| 脚本 | `libs/xlsx` → `rectify-xlsx.js` → `atomic-select.js` → `region-tree-select.js` → `watermark.js` → `mp-photos.js` → `report-form-engine.js` → `rectify-detail.js` → `rectify-form.js` → `rectify.js` |

### 管理端汇总管理（`web/ledger-street.html` · `web/ledger-survey.html` · 必读）

侧栏 **汇总管理** 下两页；`ledger.html` 跳转 `ledger-street.html`。严格对齐 `街道专项排查台账.xls` 对应 Sheet（表头合并格、底注排版）。

| 项 | 约定 |
| --- | --- |
| 布局 | `.ld-page`；`#query-group-ld`（筛选）+ `#combined-table-ld`（工具栏 + 长表滚动区）；**无**分页 / **无**新增 / **无**详情 |
| 筛选 | **街道**（`HSFAtomicSelect`）+ **起止日期**（`HSFRangePicker` / `#ld-filter-date-range`，对齐 PFF `rp-v1-trigger`）；重置 / 查询 / **展开**（`#ld-toggle-btn`；`.is-fold` 折叠项）；样式对齐专项整改 `query-card` |
| 工具栏 | 导出 xlsx、隐藏查询（`display:none`）、刷新、全屏；**不**导出 csv |
| 街道台账 | 14 列；标题行 + 3 级表头 + 数据行 + 底注；数据由 `HSFLedgerData.buildStreetLedger` 按村聚合清单 |
| 街道排查汇总 | 21 列；标题行 + 4 级表头（含「联系电话」行）+ 数据行 + 底注；`HSFLedgerData.buildSurveySummary` |
| 导出 | `ledger-xlsx.js`（`HSFLedgerXlsx`）；`!merges` 与 xls 一致 |
| 滚动描边 | `#ld-scroll-wrap` 用 `border` + `::before/::after` 固定左右描边（勿用 `inset box-shadow`，会被白底盖住）；横向滚动时 `is-scrolling-left` / `is-scrolling-right` |
| 样式 | `rectify-hub.css`（列表壳）+ `ledger-hub.css`（`.ledger-sheet-table` 合并表）+ `range-picker.css` |
| 脚本 | `libs/xlsx` → `ledger-data.js` → `ledger-xlsx.js` → `atomic-select.js` → `range-picker.js` → `ledger-common.js` → `ledger-street.js` / `ledger-survey.js` |

### 管理端组织架构（`web/sys-org.html` · 必读）

系统配置 → **组织架构**；数据 `hsf:sys.v1.sysDepartments`（`LadsStorage`），种子由 `hsf-sys-seed.js` 从 `hsf:orgs` 生成。

| 项 | 约定 |
| --- | --- |
| 层级 | **街道即街道办事处**：种子 `type: office` 节点不入树，其下 `street` 直接挂管委会；不出现「街道办事处 → 街道」双层 |
| 列表标题 | **单位列表**；表头「单位名称」 |
| 新增 | 工具栏与行内统一 **新增单位**；**村/社区**（`remark` 为 `village` / `community`）行内钮 **禁用**（降透明度、不可点） |
| 弹窗 | 上级单位 / 单位名称；标题「新增单位」「修改单位」 |
| 根节点 | `org-gov`（聊城经济技术开发区管委会）不可删 |
| 脚本 | `hsf-sys-seed.js` → `tztt-sys-storage.js` → `org-structure.js` |

### 管理端工作人员（`web/sys-staff.html` · 必读）

系统配置 → **工作人员**；左树筛选 + 右列表；数据 `hsf:sys.v1.sysUsers`，保存时同步 `hsf:staff`。

| 项 | 约定 |
| --- | --- |
| 默认选中 | 进入页左侧树默认选中 **聊城经济技术开发区管委会**（`org-gov`），右侧列表即有数据 |
| 列表列 | 「所属单位」展示**纯单位名**（无 `└` 层级前缀）；「创建时间」列宽 200px、不省略 |
| 新增弹窗 | 「所属单位」用 `rf-form-field__ctrl` + `HSFRegionTreeSelect`（组织树数据源 `sysDepartments`） |
| 文案 | 页面内「部门」统一为 **单位**（左侧「单位组织」等） |
| 筛选 | `filter-bar`；操作区 `.filter-bar__cell--actions` **右对齐**（对齐数据字典） |
| 脚本 | `region-tree-select.js` → `users.js` |

### 管理端角色权限（`web/sys-roles.html` · 必读）

授权树按 **HSF_NAV** 菜单生成；各页仅展示该页实际具备的操作（`roles.js` → `DEFAULT_ACTIONS_BY_PATH`）。

| 菜单 | 操作项 |
| --- | --- |
| 工作台 | 查 |
| 专项整改 | 查 / 增 / 改 / 删 / 导入 / 导出 |
| 街道台账、街道排查汇总 | 查 / 导出 |
| 组织架构 | 查 / 增 / 改 / 删 |
| 工作人员 | 查 / 增 / 改 / 删 / 导入 |
| 角色权限、数据字典 | 查 / 增 / 改 / 删 |
| 操作日志 | 查 / 导出 |

### 管理端数据字典（`web/sys-dict.html` · 必读）

对齐 **街道专项排查台账** 五类排查；左 **排查类型**（机井 / 道路 / 桥涵 / 林网 / 变压器），右上 **选项字段** 条，右表维护该字段的选项值（单选/多选类，不含数值输入项）。

| 项 | 约定 |
| --- | --- |
| 存储 | `hsf:sys.v1.sysDictModel`（`version: 1`；`types` + `fields` + `items`） |
| 机井字段 | 新建/配套、出水、管道、走线、配电箱、井台井盖 |
| 道路字段 | 路肩、灰土层 |
| 桥涵字段 | 设施类型（桥/涵/闸） |
| 林网字段 | 断带、枯死木、病虫害 |
| 变压器字段 | 电压等级、通电、设备/配电完好、私拉乱接 |
| 样式 | 左侧类型选中 `.is-active` **无描边**；左栏 `#sd-tree-toggle` 收起/展开排查类型（对齐工作人员 `#su-tree-toggle`） |
| 全屏 | `#sd-fullscreen` → 切换 `#sdPageRoot` 一次（对齐 `#sr-fullscreen`） |
| 脚本 | `dict.js` |

### 管理端操作日志（`web/sys-logs.html` · 必读）

对齐专项整改上下分块：`content-container.ol-page` + `#query-group-ol` + `#ol-split` + `#combined-table-ol`。

| 项 | 约定 |
| --- | --- |
| 布局 | `.ol-page` `gap:10px`；筛选 `#query-group-ol` 与列表 `#combined-table-ol` 独立白底 |
| 圆角 | 筛选 **四角无圆角**；列表仅 **下圆角** `0 0 8px 8px`；中间 10px 间隙处上下相接边须平直 |
| split 壳 | `#ol-split .split-left` 须覆盖 `page-split.css` 默认（`border`/`box-shadow`/`border-radius:8px` 全清、背景透明），对齐 `#rf-split .split-left` |
| 全屏 | `#ol-fullscreen`（勿用 `#btn-fullscreen`，与顶栏冲突） |
| 脚本 | `op-log.js`；样式 `oplog-showcase.css` + `oplog-page.css` |

### 移动端登录页（`miniapp/login.html` · 必读）

| 项 | 约定 |
| --- | --- |
| 背景 | 全屏 `media/background.png`（CSS：`frontend/css/pages/mobile.css` → `.m-login`） |
| Logo | `.m-login__logo` 用 `media/favicon.png`（圆形裁切）；站点 favicon 同图 |
| 卡片 | `.m-login__card`：**无描边**；白底圆角 |
| 副标题 | **无** `.m-login__sub` |
| 表单标签 | 账号 / 密码 **无** `<label>`；靠 placeholder + `aria-label` |
| 输入框图标 | 账号前 `user`；密码前 `lock`；密码后 **显示/隐藏**（`#mPwdToggle`，`eye` / `eyeOff`） |
| 输入溢出 | `.m-field input` 等须 `box-sizing: border-box` |
| 描边 | 账号、密码、滑动验证默认 **无描边**；聚焦时输入框白底 + 主色描边；登录钮保留主色边 |
| 输入底色 | 账号 / 密码 / 滑块轨道：`#f0f4f8`；聚焦输入：`#fff` + `border: 1px solid var(--app-primary)` |
| 统一高度 | 账号 / 密码 / 滑动验证 / 登录钮均为 **44px** |
| 滑动验证 | `#v40-slider-container`；手柄 `#v40-handle`：`top/left` 初始 **3px**，`48×38`，`border-radius: 8px`，**无阴影**；JS 拖拽 `left` 范围 `[3, 轨道宽−手柄宽−3]`，滑到底右侧亦留 3px；图标 `#v40-icon` 为 SVG（`chevronRight` / `check`） |
| 滑动提示色 | 拖动中 / 成功：白字 `rgba(255,255,255,0.8)` |
| 登录按钮 | 账号非空 + 密码非空 + 验证通过后可点；**另须勾选协议**才登录；未勾选 → 屏内顶部轻提示「请阅读并同意用户协议与隐私政策」，并 `AppLog.warn('m-login', …)` |
| 协议勾选 | 登录钮下方圆形勾选（选中主色底 + **CSS 自绘白勾**）：「我已阅读并同意《用户协议》和《隐私政策》」；协议名主色链到 `agreement.html` / `privacy.html`（软跳转） |
| 页脚 | 「聊城经济技术开发区管委会」：`.m-login__footer`，`margin-top: auto` 贴底 |
| 脚本 | `frontend/js/pages/m-login.js` |

曾试用点选验证 `#click-captcha-v43` 弹层，已废弃，勿再加回。底图 `media/captcha-bg.jpg` 可留作素材，登录流程不再引用。

### 移动端待办页（`miniapp/todo.html` · 必读）

已定稿为**搜索 + 三筛选**布局（原统计格子版已废弃）。`todo-select.html` 仅跳转到本页。

| 项 | 约定 |
| --- | --- |
| 顶栏 | `data-mp-status="transparent"` + `data-mp-title="高标农田专项整治"`（与内容区 16px 左对齐；无返回时隐藏 `.app-device__nav-left`）；**无**蓝条 `m-hd` |
| 布局 | 搜索 → **三触发钮**（类型 / 行政区划 / 状态）→ 列表 |
| 列表卡 | **社交流**：左头像正方形圆角 6px（`avatarSrc`，暂无则姓名首字）；姓名·时间 / 右侧状态（`formatPlanStatus`）；描述可选；网络图九宫格（**缩略图无水印**；点图放大经 `AppWatermark.openPreview` **带水印**，不进详情）；类型标签 + **区划标签**；定位可点进地图。整卡进详情（点定位/点图不进详情） |
| 空态 | 插图 `miniapp/List.svg` +「暂无记录」（上移 30px）；无「去上报」 |
| 滚动 | `.m-list` **可滚动、不显示滚动条** |
| 地图 | `issue-map.html`：MapLibre 本地化；底图优先 `street-gaode.json`（高德栅格瓦片，非 JS API）→ `street-carto.json` → `street-esri.json`；无 attribution / 无加减控件；渐变定位钉；底栏悬浮胶囊。**勿用 OpenFreeMap**。软跳转须经 `mp-nav` 补载 `maplibre-gl.js`（勿只重载 `pages/*`） |
| 清单图 | 种子 `photos` 用 picsum 网络图（`seeded-v13`）；格子 `.m-media`：加载扫光对齐 PFF `loading-skeleton-v73`，空/失败 `#f0f2f5` + 文案 `img` |
| 选择器 | 禁止原生 `<select>`；挂 `.app-device__screen`；`hsf-page-leave` 关闭。**类型 / 状态**：三列按钮点选；**行政区划**：双列级联滚筒。滚筒可滚动、**无滚动条**；框选项文字主色 |
| 数量 | 弹窗选项带括号数。**类型 / 区划**=待整改条数；**状态** 全部/待整改=待整改总数，已整改=已整改条数 |
| 描边 | 搜索框、筛选触发钮 **无描边**；底色 `#f0f4f8` |
| 清单数据 | `frontend/js/data/issues-seed.js`（`HSFIssuesSeed.build`）；`seed.js` 前须先加载 |
| 角标 | `AppData.formatPlanStatus`：待办卡右侧 **剩余X天X时** / **逾期X天X时** / **MM-DD 完成**（跨年才带 `YYYY-`）；列表按待整改优先、同组 `createdAt` 倒序 |
| 详情 | 顶图→定位→类型\|倒计时→分割→**问题描述/整改措施**（标题旁 brush 黑图标、正文与标题字左对齐、无左描边）→计划完成时间→分割→短字段→**已整改时「整改结果」绿底强调块**（说明→照片→clock 图标+完成时间）→联系人（整栏呼叫）→需处理时说明框内 **`#rPhotos` 复用上报照片条**（`AppMpPhotos`）→提交。种子 `seeded-v13` |
| 脚本 | `frontend/js/pages/m-todo.js` |
| 种子 | `seeded-v13`；人名统一侯吴王李杨常用名（上报/整改/井长）；旧缓存 `AppSeed.reset()` |

### 移动端上报页（`miniapp/report.html` · 必读）

**现场优先**单页（不抄 X、不堆三段标签表单）。改本页前先读完本表，**禁止**凭惯性恢复旧版密表单 / 示例图按钮 / 「问题上报」顶栏标题。

| 项 | 约定 |
| --- | --- |
| 顶栏 | `data-mp-status="transparent"`；**无** `data-mp-title`、**无**蓝条 `m-hd` |
| 布局 | 无框描述 → **多图横滑 `#rPhotos`** → **定位行** → **10px `#f5f7fb` 分割带** → **`#v86-controller` 类型分段** → 摘要行（区划 / **项目名称** / 编号）→ 类型字段块 → **整改措施 / 计划整改完成时间** → **`#rAssignBlock`（整改责任人 / 联系电话手输）** → 底栏上方固定「提交上报」+ Tab。日后类型台账字段多时，在分割带下用轻量版块标题分组，勿恢复旧蓝竖条大分区 |
| 类型 | `#v86-controller`：`well` → `#rWellBlock`，`road` → `#rRoadBlock`，`bridge` → `#rBridgeBlock`，`forest` → `#rForestBlock`，`transformer` → `#rTransformerBlock` |
| 机井块 | `#rWellBlock`：**无**分区标题。是/否/新建配套圆形单选；**出水口总数 / 出水口损坏 / 护筒总数 / 护筒损坏**分行 +「个」；块底 **井长及分管负责人 / 联系电话**（手输）。提交写入 `issue.well`（含 `outletTotal` / `outletDamaged` / `casingTotal` / `casingDamaged` / `keeperName` / `keeperPhone`） |
| 道路块 | `#rRoadBlock`：对齐台账 Sheet「道路」。长度（千米）/ 宽度（米）/ 厚度（米）；路肩、灰土层是/否圆形单选；林网存活率（棵）；块底 **负责人 / 电话**。提交写入 `issue.road`，并同步顶层 `length` / `width` / `thickness` / `hasShoulder` / `hasAsh` / `treeSurvive` |
| 桥涵块 | `#rBridgeBlock`：对齐台账 Sheet「桥涵」。设施类型桥/涵/闸圆形单选；长度 / 宽度（米）；块底 **负责人 / 电话**。提交写入 `issue.bridge`（`kind` / `length` / `width` / `keeperName` / `keeperPhone`），并同步顶层 `length` / `width` / `bridgeKind` |
| 林网块 | `#rForestBlock`：台账无明细列，按管护规范 + 街道台账「移交/现有」自拟。移交株数 / 现有株数 / 存活率（%）；断带、枯死木、病虫害（是=红叉）；负责人 / 电话。提交 `issue.forest`。**待客户确认可改** |
| 变压器块 | `#rTransformerBlock`：台账无明细列，按机井通电/配电排查口径自拟。容量（kVA）/ 型号；电压 10kV\|0.4kV；通电、设备完好、配电完好；私拉乱接（是=红叉）；负责人 / 电话。提交 `issue.transformer`。**待客户确认可改** |
| 整改指派 | 措施与计划时间在类型块外常显；**整改措施**同行多行 textarea；**计划整改完成时间**底部年/月/日滚筒（勿用原生 `type=date`）；`#rAssignBlock`：**整改责任人**、**联系电话**手输；行标签黑色不换行 |
| 底栏 | `.m-report__foot` 上方 `::before` 白底渐变（透明→不透明）；顶部 `#rTopFade` 为对称渐变（不透明→透明），**仅上滑后显示**（`scrollTop>16`），`z-index` 低于壳顶栏，不挡时间/电量 |
| 提交校验 | 必填：≥1 张图、区划、**项目名称**、计划整改完成时间、整改措施、整改责任人、整改联系电话；机井另校 **出水口/护筒总数与损坏数**（损坏≤总数）；道路/桥涵/林网/变压器各类型另校专属字段。写入 `AppData.addIssue`（`unshift`），待办按创建时间倒序 |
| 描述 | 无边框 textarea，placeholder「发现了什么问题？」；**无**「问题详情」等分区标题 |
| 加号 | 虚线方框 + 居中 `plus`；点开底部 action sheet（`.m-sheet`），**仅两行**：拍照、上传（各占一行）；点遮罩关闭。逻辑在公共 `frontend/js/mp-photos.js`（`AppMpPhotos`），上报与详情共用 |
| 拍照 | **必须** `getUserMedia` 壳内全屏取景（`.m-report__cam`）：左上悬浮关闭 X；live 底栏三格 **闪光灯 \| 圆形快门 \| 前后切换**；点快门进复核，**完成**写入原图到 `#rPhotos`（**不烧录水印**），取消回取景。**禁止** `<input capture>` 冒充拍照 |
| 取景底栏 | live：三等分图标+白圈快门。review：**不复用三格**——左「取消」右「完成」、中间 gap **10px**、两钮 `flex:1` 拉满底栏；取消白描边 30% 圆角 6；完成绿底白字圆角 6。闪光灯无 torch 时 toast |
| 上传 | **仅**本地 `<input type="file" accept="image/*" multiple>`；支持多选；按剩余名额截取 |
| 数量 | 最多 **6** 张；满 6 **不显示**加号；间距 **10px**；溢出 **横向滑动**（隐藏滚动条） |
| 删除钮 | 正方形 **24×24**；圆角仅右上+左下 `0 6px 0 6px`（左上/右下直角）；填充 `rgba(207,19,34,0.8)`，悬停实色 `#cf1322`；内 **16×16** SVG `close`（`translateY(2px)` 纠偏）；贴缩略图右上角 top/right=0 |
| 预览 | 点缩略图 → `AppWatermark.openPreview`（叠水印）；再点关闭 |
| 离开页 | `hsf-page-leave` 须 `AppMpPhotos.destroy`（停轨 + 关 sheet / 预览）+ 关选择器 |
| 水印 | 缩略图/入库为原图；放大预览叠水印（地址+度分秒+中文时间）；提交写入 `photos[]` + `photoSrc` + `photoAt` + 定位字段 |
| 选择器 | 禁止原生 `<select>`；区划双列滚筒（无「全部」）；默认「请选择」，点选确认后才写入；挂 `.app-device__screen`；**无**整改人点选 |
| 编号 | 摘要行内右对齐轻输入；**选填**；placeholder「选填」 |
| 定位 | 紧挨 `#rPhotos` 下方；左侧 `mapPin`；进页/刷新走 `AppWatermark.locate`：**浏览器 GPS** → 逆地理文案（BigDataCloud 中文）；失败则默认聊城示例点并 toast；地址完整显示可换行 |
| 禁止项 | 「选用示例图」入口、大图 hero `#rMedia`、三段「基本信息/问题详情/整改与现场」分区头 |
| 脚本 | `frontend/js/pages/m-report.js` + `frontend/js/mp-photos.js` |

### 移动端我的页（`miniapp/mine.html` · 必读）

| 项 | 约定 |
| --- | --- |
| 顶栏 | `data-mp-status="transparent"`；**无**蓝条 `m-hd`、**无**渐变头图 |
| 布局 | 身份条（首字头像 + 姓名/角色 + 组织）→ 灰底三格概览（我上报 / 待整改 / 已整改，可点）→ 行列表（用户协议、隐私政策、退出登录）→ Tab |
| 概览跳转 | 三格进入 `mine-list.html?scope=reported\|pending\|done`（单开列表，**不**走待办筛选；「我上报」=当前人上报） |
| 列表 | 协议/隐私：左侧黑线框图标（`ledger` / `shield`，stroke 2px 圆角）；标题；**右箭头右对齐**。退出居中危险色，无描边卡片 |
| 脚本 | `frontend/js/pages/m-mine.js` |

### 移动端我的清单（`miniapp/mine-list.html` · 必读）

| 项 | 约定 |
| --- | --- |
| 顶栏 | `solid`；标题随 scope；返回 `./mine.html` |
| 列表 | 复用待办社交流卡片；缩略图无水印，点图放大带水印；空态同待办插图；进详情/地图带 `back=` 回本列表 |
| 脚本 | `frontend/js/pages/m-mine-list.js` |

### 易错红线（改 UI 前默念）

| 场景 | 做错一次的代价 | 正确做法 |
| --- | --- | --- |
| 软跳转进地图/带库页面 | 白屏「组件未加载」 | `mp-nav` 对非 `pages/*` 的依赖也 `ensureFrameworkScript`（含 maplibre） |
| 地图底图 | OpenFreeMap / 不稳外链白屏 | 本地样式链：高德栅格 → Carto → Esri；**勿接 OpenFreeMap** |
| 「拍照」 | `input capture` 变成选文件 | 必须 `getUserMedia`；快门后先复核，点「完成」才入库 |
| 水印 | 列表缩略图烧录水印 / 入库即烧 | `photos` 存原图；仅 `AppWatermark.openPreview` 叠水印 |
| 取景复核底栏 | 硬套 live 三格留空列 | 左右两钮 + gap 10px 拉满，勿复用三列栅格 |
| 角标删除 | 圆钮悬空留边 | 按设计稿：贴角、尺寸/色值写死在上表 |
| 对客文案 | 写「演示/Demo/示例图」 | 规范 §6.3.9；演示入口勿对客露出 |

---

## 目录结构（栈 B · 已落地）

```text
/
├── index.html                 # 选端页（唯一允许的根 HTML）
├── web/                       # 管理端页面
│   ├── login.html
│   ├── workbench.html
│   ├── rectify.html
│   ├── ledger.html            # 跳转 ledger-street
│   ├── ledger-street.html     # 街道台账
│   ├── ledger-survey.html     # 街道排查汇总
│   ├── org-*.html
│   └── sys-*.html
├── miniapp/                   # 小程序 H5（手机壳内）
│   ├── login.html             # 登录（全屏背景 + v40 滑块）
│   ├── agreement.html / privacy.html
│   ├── todo.html              # 待办（筛选定稿）
│   ├── issue-detail.html      # 问题详情（查看 / 页内整改）
│   ├── issue-map.html         # 定位地图（距离）
│   ├── report.html / mine.html / mine-list.html / rectify.html（兼容跳转）
│   └── demo-phone.html        # 桌面壳（软跳转例外）
├── frontend/                  # 公共代码与壳资源
│   ├── assets/                # phone.png、demo 图等
│   ├── css/
│   │   ├── variables.css / layout.css / vben-shell.css / device-shell.css
│   │   └── pages/             # mobile.css、ledger-hub.css、rectify-hub.css…
│   ├── js/
│   │   ├── ledger-data.js / ledger-xlsx.js
│   │   ├── nav-config.js / vben-bridge.js
│   │   ├── vben/              # sidebar.js header.js footer.js layout.js
│   │   ├── data/issues-seed.js  # 排查清单种子（列表/详情共用）
│   │   ├── device-shell.js / mp-nav.js / mp-photos.js / icons.js / storage.js / seed.js / …
│   │   └── pages/             # m-login.js、m-todo.js、m-issue-map.js…
│   └── libs/
│       ├── echarts/           # ECharts（工作台图表）
│       ├── fluid-bg/
│       └── maplibre/          # MapLibre GL（自 20260707LINK 复制）
├── media/                     # 媒体素材库（与 frontend 平级）
│   ├── favicon.png            # 站点图标 + 双端登录 logo
│   ├── background.png         # 小程序登录全屏背景
│   ├── login.png              # 管理端登录全屏背景
│   └── captcha-bg.jpg         # 点选验证底图（当前未用，可复用）
├── AGENTS.md
├── 开发规范.md
├── 启动.command / 启动.bat
└── …
```

localStorage 键前缀：**`hsf:`**。演示账号：**`admin` / `123456`**。

---

## 数据与演示约定

- 唯一读写入口：`AppStorage`；禁止页面直接 `localStorage.*`
- 种子数据：组织树、工作人员、清单见 `frontend/js/data/issues-seed.js`（当前旗标 `seeded-v13`；变更结构时 bump 旗标或 `AppSeed.reset()`）
- 地图（栈 B 外链例外）：本地样式优先高德栅格 `street-gaode.json`，备用 Carto / Esri；引擎 `frontend/libs/maplibre/`（自 20260707LINK）；不用 OpenFreeMap；软跳转补载 maplibre 库脚本
- 不做跨浏览器账号同步；清缓存即重置属预期
- 对客界面禁止「演示 / Demo / 假数据」等文案（规范 §6.3.9）；联调说明只写本文件或注释

---

## 本地启动（栈 B）

```bash
# 推荐：双击 启动.command / 启动.bat（端口自 5501 起顺延）
# 或
python3 -m http.server 5501 -d .
```

日志可选落 `.logs/frontend.log`。

---

## 更新本文件的检查清单

收工前确认（**缺一项即未完成**）：

- [ ] 「最后核对」日期与一句话已更新
- [ ] 技术栈档位仍为栈 B；未误加 backend / api.js
- [ ] 入口、路由、壳路径、存储键、外链例外、`media/` 素材变更已写入
- [ ] 小程序新页：`data-mp-status` / `data-mp-title` / `data-mp-back`；跳转走 `HSFNav`；待办主界面勿再叠蓝 `m-hd`
- [ ] 管理端 vben 壳：`HSF_BASE` / `HSF_VBEN_DEFAULT_TAG` / 脚本顺序 / 勿恢复内联侧栏
- [ ] 业务规则（闭环、组织、水印、导入）与上文一致
- [ ] 未把已否决方案加回（OpenFreeMap、上报示例图、`input capture` 冒充拍照、取景底栏假占位第三钮等）

**对照应急局项目习惯：改交互或结构的当轮对话里顺手改 AGENTS.md，不另开一轮、不等用户提醒。**
