# API 接口清单

Base URL：`http://127.0.0.1:8080`  
鉴权：`Authorization: Bearer <token>`（标注「公开」的除外）

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
| POST | `/api/issues` | 新增（`photo_uuids` 必填） |
| PUT | `/api/issues/:id` | 更新 |
| DELETE | `/api/issues/:id` | 删除 |
| POST | `/api/issues/:id/rectify` | 整改闭环 `{note, photo_uuids}` |
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
| GET | `/api/sys/roles/:code/perms` | 权限列表 |
| PUT | `/api/sys/roles/:code/perms` | 覆盖权限 `{perms:[]}` |

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
| GET | `/api/attachments/:uuid/status` | 进度 / missing_chunks |
| PUT | `/api/attachments/:uuid/chunks/:index` | 上传分片（body=二进制） |
| POST | `/api/attachments/:uuid/complete` | 合并完成 |
| GET | `/api/attachments/:uuid` | 元数据 |
| GET | `/api/attachments/:uuid/download` | 下载 |

Apifox：导入 [apifox/openapi.yaml](./apifox/openapi.yaml)。
