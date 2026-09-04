import type {
  ApiClient,
  OpLogListResult,
  OpLogQuery,
} from "@gbnt/api-client";

export function createOpLogsApi(client: ApiClient) {
  return {
    list(query: OpLogQuery = {}): Promise<OpLogListResult> {
      return client.request<OpLogListResult>("/api/sys/op-logs", {
        query: { ...query },
      });
    },
  } as const;
}

export type OpLogsApi = ReturnType<typeof createOpLogsApi>;
