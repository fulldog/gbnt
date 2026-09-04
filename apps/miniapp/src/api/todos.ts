import type {
  ApiClient,
  IssueListResult,
  MiniappTodoQuery,
} from "@gbnt/api-client";

export function createTodosApi(client: ApiClient) {
  return {
    list(query: MiniappTodoQuery = {}): Promise<IssueListResult> {
      return client.request<IssueListResult>("/api/app/todos", {
        query: { ...query },
      });
    },
  } as const;
}

export type TodosApi = ReturnType<typeof createTodosApi>;
