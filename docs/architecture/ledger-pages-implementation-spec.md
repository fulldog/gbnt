# 两页报表实施方案与代码示例

日期：2026-09-06。状态：S1–S3 本地实施完成，S4 自动化和本地模拟页面验收完成；Excel/WPS 打开、真实数据库容量验证及 S5 发布联调未完成。本文保留实施规格和示例，实际结果以[实施验收记录](./ledger-pages-implementation-record.md)为准。

上位方案：[街道台账与街道排查汇总整合方案](./ledger-pages-integration-plan.md)。本文件将其中的“四个 GET、前端组合、共用基础能力、独立权限与统计”细化为可执行规格，不增加资产编辑、数据补录或接口文档重建。

## 1. 实施约束与阶段出口

| 阶段 | 工作 | 必须满足的出口 |
| --- | --- | --- |
| S0 契约与样例 | 固定本文字段、JSON、错误与黄金数据 | 每个字段都有唯一供数方；预期结果由人工计算，不调用被测函数生成 |
| S1 后端＋前端 API | 新增四个路由、DTO、业务函数、权限登记及正式 TS 方法 | 后端专项测试与前端 API 契约测试通过；旧接口兼容 |
| S2 前端组合 | 纯合并函数、薄 composable、两页接入 | 无半份数据、无串请求、无假零；表格组件不退化 |
| S3 通用错误处理 | API 404 JSON、共享请求核心 HTTP 分类 | HTTP/业务 401、续期头、Trace ID、raw 下载回归通过 |
| S4 自动化与视觉 | 黄金数据、异常、权限、性能、表头与导出 | 业务预期、两页结构、真实导出内容均核对；记录性能数据 |
| S5 发布与联调 | 先后端、后前端 | 新接口真实认证调用、可核验样本、部署版本和结果留证 |

- 实施前重新检查 `git status`，当前已有多项其他任务的未提交修改，不能覆盖、还原或一并认领。
- 普通开发不修改 `prototypes/static-demo/`、`docs/api/`；本文示例不是发布到 Apifox 的 OpenAPI 文档。
- 本期全表读取、不增加分页、不自动重试、不引入缓存或跨请求快照。不允许静默截断结果；压力测试不能通过时先报告容量问题，再单独设计限制或分页。
- 本期不自动部署、操作真实数据库或 Git 提交；这类实际动作需要后续对应授权。

## 2. 文件级任务清单

下列路径相对仓库根目录 `/Users/qingshan/Documents/work/delete/work/gbnt`。

| 文件/目录 | 动作 |
| --- | --- |
| `apps/server/internal/service/ledger_report.go` | 提取公共过滤、组织解析和纯计算；旧 report 保留 JSON 兼容 |
| `apps/server/internal/service/ledger_report_parts.go`（新增） | 新查询规范化、分拆 DTO、四个供数函数；实现本文全部中文字段注释 |
| `apps/server/internal/handler/ledger_report.go` | 新增四个 handler；保留旧 handler，不使严格新参数规则意外改变旧契约 |
| `apps/server/internal/handler/ledger_street.go`、`ledger_survey.go` | 各登记 rows/statistics 两条路由 |
| `apps/server/internal/perm/api_ledger_street.go`、`api_ledger_survey.go` | 四条新接口映射原页面 view 权限 |
| `apps/server/main.go` 与新 `internal/handler/not_found.go` | 接入 API 专属未匹配路由处理；不绕过鉴权 |
| `apps/admin-web/src/api/ledger.ts` | 同步四个可调用方法，保留旧方法入口与原 HTTP 行为 |
| `apps/admin-web/src/api/ledger-report-types.ts` | 增加 Query/Part/BaseRow/StatisticsRow；保留组合后的旧表格行类型 |
| `apps/admin-web/src/api/ledger-report-response.ts` | 增加四个严格解码器及 query 解码；保留旧 report 解码器 |
| `apps/admin-web/src/utils/ledger-report-query.ts`（新增） | 管理端请求规范化；明确空日期与安全整数校验 |
| `apps/admin-web/src/utils/ledger-report-merge.ts`（新增） | query 对比、行键校验、关联、口径说明合并；无 Vue/UI/HTTP 依赖 |
| `apps/admin-web/src/composables/useLedgerReport.ts`（新增） | 包装已有 `useLatestQuery`，并行请求和一次性提交；不重写请求序号 |
| `apps/admin-web/src/views/ledger/StreetLedgerView.vue`、`SurveyLedgerView.vue` | 接入新数据流程；候选仍用各自 API |
| `apps/admin-web/src/components/ledger/`、`src/utils/ledger-export.ts` | 以复用和回归为主，不为接口拆分重做表头、固定列、全屏或导出 |
| `packages/api-client/src/core/client.ts` | 非 2xx 与非标准响应分类，保留生命周期钩子和 raw 语义 |
| `apps/server/internal/service/ledger_report_parts_test.go`（新增） | 规范化、分组、统计和新旧 report 等价测试 |
| `apps/server/internal/handler/ledger_report_test.go` | 四路由、非法参数、错误信封及两个模块权限测试 |
| `apps/admin-web/tests/ledger-report-api.test.ts` | 新增四个 API 契约用例，不能删除旧方法兼容测试 |
| `apps/admin-web/tests/ledger-report-merge.test.ts`、`ledger-report-loading.test.ts`（新增） | 错位、缺行、重复、筛选不符、并发及销毁后返回 |
| `apps/admin-web/tests/api-client-response.test.ts`（新增） | 通过现有 Vitest runner 回归共享请求核心 |
| 现有 `ledger-sheet`、`ledger-export`、`ledger-report-frame`、`table-ui` 测试 | 保留结构与导出断言，更新页面使用的 API mock |

只在管理后台内部复用报表业务类型，不移动到 `packages/api-client/src/shared/`；小程序只受共享请求核心改动影响。

## 3. 精确 HTTP 契约

### 3.1 四个入口和四个前端方法

| GET 路径 | TS 方法 | Go service 方法 | 权限 |
| --- | --- | --- | --- |
| `/api/ledger/street/rows` | `getStreetRows` | `LedgerStreetRows` | `web.ledger-street/view` |
| `/api/ledger/street/statistics` | `getStreetStatistics` | `LedgerStreetStatistics` | `web.ledger-street/view` |
| `/api/ledger/survey/rows` | `getSurveyRows` | `LedgerSurveyRows` | `web.ledger-survey/view` |
| `/api/ledger/survey/statistics` | `getSurveyStatistics` | `LedgerSurveyStatistics` | `web.ledger-survey/view` |

