import type {
  ApiClient,
  LedgerQuery,
  SurveyLedgerResult,
} from "@gbnt/api-client";
import { ISSUE_TYPES } from "@gbnt/api-client";
import type { AdminStreetLedgerResult, AdminStreetLedgerRow, OrgOption } from "./types";
import { checkDisplayFields, normalizeOrgOptions, responseArray, responseInteger, responseRecord } from "./response";

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
