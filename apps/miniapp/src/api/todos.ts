import type {
  ApiClient,
  MiniappTodoQuery,
} from "@gbnt/api-client";
import { parseIssuePage } from "./response";
import type { MiniappIssueListResult } from "./types";

export function createTodosApi(client: ApiClient) {
  return {
    /** 待办列表：服务端仅返回未指派或指派给当前用户的工单。 */
    async list(query: MiniappTodoQuery = {}): Promise<MiniappIssueListResult> {
      const response = await client.request<unknown>("/api/app/todos", {
        query: { ...query },
      });
      const page = parseIssuePage(response);
      const time = (response as { server_time?: unknown }).server_time;
      if (typeof time === "string" && Number.isFinite(Date.parse(time))) page.server_time = time;
      return page;
    },
  } as const;
}

export type TodosApi = ReturnType<typeof createTodosApi>;