四个接口全部需要原管理端鉴权，不接受前端提交自行选择的权限模块。保留原 `/options/orgs` 两个入口及其权限，不新增一个权限含义不明的通用组织入口。

### 3.2 查询参数规范化

本期作出如下精确定义，四个新接口必须使用同一函数：

| 参数 | 输入规则 | `data.query` 输出 |
| --- | --- | --- |
| `street_org_id` | 未传、空字符串、`0` 表示全部；非空只接受十进制数字；上限 `9007199254740991`；非 0 必须存在且类型为 street | JSON number，默认 `0`；`003` 规范化为 `3` |
| `date_from` | 未传/空字符串表示无起点；其他必须是真实的 `YYYY-MM-DD` 日期 | JSON string，默认 `""` |
| `date_to` | 未传/空字符串表示无终点；其他必须是真实的 `YYYY-MM-DD` 日期 | JSON string，默认 `""` |

- 起点是北京时间当日零点（包含），终点是北京时间次日零点（不包含）。绑定 `time.Time`，不拼接裸日期 SQL。
- 允许只传一端；两端都有时起点不能晚于终点。不自动加默认年份或日期。
- 新接口拒绝重复同名参数、未知参数、负数、小数、科学计数、带符号 ID、空白包裹的非空值、字面量 `null`、非法日期，统一 HTTP/code 400。
- GET 没有 JSON body；TS 调用方不使用 `null` 表示查询条件。参数未传与 HTTP 中的字符串 `"null"` 不相同。
- 既有 handler 的 `ParseUint` 不足以实现上述规则；这些是新接口要增加的校验，不是声称现有代码已有能力。
- 请求 ID、返回 ID/计数应在 JS 安全整数范围内；历史落点 `org_id=0` 暂时保留兼容，不截断、不静默舍入超限值。异常存量数据应使查询明确失败并在后端记录原因。

### 3.3 返回结构与示例

成功始终 HTTP 200 / code 0。所有契约字段必须出现，不用 `omitempty` 隐去 `null` 或 `0`。`data.query` 必须包含三键；`rows`、`notes` 始终是数组，包括空结果。

街道基础行请求示例：

```http
GET /api/ledger/street/rows?street_org_id=3&date_from=2026-09-01&date_to=2026-09-05
Authorization: Bearer <登录凭证，不写入文档或日志>
```

成功响应示例（说明性测试数据，不是线上数据）：

```json
{
  "code": 0,
  "data": {
    "query": { "street_org_id": 3, "date_from": "2026-09-01", "date_to": "2026-09-05" },
    "rows": [{
      "row_key": "2023:4", "org_id": 4, "org_name": "测试新村",
      "street_org_id": 3, "street_name": "测试街道",
      "village_org_id": 4, "village_name": "测试新村", "natural_village": null,
      "project_year": 2023, "signer": null, "phone": null
    }],
    "notes": ["自然村、村级报表签字和电话尚未采集。"]
  },
  "message": "ok", "cost_ms": 8, "trace_id": "example-street-rows"
}
```

同一请求条件的统计响应：

```json
{
  "code": 0,
  "data": {
    "query": { "street_org_id": 3, "date_from": "2026-09-01", "date_to": "2026-09-05" },
    "rows": [{
      "row_key": "2023:4", "source_record_count": 6,
      "well_handover": null, "well_existing": null,
      "bridge_handover": null, "bridge_existing": null,
      "road_km": 1.75, "forest_handover": 100, "forest_existing": 0,
      "transformer_handover": null, "transformer_existing": null
    }],
    "notes": ["道路、林网为上报记录合计，未按资产去重。"]
  },
  "message": "ok", "cost_ms": 12, "trace_id": "example-street-statistics"
}
```

排查基础行响应 `data` 示例（外层仍是上面的完整信封）：

```json
{
  "query": { "street_org_id": 3, "date_from": "2026-09-01", "date_to": "2026-09-05" },
  "rows": [{
    "row_key": "0:4", "org_id": 4, "org_name": "测试新村",
    "street_org_id": 3, "street_name": "测试街道",
    "village_org_id": 4, "village_name": "测试新村", "natural_village": null,
    "contact_name": null, "contact_phone": null, "leader_sign": null
  }],
  "notes": ["村级联系人、电话及报表签字尚未采集。"]
}
```

排查统计响应 `data` 示例：

```json
{
  "query": { "street_org_id": 3, "date_from": "2026-09-01", "date_to": "2026-09-05" },
  "rows": [{
    "row_key": "0:4", "source_record_count": 7, "survey_done": null,
    "well_inspected": null, "well_normal": null,
    "well_problem_count": 2, "well_rectified_count": 1,
    "bridge_inspected": null, "bridge_problem_count": 0, "bridge_rectified_count": 0,
    "road_inspected": null, "road_problem_count": 0, "road_rectified_count": 0
  }],
  "notes": ["按当前有效排查记录统计，不是资产总量或历史整改次数。"]
}
```

合法空响应：

```json
{
  "code": 0,
  "data": { "query": { "street_org_id": 0, "date_from": "", "date_to": "" }, "rows": [], "notes": [] },
  "message": "ok", "cost_ms": 1, "trace_id": "example-empty"
}
```

错误信封：

```json
{ "code": 400, "data": null, "message": "date_from 必须为有效日期", "cost_ms": 1, "trace_id": "example-invalid-query" }
```

| 场景 | HTTP / code | 消息要求 |
| --- | --- | --- |
| 新接口参数无效 | 400 / 400 | 指出错误参数，不回退为全部查询 |
| 未登录或凭证失效 | 401 / 401 | 使用现有鉴权消息及钩子 |
| 无本页 view 权限 | 403 / 403 | 使用现有拒绝访问消息 |
| 登录后访问不存在的 API | 404 / 404 | `接口不存在，请检查请求路径或后端版本` |
| 数据库或数据契约异常 | 500 / 500 | `报表查询失败，请稍后重试`；详细 SQL/存量错误只记后端日志 |

NoRoute 仍经过鉴权，无凭证访问不存在 API 可以先得到 401。不能为了统一 404 绕过 JWT。

## 4. 字段与计算规则

### 4.1 基础行字典

所有字段必填；“可空”指值可以为 `null`，不是键可省略。

