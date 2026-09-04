import type {
  ApiClient,
  MineIssueListResult,
  MineIssueQuery,
  MineStats,
} from "@gbnt/api-client";

export function createMineApi(client: ApiClient) {
  return {
    getStats(): Promise<MineStats> {
      return client.request<MineStats>("/api/app/mine/stats");
    },

    listIssues(query: MineIssueQuery = {}): Promise<MineIssueListResult> {
      return client.request<MineIssueListResult>("/api/app/mine/issues", {
        query: { ...query },
      });
    },
  } as const;
}

export type MineApi = ReturnType<typeof createMineApi>;
