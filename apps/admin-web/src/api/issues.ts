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
import { checkDisplayFields, normalizeOrgOptions, normalizeUserOptions, responseArray, responseInteger, responseRecord } from "./response";

function normalizeAdminIssue(value: unknown): AdminIssue {
  const row = responseRecord(value, "排查整改");
  responseInteger(row.id, "问题 ID", 1);
  checkDisplayFields(row, ["report_user_name", "assignee_user_name", "org_name", "org_path"]);
  return row as unknown as AdminIssue;
}

export function createIssuesApi(client: ApiClient) {
  return {
    /** 管理端关键字同时检索问题编号、设施编号与地址，小程序查询契约不受影响。 */
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

    /** 专项整改 view 权限下的最小组织候选，不依赖组织管理权限。 */
    async listOrgOptions(): Promise<OrgOption[]> {
      return normalizeOrgOptions(await client.request<unknown>("/api/issues/options/orgs"));
    },

    /** 专项整改 create 权限；org_id 必填，仅查询该组织的启用人员。 */
    async listReporterOptions(query: UserOptionQuery & { org_id: number }): Promise<UserOptionResult> {
      return normalizeUserOptions(await client.request<unknown>("/api/issues/options/reporters", {
        query: { ...query, keyword: query.keyword?.trim() || undefined },
      }));
    },

    /** 专项整改 edit 权限；按已有问题的组织返回启用候选及独立 selected 回显。 */
    async listAssigneeOptions(id: number, query: UserOptionQuery = {}): Promise<UserOptionResult> {
      return normalizeUserOptions(await client.request<unknown>(`/api/issues/${id}/assignee-options`, {
        query: { ...query, keyword: query.keyword?.trim() || undefined },
      }));
    },

    create(input: AdminCreateIssueInput): Promise<Issue> {
      return client.request<Issue, AdminCreateIssueInput>("/api/issues", {
        method: "POST",
        body: input,
      });
    },

    importRows(input: ImportIssuesInput): Promise<ImportResult> {
      return client.request<ImportResult, ImportIssuesInput>("/api/issues/import", {
        method: "POST",
        body: input,
      });
    },

    async get(id: number): Promise<AdminIssue> {
      return normalizeAdminIssue(await client.request<unknown>(`/api/issues/${id}`));
    },

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
