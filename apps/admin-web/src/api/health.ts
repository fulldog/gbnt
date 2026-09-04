import type { ApiClient, HealthResult } from "@gbnt/api-client";

export function createHealthApi(client: ApiClient) {
  return {
    get(): Promise<HealthResult> {
      return client.request<HealthResult>("/api/health", { auth: false });
    },
  } as const;
}

export type HealthApi = ReturnType<typeof createHealthApi>;
