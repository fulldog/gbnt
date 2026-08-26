# API 接口清单

Base URL：`http://127.0.0.1:8080`  
鉴权：`Authorization: Bearer <token>`（标注「公开」的除外）。  
滑动续期：剩余有效期进入窗口时响应头带回 `X-New-Token`、`X-Token-Expires-At`，前端应替换本地 token。  
退出：`POST /api/auth/logout`（或 app 镜像）将当前 token `jti` 拉黑；改密/重置密码会递增 `token_ver`，旧 token 全部失效。

统一响应见 [README.md](./README.md) §3.1。

---

## 公开

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| GET | `/api/auth/captcha` | 图形验证码，返回 `{captcha_id,image_base64,expire_seconds}` |
| POST | `/api/auth/login` | 登录，body: `{username,password,captcha_id,captcha}`（`captcha.enabled=false` 时可省略验证码） |

## 鉴权

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/auth/me` | 当前用户（含 `role_id`、`is_super_admin`、`apis`；超管 `apis` 为 `"*"`） |
| PUT | `/api/auth/password` | 本人改密（JWT，不做 RBAC） |
| POST | `/api/auth/logout` | 退出登录：当前 token 的 `jti` 入黑名单至过期（JWT，不做 RBAC） |

### `PUT /api/auth/password` 参数

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `old_password` | string | 是 | 原密码 |
| `new_password` | string | 是 | 新密码：6–14 位，须同时含字母与数字，仅字母数字，区分大小写 |
| `confirm_password` | string | 是 | 确认新密码，须与 `new_password` 一致 |

成功后递增 `token_ver`，该用户全部旧 token 失效。

### `GET /api/auth/me` 主要返回字段

| 字段 | 说明 |
| --- | --- |
| `id` / `username` / `name` / `phone` | 用户基本信息 |
| `org_id` / `role_id` | 组织、角色；可为 0 |
| `is_super_admin` | 是否超级管理员 |
| `apis` | 授权 API id 列表；超管为 `"*"` |

### RBAC 接口权限

JWT 通过后，受保护接口还需校验 `sys_apis` + `sys_role_apis`（`rbac.enabled=false` 时跳过）。

| 项 | 说明 |
| --- | --- |
| 超管 | `sys_users.is_super_admin=true`（全库仅一名，种子 id=1）；拥有全部 API（`apis="*"`）；不可编辑/删除，可改密与重置密码 |
| 管理员保护 | `sys_roles.id = 1` 角色记录不可删改（含 API 授权） |
| 角色状态 | `sys_roles.status`：`1` 启用 / `0` 禁用；禁用后该角色用户无法登录且 token 失效 |
| action 继承 | 同 `module` 下 `create/edit/delete/import/export` 均隐含 `view` |
| 登录即可 | `/api/auth/me`、`PUT /api/auth/password`、`POST /api/auth/logout`、`POST /api/attachments/images` 不做 RBAC |
| 小程序 | **`/api/app/*` 整段仅 JWT**，不入 `sys_apis`、不做 RBAC |

## 工作台

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/workbench/stats` | 上报/待整改/已整改/完成率/分类型 |

## 专项整改 Issues

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/issues` | 列表，query: type/status/`*_org_id`/project_year/street/village/keyword/page/size；status=`new`\|`pending`\|`done` |
| GET | `/api/issues/:id` | 详情（`type_ext` 内 `photos`、`rectify_records[].photos`） |
| POST | `/api/issues` | 新增；四级区划 ID + `type_ext.checklist`；无问题 → `done`，有问题 → `new` |
| PUT | `/api/issues/:id` | 更新（传 `type_ext` 时按问题类型校验 checklist） |
| DELETE | `/api/issues/:id` | 删除（软删） |
| POST | `/api/issues/:id/rectify` | 整改：仅 `needs_rectify` 且 status∈{`new`,`pending`}；写入 `issue_rectify_records` 后 → `done` |
| POST | `/api/issues/:id/re-rectify` | 重新整改：仅 `done` 且 `needs_rectify=true` → `pending` |
| POST | `/api/issues/import` | 批量导入 `{rows:[]}` |

## 台账

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/ledger/street` | 街道台账聚合，query: street/date_from/date_to |
| GET | `/api/ledger/survey` | 排查汇总 |

## 系统 · 组织

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/sys/orgs` | 扁平列表（含 `type`：`root`/`district`/`street`/`village`） |
| POST | `/api/sys/orgs` | 新增 `{name,parent_id,sort?}`；`parent_id=0` 建根（`root`）；否则按上级逐级推导 `district→street→village`；村下不可再增 |
| PUT | `/api/sys/orgs/:id` | 仅改名称 `{name}` |
| DELETE | `/api/sys/orgs/:id` | 删除（根不可删；有下级时拒绝） |

## 系统 · 人员

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/sys/users` | 列表，query: org_id/keyword/page/size |
| POST | `/api/sys/users` | 新增；`password` 空则初始化为账户名；不可创建超管 |
| PUT | `/api/sys/users/:id` | 更新（password 空则不改）；**超管用户不可编辑** |
| POST | `/api/sys/users/:id/reset-password` | 重置密码为账户名（username），并递增 `token_ver`（超管可用） |
| DELETE | `/api/sys/users/:id` | 删除；**超管用户不可删除** |

### `POST/PUT /api/sys/users` 参数（UserInput）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `username` | string | 登录账号（新建必填） |
| `password` | string | 明文密码；新建空则=账户名；更新空则不改 |
| `name` | string | 姓名 |
| `phone` | string | 手机号 |
| `org_id` | uint64 | 所属组织 ID |
| `role_id` | uint64 | 角色 ID |
| `status` | int | 1 启用 / 0 禁用；新建省略默认 1 |

## 系统 · 角色

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/sys/roles` | 列表（含 `status`） |
| POST | `/api/sys/roles` | 新增 `{name,desc,status}` |
| PUT | `/api/sys/roles/:id` | 更新（`:id=1` 不可编辑） |
| DELETE | `/api/sys/roles/:id` | 删除（`:id=1` 不可删；仍有用户绑定时拒绝） |
| GET | `/api/sys/roles/:id/apis` | 角色已授权 API id 列表（超管返回 `"*"`） |
| PUT | `/api/sys/roles/:id/apis` | 覆盖授权 `{api_ids:[1,2,3]}`（`:id=1` 不可编辑） |
| GET | `/api/sys/apis` | 全量 API 目录（供授权 UI） |

## 系统 · 操作日志

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/sys/op-logs` | 列表，query: keyword/page/size |

## 附件（独立）

当前仅实现**批量直传**一条 HTTP 接口；分片 init / chunk / complete、bind、download 等**未注册路由**（业务侧在提交 Issue 时由后台内部 `Bind` 关联，无需单独调 bind）。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/attachments/images` | 批量直传图片（multipart）；**登录即可**，不做 RBAC |

**静态访问**：落盘文件经 Gin 静态目录 **`GET /uploads/...`** 直接访问（非 `/api/attachments/*`）。

### `POST /api/attachments/images`

| 项 | 说明 |
| --- | --- |
| Content-Type | `multipart/form-data` |
| 文件字段 | `files`（多选）；无 `files` 时可退化为单字段 `file` |
| 水印开关 | `watermark`（可选）：`1`/`true`/`yes`/`on` 打水印；`0`/`false`/`no`/`off` 原图入库；**省略默认打水印** |
| 水印表单 | `lat`、`lng`、`address`（可选；仅 `watermark` 开启时烧入图）；**上报人姓名取当前登录用户**，不传 `user_name` |
| 限制 | jpg/png/gif/webp；单张 ≤ `upload.max_file_size`；**一次最多 20 张** |
| 响应 | `data.list = [{file_id, url}, ...]`；`url` 形如 `/uploads/2026/08/24/xxx_{user_id}_{ms}.jpg` |

### 业务附件字段

1. 先调 **`POST /api/attachments/images`**，收集返回的 **`file_id`**
2. 排查现场图：写入 `type_ext.checklist[].files`（`file_id` 数组），服务端校验存在后原样存进 **`type_ext` JSON**
3. 整改图：body **`file_uuids`**（历史字段名），落库 **`photo_file_ids` JSON 数组**
4. 查询：解码 JSON，按 `file_id` 查 `attachments`，`checklist` 各项增加 **`photos:[{file_id,url}]`**；`rectify_records[]` 每条带 **`photos`**；签名可选 **`reporter_signature`**
5. 不再使用 `att_id` / `photo_ref_uuid` / `attachment_ref_items`

### 上报 `IssueInput` / `type_ext`

新建核心：`type`、`project_year`（2020–2023）、四级区划 ID（至少一级）、`address`、`reporter_signature_file_id`、`type_ext`（`checklist[].files` 存现场图）。`code` 选填。

| 字段 | 说明 |
| --- | --- |
| `type` | well / road / bridge / forest / transformer |
| `project_year` | 2020–2023 |
| `root_org_id` / `district_org_id` / `street_org_id` / `village_org_id` | 四级区划，至少一级；子级有值则上级必填 |
| `code` | 设施编号（选填） |
| `address` | 定位地址（必填） |
| `lat` / `lng` | 经纬度 |
| `plan_date` | YYYY-MM-DD；需整改时必填 |
| `reporter_signature_file_id` | 排查电子签名 file_id |
| `type_ext` | 类型扩展（`checklist` 为 QuizBool 数组） |
| `status` | 仅更新用 |

**已从入参移除**（对齐 miniapp 上报向导）：`project_name`、`location_text`、`description`、`measures`、`reporter_name` / `reporter_phone`、`assignee_name` / `assignee_phone`。其中责任人列仍保留在 `issues` 表（接口不传，可空，后续由服务端填充）；其余字段已从表结构删除。

**区划**：`root_org_id` / `district_org_id` / `street_org_id` / `village_org_id`（可空，未填为 0）。至少填 1 个；填了子级则其全部上级必填；组织须存在且类型匹配，相邻级须父子关系。名称冗余写入 `street` / `village`。

**状态推导**：按 quiz 算 `needs_rectify`——无任何问题 → `needs_rectify=false`、`status=done`；有问题 → `true`、`status=new`。有问题时 `plan_date` 必填。

**QuizBool**（是/否题）：入参 `{type, value, desc, mustImg, files}`，放在 `type_ext.checklist` 数组中；回显另含 `photos`。缺项视为未答。导致需整改的答题须 `desc` 非空。`mustImg=true` 时 `files` 长度须 >0（与是否异常无关）。正向题（出水/路肩等）`value=false` 为异常；负向题（断带/私拉乱接/桥涵需整改）`value=true` 为异常。`type` 不得重复，且须属于当前问题类型允许的枚举。

| 问题 type | 扩展对象 | checklist[].type | 其它要点 |
| --- | --- | --- | --- |
| `well` | `WellExt` | `water_out` `pipe_ok` `wiring_ok` `box_ok` `cover_ok` `transformer_ok`（正向，均须出现） | `build_kind`=`new`\|`match`；出水口/护筒损坏 ≤ 总数；损坏>0 亦需整改 |
| `road` | `RoadExt` | `has_shoulder` `has_ash`（正向） | 长宽厚、林网存活数量 |
| `bridge` | `BridgeExt` | `needs_rectify`（负向） | `kind`=`bridge`\|`culvert`\|`gate` |
| `forest` | `ForestExt` | `broken_belt` `dead_trees` `pest`（负向） | 存活率 0–100 |
| `transformer` | `TransformerExt` | `powered` `device_ok` `cabinet_ok`（正向）；`illegal_wire`（负向） | `voltage`=`10kv`\|`0.4kv`；`model` 选填 |

各类型 `keeper_name` / `keeper_phone` 选填。`plan_date` 在顶层。

### 整改 / 重新整改

- **Rectify**：`status∈{new,pending}`；`done` → 400「已整改不可再提交，请先重新整改」。成功：插入 `issue_rectify_records`（`photo_file_ids` JSON），issue → `done`。
- **Re-rectify**：仅 `status==done` 且 `needs_rectify==true` → `pending`；不删历史记录。无问题上报（`needs_rectify=false`）不可调用。

### 图片水印

当表单 **`watermark` 未传或为真** 时，对 jpg/png/gif/webp **烧录**左下角取证水印；`watermark=0` 时落盘原图、不烧录：

1. 最上一行加粗 **地址** `address`
2. 黄竖条 + **度分秒** `lat/lng`
3. **时间** `YYYY年M月D日 HH:MM`（服务器本地时区）
4. **上报人** = JWT 当前用户姓名

Linux 需配置 `upload.font` 指向中文 ttf/otf/ttc；Windows 默认可探测微软雅黑。

### 上传配置（`upload`）

| 参数 | 生效 | 说明 |
| --- | --- | --- |
| `root` | 是 | 落盘根目录；静态访问 `GET /uploads/...` |
| `max_file_size` | 是 | 单张图片大小上限（字节） |
| `font` | 是 | 水印中文字体路径；空则自动探测 |
| `chunk_size` | **否** | **预留**；分片上传未实现，直传流程不读取 |

---

## 小程序 app API（`/api/app`）

面向 `demo/miniapp`：登录、待办、上报、整改、我的。JWT 与管理端同一套；附件**不**在 `/api/app` 下重复挂载，小程序先调 **`POST /api/attachments/images`** 拿 `file_id`，排查写入 `type_ext.checklist[].files`，整改 body 传 `file_uuids`。

白名单额外包含：`POST /api/app/auth/slider/start`、`POST /api/app/auth/slider/finish`、`POST /api/app/auth/login`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/app/auth/slider/start` | 开始滑动验证 → `{slider_id,expire_seconds}`（公开） |
| POST | `/api/app/auth/slider/finish` | 完成滑动，body: `{slider_id,duration_ms}` → `{pass_token,expire_seconds}`（公开；耗时须在配置区间内） |
| POST | `/api/app/auth/login` | 登录，body: `{username,password,pass_token}` → JWT（公开；`captcha.enabled=false` 时可省略 pass_token） |
| GET | `/api/app/auth/me` | 当前用户（含 `role_id`、`apis`） |
| PUT | `/api/app/auth/password` | 本人改密（同管理端） |
| POST | `/api/app/auth/logout` | 退出登录（同管理端） |
| GET | `/api/app/todos` | 待办；query: type/status/`*_org_id`/project_year/keyword/page/size；**未传 status 默认 `new`**；`status=all` 不限 |
| GET | `/api/app/regions` | 组织树（`parent_id` 嵌套 `children`） |
| GET | `/api/app/issues/:id` | 问题详情（含 lat/lng、`rectify_records`） |
| POST | `/api/app/issues` | 上报（规则同管理端；按 quiz 推导 `new`/`done`） |
| POST | `/api/app/issues/:id/rectify` | 页内整改 `{note, file_uuids}` |
| POST | `/api/app/issues/:id/re-rectify` | 重新整改（`done` → `pending`） |
| GET | `/api/app/mine/stats` | 概览：`{reported, pending, done}`（pending 对齐 status=`new`） |
| GET | `/api/app/mine/issues` | 清单；query: `scope=reported\|pending\|done` + page/size |

### 我的 scope 规则

| scope | 含义 |
| --- | --- |
| `reported` | `reporter_id` = 当前用户 |
| `pending` | 状态 **`new`（待整改）**，且本人上报或 `assignee_name` = 当前用户姓名 |
| `done` | 状态 done，且本人上报或整改责任人同名 |

Apifox：导入 [apifox/openapi.yaml](./apifox/openapi.yaml)（tag「小程序」）。