| 字段 | 类型 | 来源及规则 |
| --- | --- | --- |
| `row_key` | string | 服务端生成，非空；只在页面＋本轮查询中唯一 |
| `org_id` | 安全整数，>=0 | `issues.org_id` 实际落点，关联组织删除后仍保留 |
| `org_name` | string/null | 落点组织名称，缺失为 null |
| `street_org_id` / `street_name` | 安全整数/null、string/null | 沿组织祖先解析街道，无法解析为 null |
| `village_org_id` / `village_name` | 安全整数/null、string/null | 沿组织祖先解析村/社区，无法解析为 null |
| `natural_village` | null | 当前无自然村层级，不从地址猜测 |
| `project_year`（仅台账） | 安全整数/null | `issues.project_year`；0 转 null，正数保留 |
| `signer` / `phone`（仅台账） | null | 无村级台账采集来源，不挪用单条排查签名或用户电话 |
| `contact_name` / `contact_phone` / `leader_sign`（仅排查） | null | 无村级任命与签章来源，不任取上报人 |

当前 `LedgerReportLocation` 含 `source_record_count`，不能直接作为新基础行 DTO；必须提取不含计数的纯位置结构。不得借拆分之机放宽既有 `requireUncollected` 对固定 null 字段的校验。

### 4.2 统计行字典

| 字段 | 类型/单位 | 计算或空值规则 |
| --- | --- | --- |
| `row_key` | string | 与本页基础行键一致 |
| `source_record_count` | 安全整数，>=0；条 | 本分组所有上报类型的记录数，包括本表不展示的设施类型；不是资产数 |
| `road_km` | number/null；千米 | 台账内 road 的 `type_ext.length` 合计，按现有规则保留到四位小数 |
| `forest_handover` / `forest_existing` | number/null；株 | 台账内 forest 的 `handover_count` / `existing_count` 分别合计，保留当前 number 契约，不擅改成整数 |
| `well_handover` / `well_existing` | null | 未建资产基线 |
| `bridge_handover` / `bridge_existing` | null | 未采集资产移交/现有量 |
| `transformer_handover` / `transformer_existing` | null | 未采集资产移交/现有量 |
| `survey_done` | null | 未建立全量排查任务/资产基线 |
| `well_inspected` / `well_normal` / `bridge_inspected` / `road_inspected` | null | 没有唯一资产及全量状态基线，不用记录数推导 |
| `{well,bridge,road}_problem_count` | 安全整数/null；条 | 该类型当前有效清单确认异常的记录数 |
| `{well,bridge,road}_rectified_count` | 安全整数/null；条 | 上述异常记录中当前 `status=done` 的记录数 |

强制规则：

1. 道路/林网某指标无对应类型记录，或该指标任一记录缺失、负数、非数值、坏 JSON、非有限值：整个指标为 null，不能只加有效部分。其他独立指标按各自有效性计算。
2. 道路/林网合法 0 保留；沿用 `sumReportedMetric` 的四位小数规则，不在前端重新计算。
3. 排查无该类型记录时问题数/整改数为 `0/0`；该类型任一清单无法判定时两者均为 `null`，不能混成 `null/0`。
4. 正常排查直接 `done` 不计整改；多轮整改只看当前记录状态，不累加历史完成次数。已知值满足 `0 <= rectified <= problem`。
5. 同名组织不能合并；缺失组织不能被 inner join 丢弃；只从当前筛选的实际记录生成行。
6. 台账键为 `年份或0:org_id`；排查键为 `0:org_id`。台账按年份升序、街道 ID 升序（未知按0）、落点组织 ID 升序；排查按街道 ID、落点组织 ID 升序。统计顺序可不同，但键必须一一对应。

## 5. 后端实现要点与 Go 示例

以下是规定实现边界的核心片段，不是可以整段替换现有文件的补丁。完整实现已经写入对应源文件，后续修改仍须遵守前文契约并由测试验证。

### 5.1 DTO 与查询校验

放在 `internal/service/ledger_report_parts.go`，下面示例的包为 `service`：

```go
// LedgerAppliedQuery 是已校验且实际应用的筛选条件。
type LedgerAppliedQuery struct {
    StreetOrgID uint64 `json:"street_org_id"` // 0 表示全部；不超过 JS 安全整数上限
    DateFrom    string `json:"date_from"`     // 北京时间起日；空串表示无起点
    DateTo      string `json:"date_to"`       // 北京时间终日（包含）；空串表示无终点
}

// LedgerPartResult 是基础行/统计接口的统一 data，不替代外层 response.Body。
type LedgerPartResult[T any] struct {
    Query LedgerAppliedQuery `json:"query"` // 四接口统一规范化结果
    Rows  []T                `json:"rows"`  // 空时必须为 []，不得为 null
    Notes []string           `json:"notes"` // 本部分口径说明；无说明时为 []
}

// LedgerBaseLocation 不含统计数量，避免 source_record_count 被重复供数。
type LedgerBaseLocation struct {
    RowKey         string  `json:"row_key"`         // 页面内稳定行键
    OrgID          uint64  `json:"org_id"`          // 实际落点；缺失关联仍保留
    OrgName        *string `json:"org_name"`        // 无组织关联时为 null
    StreetOrgID    *uint64 `json:"street_org_id"`   // 沿祖先解析；未知为 null
    StreetName     *string `json:"street_name"`     // 街道名；未知为 null
    VillageOrgID   *uint64 `json:"village_org_id"`  // 沿祖先解析；未知为 null
    VillageName    *string `json:"village_name"`    // 村/社区名；未知为 null
    NaturalVillage *string `json:"natural_village"` // 当前未采集，固定 null
}

// LedgerStatisticIdentity 承载统计行身份和记录口径计数。
type LedgerStatisticIdentity struct {
    RowKey            string `json:"row_key"`             // 关联同页基础行
    SourceRecordCount int64  `json:"source_record_count"` // 当前分组全部类型的记录条数
}
```

在此基础上按第4节定义 `StreetLedgerBaseRow`、`StreetLedgerStatisticsRow`、`SurveyLedgerBaseRow`、`SurveyLedgerStatisticsRow`。基础行不得嵌入旧 `LedgerReportLocation`；统计行不得携带名称或年份去覆盖基础信息。旧 report 类型保留原 JSON，由公共构建函数组装，不改变旧调用方的结构。

下面是完整的新参数解析函数核心。它使用同包已有 `validateLedgerReportQuery` 与 `ErrLedgerReportArgument`，所需标准库为 `fmt`、`net/url`、`regexp`、`strconv`：

