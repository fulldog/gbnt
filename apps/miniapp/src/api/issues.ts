import type {
  ApiClient,
  Issue,
  MiniappCreateIssueInput,
  RectifyInput,
} from "@gbnt/api-client";

export function createIssuesApi(client: ApiClient) {
  return {
    create(input: MiniappCreateIssueInput): Promise<Issue> {
      return client.request<Issue, MiniappCreateIssueInput>("/api/app/issues", {
        method: "POST",
        body: input,
      });
    },

    get(id: number): Promise<Issue> {
      return client.request<Issue>(`/api/app/issues/${id}`);
    },

    rectify(id: number, input: RectifyInput): Promise<Issue> {
      return client.request<Issue, RectifyInput>(
        `/api/app/issues/${id}/rectify`,
        {
          method: "POST",
          body: input,
        },
      );
    },

    reRectify(id: number): Promise<Issue> {
      return client.request<Issue>(`/api/app/issues/${id}/re-rectify`, {
        method: "POST",
      });
    },
  } as const;
}

export type IssuesApi = ReturnType<typeof createIssuesApi>;
