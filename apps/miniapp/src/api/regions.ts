import type { ApiClient, MiniappRegionsResult } from "@gbnt/api-client";
import { parseRegions } from "./response";

export function createRegionsApi(client: ApiClient) {
  return {
    async list(): Promise<MiniappRegionsResult> {
      return parseRegions(await client.request<unknown>("/api/app/regions"));
    },
  } as const;
}

export type RegionsApi = ReturnType<typeof createRegionsApi>;