```go
const maxLedgerSafeInteger uint64 = 9007199254740991

var ledgerDecimalID = regexp.MustCompile(`^[0-9]+$`)

// ParseLedgerSplitQuery 只供四个新接口使用；无效输入不得扩大为全量查询。
func ParseLedgerSplitQuery(values url.Values) (LedgerReportQuery, error) {
    q := LedgerReportQuery{}
    allowed := map[string]bool{"street_org_id": true, "date_from": true, "date_to": true}
    for key, items := range values {
        if !allowed[key] || len(items) != 1 {
            return q, fmt.Errorf("%w：未知或重复参数 %s", ErrLedgerReportArgument, key)
        }
    }
    raw := values.Get("street_org_id")
    if raw != "" {
        if !ledgerDecimalID.MatchString(raw) {
            return q, fmt.Errorf("%w：street_org_id 必须为非负整数", ErrLedgerReportArgument)
        }
        id, err := strconv.ParseUint(raw, 10, 64)
        if err != nil || id > maxLedgerSafeInteger {
            return q, fmt.Errorf("%w：street_org_id 超出安全范围", ErrLedgerReportArgument)
        }
        q.StreetOrgID = id
    }
    q.DateFrom, q.DateTo = values.Get("date_from"), values.Get("date_to")
    if err := validateLedgerReportQuery(q); err != nil {
        return q, err
    }
    return q, nil
}
```

四个 service 入口还要再次检查传入 `StreetOrgID` 上限并复用日期校验，避免非 HTTP 调用绕过校验。组织存在性/类型由服务端查询验证；返回的 ID、计数安全范围也要在构建 DTO 时验证。

HTTP handler 使用 `url.ParseQuery(c.Request.URL.RawQuery)` 并处理解析错误后再调用此函数，不只使用 `URL.Query()`，避免畸形百分号编码被丢弃后意外成为无筛选查询。

### 5.2 数据查询与组装

实现四个 service 方法时固定以下顺序：

1. 校验查询，加载必要组织信息，验证所选街道。
2. 通过同一个过滤 builder 应用组织子树、日期及 GORM 软删除作用域。
3. 基础行路径只读取 `org_id/project_year` 等分组必要列，或等价去重分组结果，不读 `type_ext`、不计算所有指标再裁剪。
4. 统计路径读取 `id/org_id/project_year/type/status/type_ext`，使用公共分组与纯统计函数，单次批量处理全部分组。
5. 四个结果均初始化 `Rows: make([]T, 0)`、`Notes: []string{}`，构建实际 `Query`。

公共过滤函数必须接收当前 `context.Context`，不得缓存或复用可变 GORM 查询对象跨请求。旧 `/report` 内部一次加载后组合公共基础/指标构建函数，不自调用两个新 HTTP 接口，不重做旧 `/street`、`/survey` 的普通聚合契约。

本期不增加自动组织数据隔离规则；原模块 view 鉴权继续保留。不能将当前显式街道过滤描述成已经按用户所属组织自动隔离。

### 5.3 handler、路由和权限

`handler` 包中的一个新 handler 示例；对应三个 handler 使用各自 service 方法，均使用同一个新 query 读取函数：

```go
// LedgerStreetRows GET /api/ledger/street/rows — 只读基础行，沿用街道台账 view 权限。
func (d *Deps) LedgerStreetRows(c *gin.Context) {
    values, err := url.ParseQuery(c.Request.URL.RawQuery)
    if err != nil {
        response.Fail(c, 400, response.CodeBadReq, "查询参数编码无效")
        return
    }
    q, err := service.ParseLedgerSplitQuery(values)
    if err != nil {
        ledgerReportFailure(c, err)
        return
    }
    result, err := d.Issue.LedgerStreetRows(c.Request.Context(), q)
    if err != nil {
        ledgerReportFailure(c, err)
        return
    }
    response.OK(c, result)
}
```

在两个既有 `registerLedger*` 中分别追加，而不是替换原路由：

```go
api.GET("/ledger/street/rows", d.LedgerStreetRows)
api.GET("/ledger/street/statistics", d.LedgerStreetStatistics)
api.GET("/ledger/survey/rows", d.LedgerSurveyRows)
api.GET("/ledger/survey/statistics", d.LedgerSurveyStatistics)
```

前两条归 street 注册函数，后两条归 survey 注册函数。权限目录对应条目格式：

```go
// 街道台账新增只读供数入口，不新增编辑动作。
{Method: "GET", Path: "/api/ledger/street/rows", Name: "街道台账基础行", Module: "web.ledger-street", Action: "view", Sort: 11},
{Method: "GET", Path: "/api/ledger/street/statistics", Name: "街道台账统计", Module: "web.ledger-street", Action: "view", Sort: 11},
// 排查汇总新增入口保留独立页面权限。
{Method: "GET", Path: "/api/ledger/survey/rows", Name: "排查汇总基础行", Module: "web.ledger-survey", Action: "view", Sort: 12},
{Method: "GET", Path: "/api/ledger/survey/statistics", Name: "排查汇总统计", Module: "web.ledger-survey", Action: "view", Sort: 12},
```

这是两个现有 `[]Entry` 的追加片段，不是独立 Go 文件。已有对应模块 view 的角色无需逐条重新授予新 API ID，但运行环境的 `sys_apis` 和内存路由索引必须同步。

## 6. TypeScript 契约与 API 方法

### 6.1 类型

下面添加到已有 `ledger-report-types.ts`。其前置类型 `LedgerReportLocation`、`StreetLedgerReportRow`、`SurveyLedgerReportRow` 是当前仓库已存在的完整表格行类型；保留它们供旧 report 和 Sheet 使用。

```ts
export interface LedgerSplitQuery {
  street_org_id?: number;
  date_from?: string;
  date_to?: string;
}

export interface LedgerAppliedQuery {
  street_org_id: number;
  date_from: string;
  date_to: string;
}

export interface LedgerPart<T> {
  query: LedgerAppliedQuery;
  rows: T[];
  notes: string[];
}

export type LedgerBaseLocation = Omit<LedgerReportLocation, "source_record_count">;
export type StreetBaseRow = LedgerBaseLocation
  & Pick<StreetLedgerReportRow, "project_year" | "signer" | "phone">;
export type SurveyBaseRow = LedgerBaseLocation
  & Pick<SurveyLedgerReportRow, "contact_name" | "contact_phone" | "leader_sign">;

export type StreetStatisticsRow = Pick<StreetLedgerReportRow,
  "row_key" | "source_record_count" | "well_handover" | "well_existing"
  | "bridge_handover" | "bridge_existing" | "road_km"
  | "forest_handover" | "forest_existing"
  | "transformer_handover" | "transformer_existing">;

export type SurveyStatisticsRow = Pick<SurveyLedgerReportRow,
  "row_key" | "source_record_count" | "survey_done"
  | "well_inspected" | "well_normal" | "well_problem_count" | "well_rectified_count"
  | "bridge_inspected" | "bridge_problem_count" | "bridge_rectified_count"
  | "road_inspected" | "road_problem_count" | "road_rectified_count">;
```

### 6.2 请求规范化与响应解码

`src/utils/ledger-report-query.ts` 示例，规范化函数也用于比较服务端回显，但响应解码必须先检查三键均存在，不能把响应缺字段当默认值：

