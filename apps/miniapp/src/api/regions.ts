import type { ApiClient, MiniappRegionsResult } from "@gbnt/api-client";
import { parseRegions } from "./response";

export function createRegionsApi(client: ApiClient) {
  return {
    async list(): Promise<MiniappRegionsResult> {
      return parseRegions(await client.request<unknown>("/api/app/regions"));
    },
    /** 组织存在时返回完整组织树（含该节点上级与全部下级），结构与 list() 相同。 */
    async getSubtree(orgId: number): Promise<MiniappRegionsResult> {
      return parseRegions(await client.request<unknown>(`/api/app/regions/${orgId}`));
    },
  } as const;
}

export type RegionsApi = ReturnType<typeof createRegionsApi>;
