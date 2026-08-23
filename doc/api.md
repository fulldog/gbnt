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
| POST | `/api/auth/login` | 登录，body: `{username,password}` |

## 鉴权

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/auth/me` | 当前用户 |

## 工作台

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/workbench/stats` | 上报/待整改/已整改/完成率/分类型 |

## 专项整改 Issues

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/issues` | 列表，query: type/status/street/village/keyword/page/size |
| GET | `/api/issues/:id` | 详情 |
| POST | `/api/issues` | 新增（`file_uuids` 必填 → 落库 `photo_ref_uuid`） |
| PUT | `/api/issues/:id` | 更新 |
| DELETE | `/api/issues/:id` | 删除（软删） |
| POST | `/api/issues/:id/rectify` | 整改闭环 `{note, file_uuids}` |
| POST | `/api/issues/import` | 批量导入 `{rows:[]}` |

## 台账

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/ledger/street` | 街道台账聚合，query: street/date_from/date_to |
| GET | `/api/ledger/survey` | 排查汇总 |

## 系统 · 组织

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/sys/orgs` | 列表 |
| POST | `/api/sys/orgs` | 新增 |
| PUT | `/api/sys/orgs/:id` | 更新 |
| DELETE | `/api/sys/orgs/:id` | 删除（根 org-gov 不可删） |

## 系统 · 人员

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/sys/users` | 列表，query: org_id/keyword/page/size |
| POST | `/api/sys/users` | 新增 |
| PUT | `/api/sys/users/:id` | 更新 |
| DELETE | `/api/sys/users/:id` | 删除 |

## 系统 · 角色

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/sys/roles` | 列表 |
| POST | `/api/sys/roles` | 新增 |
| PUT | `/api/sys/roles/:id` | 更新 |
| DELETE | `/api/sys/roles/:id` | 删除 |
| GET | `/api/sys/roles/:id/perms` | 权限列表（`:id` 为角色 code，如 `admin`） |
| PUT | `/api/sys/roles/:id/perms` | 覆盖权限 `{perms:[]}`（`:id` 为角色 code） |

## 系统 · 字典

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/sys/dict/types` | 排查类型 |
| GET | `/api/sys/dict/fields` | 字段，query: type_code |
| GET | `/api/sys/dict/items` | 选项，query: field_id |
| POST | `/api/sys/dict/items` | 新增选项 |
| PUT | `/api/sys/dict/items/:id` | 更新 |
| DELETE | `/api/sys/dict/items/:id` | 删除 |

## 系统 · 操作日志

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/sys/op-logs` | 列表，query: keyword/page/size |

## 附件（独立）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/attachments/init` | 单文件 init → uuid |
| POST | `/api/attachments/batch-init` | 批量 init |
| POST | `/api/attachments/complete-batch` | 批量 complete，`data.list=[{uuid,url}]` |
| POST | `/api/attachments/bind` | `file_uuids` → `{ref_uuid, list}` |
| GET | `/api/attachments/refs/:ref_uuid` | 反查关联文件 list |
| GET | `/api/attachments/:uuid/status` | 进度 / missing_chunks |
| PUT | `/api/attachments/:uuid/chunks/:index` | 上传分片（body=二进制） |
| POST | `/api/attachments/:uuid/complete` | 合并完成，`data.list=[{uuid,url}]` |
| GET | `/api/attachments/:uuid` | 元数据 |
| GET | `/api/attachments/:uuid/download` | 下载 |

### 业务附件字段

- 新建 Issue：`file_uuids`（文件 uuid 列表）→ 落库 `photo_ref_uuid`
- 修改 Issue：`photo_ref_uuid` 非空=不变；为空则 `file_uuids` 重新关联
- 整改：`file_uuids` / `rectify_photo_ref_uuid` 同上
- 查询：返回 `photo_ref_uuid` + `photos:[{uuid,url}]`（整改同理 `rectify_photos`）

---

## 小程序 app API（`/api/app`）

面向 `demo/miniapp`：登录、待办、上报、整改、我的。JWT 与管理端同一套；附件**不**在 `/api/app` 下重复挂载，小程序直接调现有 `/api/attachments/*`（init / 分片 / complete → `file_uuids`）。

白名单额外包含：`POST /api/app/auth/login`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/app/auth/login` | 登录，body: `{username,password}` → JWT（公开） |
| GET | `/api/app/auth/me` | 当前用户 |
| GET | `/api/app/todos` | 待办列表；query: type/status/street/village/keyword/page/size；**未传 status 默认 pending**；`status=all` 不限 |
| GET | `/api/app/regions` | 行政区划树（街道→村/社区） |
| GET | `/api/app/issues/:id` | 问题详情（含 lat/lng，地图页复用） |
| POST | `/api/app/issues` | 上报（`file_uuids` → `photo_ref_uuid`；提交即 pending） |
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
