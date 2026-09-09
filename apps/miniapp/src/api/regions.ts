import type { ApiClient, MiniappRegionsResult } from "@gbnt/api-client";
import { parseRegions } from "./response";

export function createRegionsApi(client: ApiClient) {
  return {
    async list(): Promise<MiniappRegionsResult> {
      return parseRegions(await client.request<unknown>("/api/app/regions"));
    },
    /** 按组织 ID 查询该组织及其下属（含自身），结构与 list() 相同，list 仅含该节点为根。 */
    async getSubtree(orgId: number): Promise<MiniappRegionsResult> {
      return parseRegions(await client.request<unknown>(`/api/app/regions/${orgId}`));
    },
  } as const;
}

export type RegionsApi = ReturnType<typeof createRegionsApi>;
