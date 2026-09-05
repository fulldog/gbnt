import type { ApiClient, WorkbenchStats } from "@gbnt/api-client";
import { responseInteger, responseRecord } from "./response";

export function createWorkbenchApi(client: ApiClient) {
  return {
    /** 查询失败由共享请求层抛出；异常统计结构不得降级成成功的零统计。 */
    async getStats(): Promise<WorkbenchStats> {
      const result = responseRecord(await client.request<unknown>("/api/workbench/stats"), "工作台统计");
      const byType = responseRecord(result.by_type, "类型统计");
      if (typeof result.complete_rate !== "number" || !Number.isFinite(result.complete_rate)
        || result.complete_rate < 0 || result.complete_rate > 100) {
        throw new Error("工作台完成率格式异常，请刷新重试");
      }
      return {
        total: responseInteger(result.total, "排查记录总数"),
        new: responseInteger(result.new, "待整改数量"),
        pending: responseInteger(result.pending, "整改中数量"),
        done: responseInteger(result.done, "已整改数量"),
        complete_rate: result.complete_rate,
        by_type: {
          well: responseInteger(byType.well, "机井数量"),
          road: responseInteger(byType.road, "道路数量"),
          bridge: responseInteger(byType.bridge, "桥涵闸数量"),
          forest: responseInteger(byType.forest, "林网数量"),
          transformer: responseInteger(byType.transformer, "变压器数量"),
        },
      };
    },
  } as const;
}

export type WorkbenchApi = ReturnType<typeof createWorkbenchApi>;
