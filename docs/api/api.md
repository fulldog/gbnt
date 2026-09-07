# API 接口清单

按当前 `apps/server` 路由与 DTO 重建。Base URL：`http://127.0.0.1:8080`。  
鉴权：`Authorization: Bearer <token>`（标注「公开」的除外）。  
滑动续期：剩余有效期进入窗口时响应头 `X-New-Token`、`X-Token-Expires-At`。  
统一信封：`{ code, data, message, cost_ms, trace_id }`，成功 `code === 0`。详见 [README.md](./README.md)。

Apifox：导入 [apifox/openapi.yaml](./apifox/openapi.yaml)。

---

## 公开

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 `{status:up}` |
| GET | `/api/auth/captcha` | 图形验证码 `{captcha_id,image_base64,expire_seconds}` |
| POST | `/api/auth/login` | `{username,password,captcha_id,captcha}` → JWT；`captcha.enabled=false` 可省略验证码 |
| POST | `/api/app/auth/slider/start` | `{slider_id,expire_seconds}` |
| POST | `/api/app/auth/slider/finish` | `{slider_id,duration_ms}` → `{pass_token,expire_seconds}` |
| POST | `/api/app/auth/login` | `{username,password,pass_token}`；`captcha.enabled=false` 可省略 `pass_token` |

## 鉴权（JWT，不做 RBAC）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/auth/me` | 当前用户（含 `org_id`、`role_id`、`is_super_admin`、`apis`；超管 `apis="*"`） |
| PUT | `/api/auth/password` | 本人改密：`old_password` / `new_password` / `confirm_password` |
| POST | `/api/auth/logout` | 当前 token `jti` 拉黑至过期 |

新密码规则：长度大于 8，仅 ASCII 字母和数字，须同时包含字母与数字，区分大小写。改密成功递增 `token_ver`，该用户全部旧 token 失效。

### RBAC

JWT 之后校验 `sys_apis` + `sys_role_apis`（`rbac.enabled=false` 则跳过）。超管：`sys_users.is_super_admin`（全库一名），bypass。同 `module` 下 `create/edit/delete/import/export` 隐含 `view`。`POST /api/attachments/images` 仅 JWT。**`/api/app/*` 仅 JWT，不入目录、不做 RBAC。**

---

## 附件

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/attachments/images` | multipart：`files`（或 `file`）；可选 `watermark`（省略/真打水印，`0` 原图）、`lat`/`lng`/`address`。返回 `data.list=[{file_id,url}]` |

排查图写入 `type_ext.checklist[].files`；整改图走 `rectify_list[].file_uuids`。Linux 无中文字体时水印失败，见 `upload.font`。

---

## 工作台 `web.workbench`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/workbench/stats` | `{total,new,pending,done,complete_rate,by_type}` |
| GET | `/api/workbench/trend` | query `range`：`week7`（默认）/`month1`/`halfyear`/`all` |
| GET | `/api/workbench/todos` | query `page`/`size`（size 1–100）；条目含 `assignee_user`、`org_path` |

---

## 专项整改 `web.rectify`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/issues` | 列表 query：`type`/`status`/`org_id`/`project_year`/`keyword`/`page`/`size`。`org_id>0` 含子树 |
| GET | `/api/issues/:id` | 详情：`type_ext` 含 `photos`；`rectify_records[].photos`、`quiz_type` |
| POST | `/api/issues` | 新增。`org_id` 必填且须存在。无问题 → `done`，有问题 → `new` |
| PUT | `/api/issues/:id` | 更新；`org_id=0` 不改组织；`assignee_user=0` 不改责任人 |
| DELETE | `/api/issues/:id` | 软删 |
| POST | `/api/issues/import` | `{rows:[IssueInput]}`，校验同新建 |
| GET | `/api/issues/options/orgs` | 组织候选（`id/name/type/parent_id/sort`） |
| GET | `/api/issues/options/reporters` | 上报人候选；query `org_id` 必填；`keyword`/`page`/`size`/`selected_id` |
| GET | `/api/issues/:id/assignee-options` | 既有问题同组织启用责任人候选；query 同上（无 `org_id`） |
| POST | `/api/issues/:id/rectify` | `{rectify_list:[{type,note,file_uuids}],expected_round?}` |
| POST | `/api/issues/:id/re-rectify` | `done` → `pending`；不删历史、不改 `assignee_user` |
| POST | `/api/issues/:id/reassign` | `{assignee_user}` 须启用用户；只改认领人（不校验组织） |

