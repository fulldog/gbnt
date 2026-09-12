import type {
  AdminCreateIssueInput,
  ApiClient,
  ImportIssuesInput,
  ImportResult,
  Issue,
  IssueListQuery,
  ReassignIssueInput,
  RectifyInput,
  UpdateIssueInput,
} from "@gbnt/api-client";
import type { AdminIssue, AdminIssueListResult, OrgOption, UserOptionQuery, UserOptionResult } from "./types";
import { checkDisplayFields, checkOptionalBoolean, normalizeOrgOptions, normalizeUserOptions, responseArray, responseInteger, responseRecord } from "./response";

function normalizeAdminIssue(value: unknown): AdminIssue {
  const row = responseRecord(value, "排查整改");
  responseInteger(row.id, "问题 ID", 1);
  checkDisplayFields(row, ["report_user_name", "assignee_user_name", "org_name", "org_path"]);
  checkOptionalBoolean(row, "within_org_scope", "整改组织权限范围");
  if (row.assignee_user_phone !== undefined && row.assignee_user_phone !== null && typeof row.assignee_user_phone !== "string") {
    throw new Error("整改责任人联系电话格式异常，请刷新重试");
  }
  // 兼容升级前服务，明确轮次后历史记录只能归属其返回的轮次。
  const normalized: Record<string, unknown> = {
    ...row,
    rectify_round: responseInteger(row.rectify_round === undefined ? 0 : row.rectify_round, "整改轮次"),
  };
  if (Array.isArray(row.rectify_records)) {
    normalized.rectify_records = row.rectify_records.map((value) => {
      const record = responseRecord(value, "整改记录");
      return { ...record, round: responseInteger(record.round === undefined ? 0 : record.round, "历史整改轮次") };
    });
  }
  return normalized as unknown as AdminIssue;
}

export function createIssuesApi(client: ApiClient) {
  return {
    /**
     * 关键字检索问题编号、设施编号与地址。
     * 服务端仅返回当前账号组织及下级；账号 org_id=0 时全部可见，org_id 筛选包含下级。
     * 保留服务端分页前的排序：已逾期 > 即将逾期 > 待整改 > 已整改/已排查；同组 created_at、id 倒序。
     * 即将逾期含北京自然日今天至 3 天后，小程序查询契约不受影响。
     */
    async list(query: IssueListQuery = {}): Promise<AdminIssueListResult> {
      const value = await client.request<unknown>("/api/issues", {
        query: { ...query, keyword: query.keyword?.trim() || undefined },
      });
      const result = responseRecord(value, "排查整改");
      return {
        list: responseArray(result.list, "排查整改").map(normalizeAdminIssue),
        total: responseInteger(result.total, "记录总数"),
        page: responseInteger(result.page, "页码", 1),
        size: responseInteger(result.size, "每页数量", 1),
      };
    },

    /** 专项整改 view 权限下的可见组织候选；范围为当前组织及下级，账号 org_id=0 时全部可见。 */
    async listOrgOptions(): Promise<OrgOption[]> {
      return normalizeOrgOptions(await client.request<unknown>("/api/issues/options/orgs"));
    },

    /** 专项整改 create 权限；org_id 必填，仅查询该组织的启用人员。 */
    async listReporterOptions(query: UserOptionQuery & { org_id: number }): Promise<UserOptionResult> {
      return normalizeUserOptions(await client.request<unknown>("/api/issues/options/reporters", {
        query: { ...query, keyword: query.keyword?.trim() || undefined },
      }));
    },

    /** edit 权限；选填 org_id 为编辑表单的新组织，省略沿用工单组织；合法上下级已选人员可回显。 */
    async listAssigneeOptions(id: number, query: UserOptionQuery & { org_id?: number } = {}): Promise<UserOptionResult> {
      return normalizeUserOptions(await client.request<unknown>(`/api/issues/${id}/assignee-options`, {
        query: { ...query, keyword: query.keyword?.trim() || undefined },
      }));
    },

    /** 新增 assignee_user 固定为 0；auto 提交时分配编号，manual 重复返回 40901，重试复用 request_id。 */
    create(input: AdminCreateIssueInput): Promise<Issue> {
      return client.request<Issue, AdminCreateIssueInput>("/api/issues", {
        method: "POST",
        body: input,
      });
    },

    /** 逐行创建、遇错停止，错误含失败行与成功数量；每行 request_id 支持原批次重试。 */
    importRows(input: ImportIssuesInput): Promise<ImportResult> {
      return client.request<ImportResult, ImportIssuesInput>("/api/issues/import", {
        method: "POST",
        body: input,
      });
    },

    async get(id: number): Promise<AdminIssue> {
      return normalizeAdminIssue(await client.request<unknown>(`/api/issues/${id}`));
    },

    /** 完整编辑；省略保留，expected_updated_at 防覆盖；编号/组织/类型的最终组合重复返回 40901。 */
    update(id: number, input: UpdateIssueInput): Promise<Issue> {
      return client.request<Issue, UpdateIssueInput>(`/api/issues/${id}`, {
        method: "PUT",
        body: input,
      });
    },

    remove(id: number): Promise<null> {
      return client.request<null>(`/api/issues/${id}`, { method: "DELETE" });
    },

    rectify(id: number, input: RectifyInput): Promise<Issue> {
      return client.request<Issue, RectifyInput>(`/api/issues/${id}/rectify`, {
        method: "POST",
        body: input,
      });
    },

    reRectify(id: number): Promise<Issue> {
      return client.request<Issue>(`/api/issues/${id}/re-rectify`, {
        method: "POST",
      });
    },

    reassign(id: number, input: ReassignIssueInput): Promise<Issue> {
      return client.request<Issue, ReassignIssueInput>(
        `/api/issues/${id}/reassign`,
        {
          method: "POST",
          body: input,
        },
      );
    },
  } as const;
}

export type IssuesApi = ReturnType<typeof createIssuesApi>;