```ts
import type { LedgerAppliedQuery, LedgerSplitQuery } from "@/api/ledger-report-types";

export function normalizeLedgerQuery(query: LedgerSplitQuery): LedgerAppliedQuery {
  const streetId = query.street_org_id === undefined ? 0 : query.street_org_id;
  if (!Number.isSafeInteger(streetId) || streetId < 0) {
    throw new Error("street_org_id 必须为安全非负整数");
  }
  function date(value: string | undefined, label: string): string {
    if (value === undefined || value === "") return "";
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new Error(`${label} 必须为有效日期`);
    }
    // 此处只验证日历日期；北京时间筛选边界仍由服务端构造。
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      throw new Error(`${label} 必须为有效日期`);
    }
    return value;
  }
  const from = date(query.date_from, "date_from");
  const to = date(query.date_to, "date_to");
  if (from && to && from > to) throw new Error("开始日期不能晚于结束日期");
  return { street_org_id: streetId, date_from: from, date_to: to };
}
```

四个新解码器分别命名 `normalizeStreetRowsPart`、`normalizeStreetStatisticsPart`、`normalizeSurveyRowsPart`、`normalizeSurveyStatisticsPart`，必须实际实现，不能 `as LedgerPart<T>` 直接通过：

- 复用 `responseRecord`、`responseArray`、`responseInteger` 和现有 nullable 校验。
- `query` 三键必填且类型精确，规范化后检查原返回值已是规范形式。
- 每行按字段白名单显式构建新对象，未知附加字段不进入页面模型；该供数方不拥有的字段不能通过 spread 偷渡覆盖另一部分。
- 基础行不得包含计数；统计解码只保留行键、计数和对应指标。合法 nullable 与固定 null 校验按第4节执行。
- `notes` 每项是字符串，数组不可为 null；计数关系校验沿用现有规则。
- 行键与 query 的跨响应关系由合并层继续检查，单接口类型断言不能代替关联校验。

### 6.3 四个正式 API 方法

以下追加到现有 `createLedgerApi(client)` 的返回对象；导入上面四个解码器和规范化函数：

```ts
async getStreetRows(query: LedgerSplitQuery = {}): Promise<LedgerPart<StreetBaseRow>> {
  const value = await client.request<unknown>("/api/ledger/street/rows", {
    query: { ...normalizeLedgerQuery(query) },
  });
  return normalizeStreetRowsPart(value);
},
async getStreetStatistics(query: LedgerSplitQuery = {}): Promise<LedgerPart<StreetStatisticsRow>> {
  const value = await client.request<unknown>("/api/ledger/street/statistics", {
    query: { ...normalizeLedgerQuery(query) },
  });
  return normalizeStreetStatisticsPart(value);
},
async getSurveyRows(query: LedgerSplitQuery = {}): Promise<LedgerPart<SurveyBaseRow>> {
  const value = await client.request<unknown>("/api/ledger/survey/rows", {
    query: { ...normalizeLedgerQuery(query) },
  });
  return normalizeSurveyRowsPart(value);
},
async getSurveyStatistics(query: LedgerSplitQuery = {}): Promise<LedgerPart<SurveyStatisticsRow>> {
  const value = await client.request<unknown>("/api/ledger/survey/statistics", {
    query: { ...normalizeLedgerQuery(query) },
  });
  return normalizeSurveyStatisticsPart(value);
},
```

这些是对象方法片段，不是独立 TS 模块。保留 `getStreetReport`、`getSurveyReport` 原 HTTP 路径和解码行为；新组合流程使用新函数名，不暗改旧方法含义。Axios 继续由现有 transport 注入，URL 仍由应用环境决定。

## 7. 前端组合与状态实现

### 7.1 纯合并函数

`src/utils/ledger-report-merge.ts` 核心示例：输入必须已经通过各自解码器，函数不做数值统计，也不负责 Toast。

```ts
import type { LedgerAppliedQuery, LedgerPart } from "@/api/ledger-report-types";

interface KeyedRow { row_key: string }

function sameQuery(a: LedgerAppliedQuery, b: LedgerAppliedQuery): boolean {
  return a.street_org_id === b.street_org_id
    && a.date_from === b.date_from && a.date_to === b.date_to;
}

function indexRows<T extends KeyedRow>(rows: readonly T[]): Map<string, T> {
  const result = new Map<string, T>();
  for (const row of rows) {
    if (!row.row_key || result.has(row.row_key)) throw new Error("报表行键为空或重复");
    result.set(row.row_key, row);
  }
  return result;
}

export function mergeLedgerParts<B extends KeyedRow, S extends KeyedRow, R>(
  expectedQuery: LedgerAppliedQuery,
  base: LedgerPart<B>,
  statistics: LedgerPart<S>,
  compose: (base: B, statistics: S) => R,
): LedgerPart<R> {
  if (!sameQuery(expectedQuery, base.query) || !sameQuery(expectedQuery, statistics.query)) {
    throw new Error("报表筛选条件不一致，请重新查询");
  }
  const baseIndex = indexRows(base.rows);
  const statisticsIndex = indexRows(statistics.rows);
  if (baseIndex.size !== statisticsIndex.size
    || [...baseIndex.keys()].some((key) => !statisticsIndex.has(key))) {
    throw new Error("报表基础行与统计行不匹配，请重新查询");
  }
  return {
    query: { ...expectedQuery },
    rows: base.rows.map((row) => compose(row, statisticsIndex.get(row.row_key)!)),
    notes: [...new Set([...base.notes, ...statistics.notes])],
  };
}
```

此处非空断言仅在键集合完全校验后使用；禁止在未检查集合时断言后补零。两份数组都空时合法；基础为空、统计非空仍然失败。基础行顺序是输出顺序，不按统计返回顺序拼接。

两个具体 compose 函数分别按字段白名单构建 `StreetLedgerReportRow`、`SurveyLedgerReportRow`。即使解码器已经丢弃额外字段，也不直接用任意原始对象 `{ ...base, ...statistics }` 代替字段归属规则。台账 compose 的核心应显式列出：

```ts
export function composeStreetRow(
  base: StreetBaseRow, statistics: StreetStatisticsRow,
): StreetLedgerReportRow {
  return {
    row_key: base.row_key, org_id: base.org_id, org_name: base.org_name,
    street_org_id: base.street_org_id, street_name: base.street_name,
    village_org_id: base.village_org_id, village_name: base.village_name,
    natural_village: base.natural_village, project_year: base.project_year,
    signer: base.signer, phone: base.phone,
    source_record_count: statistics.source_record_count,
    well_handover: statistics.well_handover, well_existing: statistics.well_existing,
    bridge_handover: statistics.bridge_handover, bridge_existing: statistics.bridge_existing,
    road_km: statistics.road_km,
    forest_handover: statistics.forest_handover, forest_existing: statistics.forest_existing,
    transformer_handover: statistics.transformer_handover,
    transformer_existing: statistics.transformer_existing,
  };
}
```