### 上报 `IssueInput`

新建必填：`type`（well/road/bridge/forest/transformer）、`project_year`（2020–2023）、`org_id`、`address`、`reporter_signature_file_id`、`report_user_id`、`type_ext`。`code`/`lat`/`lng` 选填。需整改时 `plan_date` 必填。

`assignee_user` **选填**（对应表字段 `issues.assignee_user`）：

- `0` 或省略：新建不写责任人；更新不改责任人。管理端可不传。
- 非 0：用户须存在且 `status=1`；`sys_users.org_id` 与当前表单 `org_id` 为同一节点，或一方是另一方的祖先/后代。否则 400「整改人不存在」/「整改人已停用」/「责任人不属于所选组织」。
- `POST /api/app/issues`：**服务端自动填充为当前登录用户 ID**（忽略客户端传入值），再走上述校验。前端无需传该字段。

`type_ext.checklist[]` 为 **QuizBool**：`{type,value,desc,mustImg,files}`。`mustImg=true` 时 `files` 须非空。缺项视为未答。导致需整改的答题须有 `desc`。正向题 `value=false` 为异常；负向题 `value=true` 为异常。

| type | checklist[].type | 其它 |
| --- | --- | --- |
| well | water_out, pipe_ok, wiring_ok, box_ok, cover_ok, transformer_ok（正向） | build_kind=new\|match；出水口/护筒损坏>0 亦需整改 |
| road | has_shoulder, has_ash（正向） | 长宽厚、林网存活 |
| bridge | needs_rectify（负向） | kind=bridge\|culvert\|gate |
| forest | broken_belt, dead_trees, pest（负向） | 存活率 0–100 |
| transformer | powered, device_ok, cabinet_ok（正向）；illegal_wire（负向） | voltage=10kv\|0.4kv |

### 整改覆盖判定

`Need` = 上报 checklist 中判定需整改的 QuizType（不含井口损坏等非题项）。`Covered` = 本轮历史记录 `quiz_type` ∪ 本次 `rectify_list.type`（允许同一 type 多行）。`Need ⊆ Covered` → `status=done`，否则 `pending`。`Need` 空则提交后 `done`。`rectify_list` 不能为空。成功时 `assignee_user` = 当前用户。`expected_round` 新客户端应传当前 `rectify_round`，不符则拒绝；省略仅兼容旧客户端。

管理端整改不校验认领互斥。重新整改要求仍有需整改类型。

---

## 台账

共用 query：`street_org_id`（0/省略=全部街道，非街道组织拒绝）、`date_from`/`date_to`（北京时间 YYYY-MM-DD，含当日）。

| 方法 | 路径 | 模块 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/ledger/street` | `web.ledger-street` | 按 `org_id`+`type` 分组 |
| GET | `/api/ledger/street/report` | `web.ledger-street` | 建设项目表 |
| GET | `/api/ledger/street/rows` | `web.ledger-street` | 拆分行 |
| GET | `/api/ledger/street/statistics` | `web.ledger-street` | 拆分统计 |
| GET | `/api/ledger/street/options/orgs` | `web.ledger-street` | 仅街道组织候选 |
| GET | `/api/ledger/survey` | `web.ledger-survey` | 按 `type` 汇总 |
| GET | `/api/ledger/survey/report` | `web.ledger-survey` | 村级排查表；未采集数量为 null |
| GET | `/api/ledger/survey/rows` | `web.ledger-survey` | 拆分行 |
| GET | `/api/ledger/survey/statistics` | `web.ledger-survey` | 拆分统计 |
| GET | `/api/ledger/survey/options/orgs` | `web.ledger-survey` | 仅街道组织候选 |

---

## 组织 `web.sys-org`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/sys/orgs` | 扁平列表（`type`：root/district/street/village） |
| POST | `/api/sys/orgs` | `{name,parent_id,sort?}`；`parent_id=0` 建根 |
| PUT | `/api/sys/orgs/:id` | `{name}` |
| DELETE | `/api/sys/orgs/:id` | 根不可删；有下级拒绝 |

