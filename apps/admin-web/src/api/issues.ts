import type {
  AdminCreateIssueInput,
  ApiClient,
  ImportIssuesInput,
  ImportResult,
  Issue,
  IssueListQuery,
  IssueListResult,
  ReassignIssueInput,
  RectifyInput,
  UpdateIssueInput,
} from "@gbnt/api-client";

export function createIssuesApi(client: ApiClient) {
  return {
    list(query: IssueListQuery = {}): Promise<IssueListResult> {
      return client.request<IssueListResult>("/api/issues", {
        query: { ...query },
      });
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

    get(id: number): Promise<Issue> {
      return client.request<Issue>(`/api/issues/${id}`);
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
