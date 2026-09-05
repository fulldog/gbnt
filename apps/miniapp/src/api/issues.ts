import type {
  ApiClient,
  MiniappCreateIssueInput,
  RectifyInput,
} from "@gbnt/api-client";
import { parseIssue } from "./response";
import type { MiniappIssue } from "./types";

export function createIssuesApi(client: ApiClient) {
  return {
    async create(input: MiniappCreateIssueInput): Promise<MiniappIssue> {
      return parseIssue(await client.request<unknown, MiniappCreateIssueInput>("/api/app/issues", {
        method: "POST",
        body: input,
      }));
    },

    async get(id: number): Promise<MiniappIssue> {
      return parseIssue(await client.request<unknown>(`/api/app/issues/${id}`));
    },

    async rectify(id: number, input: RectifyInput): Promise<MiniappIssue> {
      return parseIssue(await client.request<unknown, RectifyInput>(
        `/api/app/issues/${id}/rectify`,
        {
          method: "POST",
          body: input,
        },
      ));
    },

    async reRectify(id: number): Promise<MiniappIssue> {
      return parseIssue(await client.request<unknown>(`/api/app/issues/${id}/re-rectify`, {
        method: "POST",
      }));
    },
  } as const;
}

export type IssuesApi = ReturnType<typeof createIssuesApi>;