---

## 人员 `web.sys-staff`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/sys/users` | query：`org_id`/`keyword`/`page`/`size`（`org_id` 精确匹配） |
| GET | `/api/sys/users/by-org` | query：`org_id`；该行政区划用户列表 |
| POST | `/api/sys/users` | `{username,password?,name,phone,org_id,role_id,status?}`；密码空则=账号（不套复杂度）；有值则同改密规则 |
| PUT | `/api/sys/users/:id` | 超管用户不可编辑；密码空不改 |
| DELETE | `/api/sys/users/:id` | 超管不可删 |
| POST | `/api/sys/users/:id/reset-password` | 密码重置为账号，递增 `token_ver` |
| GET | `/api/sys/users/export` | 下载 xlsx（筛选同列表、不分页） |
| POST | `/api/sys/users/import` | multipart `file`（xlsx），仅新增 |

手机号选填；有值须为中国大陆 11 位（`1[3-9]` 开头）。

### 导入导出表头

列名：姓名、手机号、登录账号、所属单位、角色名称、状态、创建时间。

- **导出**：所属单位为组织路径根→叶，`/` 分隔；角色名为 `role_id` 反查；状态 `启用`/`停用`；时间 `2006-01-02 15:04:05`。
- **导入**：按列名识别。必有前五列；状态、创建时间可缺。无状态或空 → 启用；无时间或空 → 当前时间。所属单位按 `/` 拆段，叶名匹配，重名则沿上级递推至唯一。角色名精确匹配且须唯一。仅新增；任一登录账号已存在则整批失败。密码=登录账号。

---

## 角色 `web.sys-roles`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/sys/roles` | 列表 |
| POST | `/api/sys/roles` | `{name,desc,status}` |
| PUT | `/api/sys/roles/:id` | `id=1` 系统角色不可改 |
| DELETE | `/api/sys/roles/:id` | 超管角色不可删；仍有用户绑定拒绝 |
| GET | `/api/sys/roles/:id/apis` | 授权 API id；超管角色 `api_ids="*"` |
| PUT | `/api/sys/roles/:id/apis` | `{api_ids:[]}` |
| GET | `/api/sys/apis` | API 目录 |

---

## 操作日志 `web.sys-logs`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/sys/op-logs` | query：`keyword`/`page`/`size` |

---

## 小程序 `/api/app`

JWT 与管理端同一套。改密/退出复用管理端 handler。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/app/auth/me` | 当前用户（含组织/角色展示字段） |
| PUT | `/api/app/auth/password` | 同改密 |
| POST | `/api/app/auth/logout` | 同退出 |
| GET | `/api/app/todos` | 待办。`status` 空/`all` 查全部，排序 new>pending>done。权限：登录用户组织子树（`OrgID=0` 不限）∩ query `org_id` 子树 |
| GET | `/api/app/regions` | 组织树（`children`） |
| GET | `/api/app/issues/:id` | 详情 |
| POST | `/api/app/issues` | 上报，规则同管理端新建；`report_user_id` 与 `assignee_user` 均覆盖为当前用户 |
| POST | `/api/app/issues/:id/rectify` | 分项整改；认领互斥 |
| POST | `/api/app/issues/:id/re-rectify` | 重新整改；认领互斥 |
| GET | `/api/app/mine/stats` | `{reported,pending,done}` |
| GET | `/api/app/mine/issues` | query：`scope=reported\|pending\|done` + page/size |

### App 认领互斥

`assignee_user>0` 且 ≠ 当前用户 → 400「该问题已由他人认领整改」。

### 我的 scope

| scope | 含义 |
| --- | --- |
| reported | `created_id` = 当前用户 |
| pending | status=`new`，且本人上报或 `assignee_user` = 当前用户 |
| done | status=`done`，且本人上报或 `assignee_user` = 当前用户 |
