import type { ApiClient, MiniappRegionsResult } from "@gbnt/api-client";

export function createRegionsApi(client: ApiClient) {
  return {
    list(): Promise<MiniappRegionsResult> {
      return client.request<MiniappRegionsResult>("/api/app/regions");
    },
  } as const;
}

export type RegionsApi = ReturnType<typeof createRegionsApi>;
