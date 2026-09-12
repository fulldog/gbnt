import type { ApiClient, MiniappRegionsResult } from "@gbnt/api-client";
import { parseRegions } from "./response";

export function createRegionsApi(client: ApiClient) {
  return {
    async list(): Promise<MiniappRegionsResult> {
      return parseRegions(await client.request<unknown>("/api/app/regions"));
    },
    /** 目标在当前账号组织范围内时，返回权限根的祖先路径与子树。 */
    async getSubtree(orgId: number): Promise<MiniappRegionsResult> {
      return parseRegions(await client.request<unknown>(`/api/app/regions/${orgId}`));
    },
  } as const;
}

export type RegionsApi = ReturnType<typeof createRegionsApi>;