排查 compose 同理逐项列出其指标，不把台账的移交/现有数塞进排查的已排查数。

### 7.2 复用 useLatestQuery 的薄封装

`src/composables/useLedgerReport.ts` 示例：

```ts
import type { LedgerAppliedQuery, LedgerPart, LedgerSplitQuery } from "@/api/ledger-report-types";
import { useLatestQuery } from "@/composables/useLatestQuery";
import { normalizeLedgerQuery } from "@/utils/ledger-report-query";
import { mergeLedgerParts } from "@/utils/ledger-report-merge";

interface LedgerLoaders<B extends { row_key: string }, S extends { row_key: string }, R> {
  readQuery: () => LedgerSplitQuery;
  loadRows: (query: LedgerAppliedQuery) => Promise<LedgerPart<B>>;
  loadStatistics: (query: LedgerAppliedQuery) => Promise<LedgerPart<S>>;
  compose: (base: B, statistics: S) => R;
  errorMessage: string;
}

export function useLedgerReport<B extends { row_key: string }, S extends { row_key: string }, R>(
  options: LedgerLoaders<B, S, R>,
) {
  return useLatestQuery<LedgerPart<R> | null>({
    initial: () => null,
    errorMessage: options.errorMessage,
    load: async () => {
      // await 前冻结本轮参数，不在请求回来后重读响应式筛选。
      const query = normalizeLedgerQuery({ ...options.readQuery() });
      const [base, statistics] = await Promise.all([
        options.loadRows({ ...query }),
        options.loadStatistics({ ...query }),
      ]);
      return mergeLedgerParts(query, base, statistics, options.compose);
    },
  });
}
```

`useLatestQuery` 已负责开始加载清旧数据、请求序号、失败状态和销毁后失效。首期保留“失效结果不提交”策略，不承诺实际取消底层网络请求，不为此新增共享 transport 的取消协议。

页面接入台账的 `<script setup lang="ts">` 片段如下；其依赖的 `api`、筛选 ref、`composeStreetRow` 和 Vue/composable 导入由页面正常声明：

```ts
const { data: report, loading, loadError, hasLoaded, run: load } = useLedgerReport({
  readQuery: () => ({
    street_org_id: streetOrgId.value,
    date_from: dateRange.value?.[0], date_to: dateRange.value?.[1],
  }),
  loadRows: api.ledger.getStreetRows,
  loadStatistics: api.ledger.getStreetStatistics,
  compose: composeStreetRow,
  errorMessage: "街道台账加载失败",
});
const rows = computed(() => report.value?.rows ?? []);
const canExport = computed(() => hasLoaded.value && !loading.value
  && !loadError.value && rows.value.length > 0);
```

页面将 `!canExport` 传给现有外框的 `export-disabled`，仍保留导出 handler 内的二次状态检查，避免直接调用事件时绕过按钮状态。排查页使用其三个对应函数；街道候选继续独立用各自的 `list*OrgOptions`。

新组合结果使用 `report.query.street_org_id`，不能继续读取旧 `report.street_org_id`。标题、上报日期说明、导出文件名/内容均使用已成功提交的 query；日期说明须覆盖全空、仅起点、仅终点和双端四种情况。表单草稿修改但未查询时，可保持显示旧已提交结果，不能把旧数据标题改成新筛选。

### 7.3 加载状态验收

| 状态 | 表格 | 导出 | 动作 |
| --- | --- | --- | --- |
| 初始/加载 | 保留表头，清旧行，显示加载 | 禁用 | 两个请求使用同一参数副本 |
| 两份成功且匹配 | 一次性显示全部行、口径和已提交筛选 | 非空时可用 | 保持基础行顺序 |
| 两份均空 | 合法空态，仍保留表头/脚注 | 禁用 | 不请求旧 report 兜底 |
| 部分失败或不匹配 | 错误态，无旧行或半份数据 | 禁用 | 用户触发整组重试；首期不自动循环重试 |
| 切换筛选/销毁 | 仅最新且仍存活的请求可提交 | 由当前有效结果决定 | 不发过时成功提示、不覆写最新错误 |

## 8. 统一错误处理示例

### 8.1 Go 未匹配 API

新增 handler 并从 `main.go` 的现有鉴权链之后注册 `r.NoRoute(handler.APINotFound)`。所需导入 `strings`、`net/http`、`gin` 和项目 `response`：

```go
// APINotFound 为未匹配 API 输出标准信封，不为非 API 静态路径改变返回语义。
func APINotFound(c *gin.Context) {
    path := c.Request.URL.Path
    if path != "/api" && !strings.HasPrefix(path, "/api/") {
        c.String(http.StatusNotFound, "404 page not found")
        return
    }
    response.Fail(c, http.StatusNotFound, response.CodeNotFound,
        "接口不存在，请检查请求路径或后端版本")
    c.Abort()
}
```

已有 `response.Fail` 不会自动 Abort；需要中止中间件时必须明确处理。`/apifoo` 不是 API。鉴权失败已经终止的请求不应再次写入 404。代理/网关产生的 HTML 错误不一定经过此 handler，因此前端兜底仍然必需。

### 8.2 共享 core 顺序

修改现有 `handleApiResponse` 而不是让 Axios 提前抛出 HTTP 错误；保留 `validateStatus: () => true`。

```ts
export function handleApiResponse<TData>(
  response: TransportResponse<unknown>, hooks: ApiLifecycleHooks = {},
): TData {
  notifyTokenRenewal(response, hooks);
  if (response.status < 200 || response.status >= 300) {
    const error = errorFromResponse(response);
    notifyIfUnauthorized(error, hooks);
    throw error;
  }
  if (!isEnvelope(response.data)) {
    throw new ApiError("服务端响应不符合统一接口格式", {
      status: response.status,
      traceId: getResponseHeader(response.headers, "X-Request-Id"),
    });
  }
  if (response.data.code !== 0) {
    const error = errorFromResponse(response);
    notifyIfUnauthorized(error, hooks);
    throw error;
  }
  return response.data.data as TData;
}
```

本片段复用同文件已有类型/函数，不替换整个文件。同步修改 `errorFromResponse`：合法信封优先 `message/code/trace_id`；无合法消息时按状态映射 401、403、404、502、503、504，其余兜底 `HTTP n`。无 body Trace ID 时用大小写不敏感的 `X-Request-Id`。不将原始 HTML 回显到 Toast，不把所有 404 断言成“后端未部署”。

