import { ISSUE_TYPES, type ApiClient, type IssueType, type WorkbenchStats } from "@gbnt/api-client";
import { checkDisplayFields, responseArray, responseInteger, responseRecord } from "./response";

export type WorkbenchTrendRange = "week7" | "month1" | "halfyear" | "all";
export interface WorkbenchTrendPoint { period: string; reported: number; completed: number }
export interface WorkbenchTrendResult {
  range: WorkbenchTrendRange;
  granularity: "day" | "month" | "year";
  timezone: "Asia/Shanghai";
  points: WorkbenchTrendPoint[];
  /** 当前 done 但没有当前轮次整改记录的问题不计入完成趋势。 */
  undated_completed: number;
}
export interface WorkbenchTodo {
  id: number;
  issue_key: string;
  code: string;
  type: IssueType;
  status: "new" | "pending";
  org_id: number;
  org_name: string | null;
  org_path: string | null;
  assignee_user: number;
  assignee_user_name: string | null;
  plan_date: string;
  /** 北京时间自然日倒计时，负数为逾期；无有效计划日期为 null。 */
  days_left: number | null;
}
export interface WorkbenchTodoResult { list: WorkbenchTodo[]; total: number; page: number; size: number; today: string }

function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function createWorkbenchApi(client: ApiClient) {
  return {
    /** 工作台专用只读契约，不依赖专项整改或系统管理 API。 */
    async getTodos(query: { page?: number; size?: number } = {}): Promise<WorkbenchTodoResult> {
      const result = responseRecord(await client.request<unknown>("/api/workbench/todos", { query }), "工作台待办");
      if (!validDate(result.today)) throw new Error("待办业务日期格式异常，请刷新重试");
      return {
        today: result.today,
        total: responseInteger(result.total, "待办总数"),
        page: responseInteger(result.page, "页码", 1),
        size: responseInteger(result.size, "每页数量", 1),
        list: responseArray(result.list, "待办").map((value) => {
          const item = responseRecord(value, "待办记录");
          for (const key of ["issue_key", "code", "plan_date"] as const) {
            if (typeof item[key] !== "string") throw new Error("待办记录格式异常，请刷新重试");
          }
          if (!ISSUE_TYPES.includes(item.type as IssueType) || !["new", "pending"].includes(String(item.status))
            || (item.days_left !== null && (typeof item.days_left !== "number" || !Number.isSafeInteger(item.days_left)))) {
            throw new Error("待办状态或倒计时格式异常，请刷新重试");
          }
          checkDisplayFields(item, ["org_name", "org_path", "assignee_user_name"]);
          for (const key of ["org_name", "org_path", "assignee_user_name"]) {
            if (item[key] === undefined) throw new Error("待办关联名称格式异常，请刷新重试");
          }
          responseInteger(item.id, "问题 ID", 1);
          responseInteger(item.org_id, "组织 ID");
          responseInteger(item.assignee_user, "整改人 ID");
          return item as unknown as WorkbenchTodo;
        }),
      };
    },
    async getTrend(range: WorkbenchTrendRange = "week7"): Promise<WorkbenchTrendResult> {
      const result = responseRecord(await client.request<unknown>("/api/workbench/trend", { query: { range } }), "整改趋势");
      const granularity = range === "all" ? "year" : range === "halfyear" ? "month" : "day";
      if (result.range !== range || result.granularity !== granularity || result.timezone !== "Asia/Shanghai") {
        throw new Error("整改趋势时间范围格式异常，请刷新重试");
      }
      let previous = "";
      const points = responseArray(result.points, "整改趋势").map((value) => {
        const point = responseRecord(value, "趋势节点");
        const period = point.period;
        const valid = granularity === "day" ? validDate(period)
          : typeof period === "string" && (granularity === "month" ? /^\d{4}-(0[1-9]|1[0-2])$/ : /^\d{4}$/).test(period);
        if (!valid || typeof period !== "string" || period <= previous) throw new Error("整改趋势时间节点格式异常，请刷新重试");
        previous = period;
        return { period, reported: responseInteger(point.reported, "上报数量"), completed: responseInteger(point.completed, "完成整改数量") };
      });
      const count = range === "week7" ? 7 : range === "month1" ? 30 : range === "halfyear" ? 6 : null;
      if (!points.length || (count !== null && points.length !== count)) throw new Error("整改趋势时间节点格式异常，请刷新重试");
      return { range, granularity, timezone: "Asia/Shanghai", points, undated_completed: responseInteger(result.undated_completed, "缺少完成日期数量") };
    },
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
