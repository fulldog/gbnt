# API 接口清单

Base URL：`http://127.0.0.1:8080`  
鉴权：`Authorization: Bearer <token>`（标注「公开」的除外）。  
滑动续期：剩余有效期进入窗口时响应头带回 `X-New-Token`、`X-Token-Expires-At`，前端应替换本地 token。

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
| GET | `/api/auth/me` | 当前用户（含 `role_id`、`apis`；超管 `apis` 为 `"*"`） |

### RBAC 接口权限

JWT 通过后，受保护接口还需校验 `sys_apis` + `sys_role_apis`（`rbac.enabled=false` 时跳过）。

| 项 | 说明 |
| --- | --- |
| 超管 | `sys_roles.id = 1`，拥有全部 API，不写 `sys_role_apis` |
| 管理员保护 | `role_id = 1` 不可删改（含 API 授权） |
| 角色状态 | `sys_roles.status`：`1` 启用 / `0` 禁用；禁用后该角色用户无法登录且 token 失效 |
| action 继承 | 同 `module` 下 `create/edit/delete/import/export` 均隐含 `view` |
| 登录即可 | `/api/auth/me`、`POST /api/attachments/images` 不做 RBAC |
| 小程序 | **`/api/app/*` 整段仅 JWT**，不入 `sys_apis`、不做 RBAC |

## 工作台

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/workbench/stats` | 上报/待整改/已整改/完成率/分类型 |

## 专项整改 Issues

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/issues` | 列表，query: type/status/street/village/keyword/page/size |
| GET | `/api/issues/:id` | 详情 |
| POST | `/api/issues` | 新增（对齐 report.html 必填；`file_uuids` → `photo_ref_uuid`；`type_ext` 按类型） |
| PUT | `/api/issues/:id` | 更新（传 `type_ext` 时按 type 校验；是/否为 boolean） |
| DELETE | `/api/issues/:id` | 删除（软删） |
| POST | `/api/issues/:id/rectify` | 整改闭环 `{note, file_uuids, rectify_photo_ref_uuid}` |
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
| POST | `/api/sys/users` | 新增 `{username,password,name,phone,org_id,role_id,status}` |
| PUT | `/api/sys/users/:id` | 更新（password 空则不改） |
| DELETE | `/api/sys/users/:id` | 删除 |

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
2. 业务 JSON 仍用字段名 **`file_uuids`**，值为上述 **`file_id` 列表**（历史命名，非分片 uuid）
3. 新建 Issue：`file_uuids` 必填 → 后台内部建关联组，落库 **`photo_ref_uuid`**（实为 `att_id`）
4. 修改 Issue：`photo_ref_uuid` 非空 = 附件不变；为空则须重新传 `file_uuids`
5. 整改：`file_uuids` / `rectify_photo_ref_uuid` 规则同上
6. 查询：返回 `photo_ref_uuid` + **`photos:[{file_id,url}]`**（整改同理 `rectify_photos`）

### 上报 `IssueInput` / `type_ext`

公共字段与 `demo/miniapp/report.html` 对齐。新建必填：`type`、`street`、`village`、`project_name`、`description`、定位（`address` 或 `location_text`）、`measures`、`plan_date`、`assignee_name`、`assignee_phone`、`file_uuids`（≥1）、`type_ext`。`code` 选填。

`type_ext` 随 `type` 使用不同对象；**是/否题为 JSON boolean**（`true`=是，`false`=否，未传视为未填）。

| type | 扩展对象 | 布尔字段 | 其它要点 |
| --- | --- | --- | --- |
| `well` | `WellExt` | `water_out` `pipe_ok` `wiring_ok` `box_ok` `cover_ok` | `build_kind`=`new`\|`match`；出水口/护筒损坏 ≤ 总数 |
| `road` | `RoadExt` | `has_shoulder` `has_ash` | 长宽厚、林网存活数量 |
| `bridge` | `BridgeExt` | — | `kind`=`bridge`\|`culvert`\|`gate` |
| `forest` | `ForestExt` | `broken_belt` `dead_trees` `pest` | 存活率 0–100 |
| `transformer` | `TransformerExt` | `powered` `device_ok` `cabinet_ok` `illegal_wire` | `voltage`=`10kv`\|`0.4kv`；`model` 选填 |

各类型 `keeper_name` / `keeper_phone` 选填。整改措施与计划日在顶层，不进 `type_ext`。

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

面向 `demo/miniapp`：登录、待办、上报、整改、我的。JWT 与管理端同一套；附件**不**在 `/api/app` 下重复挂载，小程序先调 **`POST /api/attachments/images`** 拿 `file_id`，再在业务 body 传 `file_uuids`。

白名单额外包含：`POST /api/app/auth/slider/start`、`POST /api/app/auth/slider/finish`、`POST /api/app/auth/login`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/app/auth/slider/start` | 开始滑动验证 → `{slider_id,expire_seconds}`（公开） |
| POST | `/api/app/auth/slider/finish` | 完成滑动，body: `{slider_id,duration_ms}` → `{pass_token,expire_seconds}`（公开；耗时须在配置区间内） |
| POST | `/api/app/auth/login` | 登录，body: `{username,password,pass_token}` → JWT（公开；`captcha.enabled=false` 时可省略 pass_token） |
| GET | `/api/app/auth/me` | 当前用户（含 `role_id`、`apis`） |
| GET | `/api/app/todos` | 待办列表；query: type/status/street/village/keyword/page/size；**未传 status 默认 pending**；`status=all` 不限 |
| GET | `/api/app/regions` | 组织树（`parent_id` 嵌套 `children`） |
| GET | `/api/app/issues/:id` | 问题详情（含 lat/lng，地图页复用） |
| POST | `/api/app/issues` | 上报（规则同管理端新建；提交即 pending） |
| POST | `/api/app/issues/:id/rectify` | 页内整改 `{note, file_uuids}` / `rectify_photo_ref_uuid` |
| GET | `/api/app/mine/stats` | 概览：`{reported, pending, done}` |
| GET | `/api/app/mine/issues` | 清单；query: `scope=reported\|pending\|done` + page/size |

### 我的 scope 规则

| scope | 含义 |
| --- | --- |
| `reported` | `reporter_id` = 当前用户 |
| `pending` | 状态 pending，且本人上报或 `assignee_name` = 当前用户姓名 |
| `done` | 状态 done，且本人上报或整改责任人同名 |

Apifox：导入 [apifox/openapi.yaml](./apifox/openapi.yaml)（tag「小程序」）。