`handleRawResponse` 的成功响应原样保留 Blob/原始体；错误也可使用统一映射。Token 续期每次响应只处理一次，HTTP 401 与业务 code 401 都必须触发原钩子。

## 9. 独立黄金数据与自动化示例

### 9.1 固定数据 G1

仅为独立测试 fixture，不注入正式页面或线上库。组织：街道3下有村4；村4名称“测试新村”。所有记录均未删除且上报时间为 `2026-09-02 10:00:00+08:00`，查询范围为 2026-09-01 至 2026-09-05、街道3。

| 记录 | 落点 | 建设年 | 类型 | 数据/清单 | 状态 |
| --- | --- | --- | --- | --- | --- |
| A1 | 4 | 2023 | road | length=1.25，完整正常清单 | done |
| A2 | 4 | 2023 | road | length=0.5，完整正常清单 | done |
| A3 | 4 | 2023 | forest | handover_count=100，existing_count=0 | done |
| A4 | 4 | 2023 | well | 完整异常清单 | done |
| A5 | 4 | 2023 | well | 完整异常清单 | new |
| A6 | 4 | 2023 | well | 完整正常清单 | done |
| A7 | 4 | 2024 | road | length=2，完整正常清单 | done |

清单用当前服务测试里的 `reportChecklist`/`checklistSpecsFor` 构造完整题目，well 补齐出水口/护筒字段；不得用 `{}` 或空数组代表正常。道路同时保留 length 和正常清单字段。

人工预期（必须写死为测试值，不从被测统计函数计算）：

| 页面/行键 | 来源记录数 | 道路 km | 林网移交/现有 | 机井问题/整改 | 桥、道路问题/整改 |
| --- | --- | --- | --- | --- | --- |
| 台账 `2023:4` | 6 | 1.75 | 100 / 0 | 不属于该页指标 | 不属于该页指标 |
| 台账 `2024:4` | 1 | 2 | null / null | 不属于该页指标 | 不属于该页指标 |
| 排查 `0:4` | 7 | 不属于该页指标 | 不属于该页指标 | 2 / 1 | 桥 0/0；道路 0/0 |

所有固定未采集字段为 null。台账两行，排查一行；不能先按建设年分开后漏掉另一年的排查记录。

独立变体各自基于 G1 重建，不串联污染：

- G2：A2 length 改为 null，台账 `2023:4.road_km=null`，不能部分合计 1.25；A1/A2 清单不变，排查道路仍 0/0。
- G3：A5 清单缺题，排查井问题/整改都为 null，不是 1/1 或 null/1。
- G4：在街道3下追加组织5，与组织4同名但不同 ID；同时追加一条筛选范围内的组织5记录：建设年2023、road、length=3、完整正常清单、done。台账新增 `2023:5`（记录数1、道路3），排查新增 `0:5`（记录数1、道路问题/整改0/0），不得与组织4合并。只新增组织而没有记录时，不应新增报表行。
- G5：追加年份0、org_id=999、well、完整异常清单、new 的记录，上报时间同 G1，组织999不存在；本变体明确将查询改为 `street_org_id=0`、日期范围不变。台账保留 `0:999`，年份/组织名称为 null，来源记录数1、道路/林网指标null；排查也保留 `0:999`，来源记录数1、井问题/整改1/0、桥和道路问题/整改0/0。另用 `street_org_id=3` 查询时，未知组织不属于已知街道子树，应排除此记录；不能为了保留未知关联而绕过街道筛选。
- G6：无任何记录，两页的基础/统计均空；不能生成全组织的零行。
- G7：添加边界记录，2026-09-01 00:00:00+08:00 计入，2026-09-06 00:00:00+08:00 不计入；软删除记录不计入。

### 9.2 可落地的合并单测示例

放入新增 `tests/ledger-report-merge.test.ts`。这个最小用例验证关联规则，不替代 G1 的完整业务字段测试：

```ts
import { describe, expect, it } from "vitest";
import { mergeLedgerParts } from "@/utils/ledger-report-merge";

describe("报表行关联", () => {
  const query = { street_org_id: 3, date_from: "", date_to: "" };
  const base = {
    query,
    rows: [{ row_key: "2023:4", org_id: 4 }, { row_key: "2024:4", org_id: 4 }],
    notes: ["基础说明"],
  };
  const stats = {
    query,
    rows: [{ row_key: "2024:4", road_km: 0 }, { row_key: "2023:4", road_km: null }],
    notes: ["统计说明"],
  };
  const compose = (b: typeof base.rows[number], s: typeof stats.rows[number]) => ({
    row_key: b.row_key, org_id: b.org_id, road_km: s.road_km,
  });

  it("按键关联且保留基础行顺序、null 和 0", () => {
    expect(mergeLedgerParts(query, base, stats, compose).rows).toEqual([
      { row_key: "2023:4", org_id: 4, road_km: null },
      { row_key: "2024:4", org_id: 4, road_km: 0 },
    ]);
  });
  it("缺少统计行不得补零", () => {
    expect(() => mergeLedgerParts(query, base, { ...stats, rows: stats.rows.slice(0, 1) }, compose))
      .toThrow("不匹配");
  });
  it("相同条数但包含额外/缺失键仍失败", () => {
    const wrong = { ...stats, rows: [stats.rows[0]!, { row_key: "2025:4", road_km: 1 }] };
    expect(() => mergeLedgerParts(query, base, wrong, compose)).toThrow("不匹配");
  });
  it("重复键不得被 Map 静默覆盖", () => {
    const repeated = { ...stats, rows: [stats.rows[0]!, stats.rows[0]!] };
    expect(() => mergeLedgerParts(query, base, repeated, compose)).toThrow("重复");
  });
  it("后端回显筛选不一致则失败", () => {
    const wrong = { ...stats, query: { ...query, street_org_id: 9 } };
    expect(() => mergeLedgerParts(query, base, wrong, compose)).toThrow("筛选条件不一致");
  });
});
```

### 9.3 其余必测断言

