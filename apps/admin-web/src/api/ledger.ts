import type {
  ApiClient,
  LedgerQuery,
  SurveyLedgerResult,
} from "@gbnt/api-client";
import { ISSUE_TYPES } from "@gbnt/api-client";
import type { AdminStreetLedgerResult, AdminStreetLedgerRow, OrgOption } from "./types";
import { checkDisplayFields, normalizeOrgOptions, responseArray, responseInteger, responseRecord } from "./response";
import type { LedgerPart, LedgerSplitQuery, StreetBaseRow, StreetLedgerReportResult, StreetStatisticsRow, SurveyBaseRow, SurveyLedgerReportResult, SurveyStatisticsRow } from "./ledger-report-types";
import { normalizeStreetReport, normalizeStreetRowsPart, normalizeStreetStatisticsPart, normalizeSurveyReport, normalizeSurveyRowsPart, normalizeSurveyStatisticsPart } from "./ledger-report-response";
import { normalizeLedgerQuery } from "@/utils/ledger-report-query";

function normalizeRow(value: unknown): SurveyLedgerResult["rows"][number] {
  const row = responseRecord(value, "台账");
  if (!ISSUE_TYPES.some((type) => type === row.type)) throw new Error("台账类型格式异常，请刷新重试");
  return {
    type: row.type as SurveyLedgerResult["rows"][number]["type"],
    total: responseInteger(row.total, "台账总量"),
    pending: responseInteger(row.pending, "待处理数量"),
    done: responseInteger(row.done, "已整改数量"),
  };
}

export function createLedgerApi(client: ApiClient) {
  return {
    /** 按建设年份和落点组织提供基础行，不包含统计数量。 */
    async getStreetRows(query: LedgerSplitQuery = {}): Promise<LedgerPart<StreetBaseRow>> {
      return normalizeStreetRowsPart(await client.request<unknown>("/api/ledger/street/rows", { query: { ...normalizeLedgerQuery(query) } }));
    },

    /** 批量提供同一筛选的台账指标；须与基础行按 row_key 关联。 */
    async getStreetStatistics(query: LedgerSplitQuery = {}): Promise<LedgerPart<StreetStatisticsRow>> {
      return normalizeStreetStatisticsPart(await client.request<unknown>("/api/ledger/street/statistics", { query: { ...normalizeLedgerQuery(query) } }));
    },

    /** 按落点组织跨年度提供排查基础行，沿用排查汇总查看权限。 */
    async getSurveyRows(query: LedgerSplitQuery = {}): Promise<LedgerPart<SurveyBaseRow>> {
      return normalizeSurveyRowsPart(await client.request<unknown>("/api/ledger/survey/rows", { query: { ...normalizeLedgerQuery(query) } }));
    },

    /** 提供当前记录口径的问题、整改计数，不推导资产或已排查总量。 */
    async getSurveyStatistics(query: LedgerSplitQuery = {}): Promise<LedgerPart<SurveyStatisticsRow>> {
      return normalizeSurveyStatisticsPart(await client.request<unknown>("/api/ledger/survey/statistics", { query: { ...normalizeLedgerQuery(query) } }));
    },

    /** 按年度及落点组织生成只读建设项目报表；日期筛选按北京时间自然日（含起止日），未采集字段保留 null。 */
    async getStreetReport(query: LedgerQuery = {}): Promise<StreetLedgerReportResult> {
      return normalizeStreetReport(await client.request<unknown>("/api/ledger/street/report", { query: { ...query } }));
    },

    /** 村级排查整改报表；日期筛选按北京时间自然日（含起止日），记录计数不是去重资产总数。 */
    async getSurveyReport(query: LedgerQuery = {}): Promise<SurveyLedgerReportResult> {
      return normalizeSurveyReport(await client.request<unknown>("/api/ledger/survey/report", { query: { ...query } }));
    },

    async getStreet(query: LedgerQuery = {}): Promise<AdminStreetLedgerResult> {
      const value = await client.request<unknown>("/api/ledger/street", {
        query: { ...query },
      });
      const result = responseRecord(value, "街道台账");
      return {
        street_org_id: responseInteger(result.street_org_id, "街道 ID"),
        rows: responseArray(result.rows, "街道台账", true).map((item): AdminStreetLedgerRow => {
          const row = responseRecord(item, "街道台账");
          checkDisplayFields(row, ["org_name", "org_path"]);
          return {
            ...normalizeRow(item),
            org_id: responseInteger(row.org_id, "组织 ID"),
            org_name: row.org_name as string | null | undefined,
            org_path: row.org_path as string | null | undefined,
          };
        }),
      };
    },

    async getSurvey(query: LedgerQuery = {}): Promise<SurveyLedgerResult> {
      const value = await client.request<unknown>("/api/ledger/survey", {
        query: { ...query },
      });
      const result = responseRecord(value, "排查汇总");
      return {
        street_org_id: responseInteger(result.street_org_id, "街道 ID"),
        rows: responseArray(result.rows, "排查汇总", true).map(normalizeRow),
      };
    },

    /** 街道台账 view 权限，返回最小街道选项。 */
    async listStreetOrgOptions(): Promise<OrgOption[]> {
      return normalizeOrgOptions(await client.request<unknown>("/api/ledger/street/options/orgs"));
    },

    /** 排查汇总 view 权限，不借用组织管理接口。 */
    async listSurveyOrgOptions(): Promise<OrgOption[]> {
      return normalizeOrgOptions(await client.request<unknown>("/api/ledger/survey/options/orgs"));
    },
  } as const;
}

export type LedgerApi = ReturnType<typeof createLedgerApi>;
