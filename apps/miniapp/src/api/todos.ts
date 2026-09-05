import type {
  ApiClient,
  MiniappTodoQuery,
} from "@gbnt/api-client";
import { parseIssuePage } from "./response";
import type { MiniappIssueListResult } from "./types";

export function createTodosApi(client: ApiClient) {
  return {
    async list(query: MiniappTodoQuery = {}): Promise<MiniappIssueListResult> {
      return parseIssuePage(await client.request<unknown>("/api/app/todos", {
        query: { ...query },
      }));
    },
  } as const;
}

export type TodosApi = ReturnType<typeof createTodosApi>;
