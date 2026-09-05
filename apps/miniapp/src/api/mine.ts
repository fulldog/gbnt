import type {
  ApiClient,
  MineIssueQuery,
  MineStats,
} from "@gbnt/api-client";
import { parseMineIssuePage, parseMineStats } from "./response";
import type { MiniappMineIssueListResult } from "./types";

export function createMineApi(client: ApiClient) {
  return {
    async getStats(): Promise<MineStats> {
      return parseMineStats(await client.request<unknown>("/api/app/mine/stats"));
    },

    async listIssues(query: MineIssueQuery = {}): Promise<MiniappMineIssueListResult> {
      return parseMineIssuePage(await client.request<unknown>("/api/app/mine/issues", {
        query: { ...query },
      }), query.scope ?? "reported");
    },
  } as const;
}

export type MineApi = ReturnType<typeof createMineApi>;