| 类别 | 用例 |
| --- | --- |
| HTTP 参数 | 空值/0/003 规范化；负数、小数、科学计数、重复参数、未知参数、畸形编码、安全整数超限、非法日历日期、反向日期、非街道 ID |
| 响应解码 | 缺 query 键、字符串计数、undefined、NaN/Infinity、固定 null 被伪造、null 数组、坏 notes、越界计数 |
| 关联 | 两空合法、仅一份空非法、基础重复、统计重复、缺键、额外键、反序统计、名称含 HTML 按文本展示 |
| 并发状态 | A 先发后回/B 后发先回只显示 B；旧失败不能覆盖新成功；任一部分失败；销毁后完成不能提交；首期无自动重试 |
| 导出 | loading/错误/空态禁止；未提交筛选不污染标题；列数、合并格、null/0、日期口径、文本及电话前导零保留；不把 XML 伪装 xlsx |
| 核心错误 | 404 文本、502 HTML、200 非信封、合法业务错误、HTTP/业务401、大小写续期头/Trace头、raw 成功下载 |
| 权限 | 仅街道台账 view 可访问其两个接口/候选而不能访问排查；仅排查 view 反之；无登录401；无本页 view 403；超级管理员成功 |
| 后端兼容 | G1-G7 人工预期先通过，再校验新组合等于旧 `/report`；旧普通聚合接口原契约不变 |
| 性能 | 记录代表性数据规模、每页请求数、SQL 数量、延迟、内存及返回体；不得每行发请求、每行查组织或静默截断 |

状态测试复用现有 `table-ui.test.ts` 中可控 Promise 的方式；在渲染组件或 effectScope 中调用 composable，测试后卸载/停止作用域，避免泄漏生命周期。涉及 mock 时恢复状态，所有异步断言必须 await。

## 10. 验证命令与发布门槛

本节为持续回归的命令清单。本地执行结果和环境限制单独记录在实施验收记录中，不以命令清单代替实际结果。

从根目录执行，使用根 `package.json` 指定的 pnpm 11.25.0，不因本任务升级依赖：

```bash
pnpm --filter @gbnt/admin-web typecheck
pnpm --filter @gbnt/admin-web test
pnpm --filter @gbnt/admin-web build
pnpm --filter @gbnt/miniapp typecheck
pnpm --filter @gbnt/miniapp test
pnpm --filter @gbnt/miniapp build:mp-weixin
git diff --check
git diff --name-only -- prototypes/static-demo docs/api
```

后端在 `apps/server` 执行 `go test ./...`，工具链遵循 `go.mod`。测试只能连接隔离测试库或现有 sqlstub，不能启动服务入口来“跑测试”。依赖/工具链不可用时记录具体阻塞，不把未运行写成通过。

浏览器验收：1512px 桌面下台账 16 列/三级表头、排查22列/四层表头及左四列固定；横向滚动仍固定、页面不横向溢出；375px 下工具栏和空/错状态可用。截图必须标明模拟数据还是实际接口。保留 Excel 2003 XML 导出格式，至少用 Excel 或 WPS 打开核验一次，不能仅以 XML 能解析代替应用兼容性。

发布顺序与保护：

1. 审查所部署后端完整版本的所有待迁移变更，备份并验证恢复方式。本任务本身不需要新建表，但不能据此断言工作区其他变更没有迁移。
2. 核查实际连接数据库和 `server.mode=release`；严禁在有用数据上以 `debug/dev + migrate.enabled=true` 启动，该组合会删当前库内表重建。
3. 先发布保留旧接口的新后端。合入远端 `ebe0f15` 后，启动时无论是否开启迁移都会执行 `SyncSysAPIs`，随后加载 API 权限索引；迁移关闭时仍会写 `sys_apis`。必须确认相关表已存在、数据库账号有写权限、目录同步和索引加载均成功；不能把进程启动动作当作同步成功证明。
4. 用有效登录凭证验证四个新接口及普通角色边界，再发布前端。失败不得通过硬编码假数据或改回旧汇总掩盖。
5. 选择有据可查的实际样本，核对数据库/业务记录、两个响应、组合行、页面和导出。单纯 200、构建通过或旧接口等价不算数值验收完成。
6. 前端异常优先回退上一已验证前端版本；后端因保留旧接口可暂留。后端回退必须确认与当前数据库兼容，不做自动反向迁移、删表或恢复覆盖。

每次发布记录：前后端版本、目标环境、迁移/目录同步方式、验证账户角色（不记录密码/Token）、请求路径与 Trace ID、脱敏样本预期/实际、截图/导出证据、已知限制。

双请求不共享事务，甚至旧 report 的组织与记录查询也未承诺强快照。首期允许查询间实时变化，键不匹配时整组失败让用户重试；相同键、相同筛选或时间戳不证明强一致。若业务要求正式盖章报表快照，停止将本期结果声称为强一致交付，另行确认实现方案。

## 11. 完成清单

- [x] 四个新接口、中文注释、参数校验、权限目录完成（源码登记，不代表远端目录已同步）。
- [x] 管理端四个可调用方法、严格解码器与 TypeScript 类型同步。
- [x] 公共基础能力复用，两页行粒度、指标和权限保持独立。
- [x] G1–G6 黄金用例人工预期通过；旧 report 兼容，非“只跑构建”。G7 已断言 SQL/时间参数，真实 MySQL 样本验收未完成。
- [x] 请求竞争、错误、空态、null/0、导出状态与筛选一致。
- [x] 共享 core 回归含小程序与 raw 下载，未知 API 不绕过鉴权。
- [x] 自动化、视觉和 Excel/WPS 验收分别记录；未完成项明确说明。
- [ ] Excel/WPS 实际打开两份导出文件，核验应用兼容性。
- [ ] 真实数据库日期边界、代表性容量与 HTTP 延迟验证。
- [ ] 新后端部署、API 目录同步、前端切换、真实联调分别记录。
- [x] 原型、API 文档和其他用户改动未误改；未采集字段仍清楚说明。

## 12. 初次文档交付记录（历史）

本节保留用户要求“先保存方案”时的历史记录，不是当前实施状态。初次交付只创建整合方案和本实施规格，没有实现路由、函数、组件或测试，没有修改数据库、部署或提交推送 Git。代码块用于规定关键实现方式，不能将示例片段视为完整可发布补丁。

本次文档核验记录：

- 两份文档的互链、代码围栏及新增文件空白检查通过；6 个 JSON 示例可解析。
- 9 个 TS 代码块完成语法检查（对象方法片段放入对象后检查）；契约、query 规范化、纯合并、台账 compose 四部分通过与当前行类型结合的严格类型检查。
- 文中5个合并测试示例通过 Node 断言适配器独立执行，另验证7项 query 规范化/拒绝输入断言；不是完整 Vitest 或页面测试运行。
- 6 个 Go 代码块经过必要的包/函数/数组上下文包装后通过 gofmt 语法解析；没有声称通过 Go 编译或后端测试。
- 人工复核 G1 数值，修正 G4 必须存在实际记录、G5 无组织关联记录与街道筛选的边界。业务自动化、浏览器、Excel/WPS 和真实接口验收仍待实施后执行。
