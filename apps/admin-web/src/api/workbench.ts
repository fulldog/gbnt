import type { ApiClient, WorkbenchStats } from "@gbnt/api-client";

export function createWorkbenchApi(client: ApiClient) {
  return {
    getStats(): Promise<WorkbenchStats> {
      return client.request<WorkbenchStats>("/api/workbench/stats");
    },
  } as const;
}

export type WorkbenchApi = ReturnType<typeof createWorkbenchApi>;
