import type {
  ApiClient,
  MiniappCreateIssueInput,
  RectifyInput,
} from "@gbnt/api-client";
import { parseIssue } from "./response";
import type { MiniappIssue } from "./types";

/** 一份反馈完成本轮尚未完成的整改项；未指派或当前用户为整改人时可提交。 */
export interface IssueFeedbackInput {
  /** 去除首尾空白后 1–500 字。 */
  note: string;
  /** 1–6 张已上传整改照片的 file_id。 */
  file_uuids: string[];
  /** 必填；详情中当前轮次，过期时拒绝写入。 */
  expected_round: number;
}

export function createIssuesApi(client: ApiClient) {
  return {
    /** auto 提交时分配；manual 同组织同类型重复返回 40901；同次重试复用 request_id。 */
    async create(input: MiniappCreateIssueInput): Promise<MiniappIssue> {
      return parseIssue(await client.request<unknown, MiniappCreateIssueInput>("/api/app/issues", {
        method: "POST",
        body: input,
      }));
    },

    /** 同时读取旧版与 schema_version=2 表单，保留分类型题目及独立全景附件。 */
    async get(id: number): Promise<MiniappIssue> {
      return parseIssue(await client.request<unknown>(`/api/app/issues/${id}`));
    },

    /** 仅当前上报人可删除；软删除且保留反馈与附件，成功 data=null。 */
    deleteReported(id: number): Promise<null> {
      return client.request<null>(`/api/app/issues/${id}`, { method: "DELETE" });
    },

    async submitFeedback(id: number, input: IssueFeedbackInput): Promise<MiniappIssue> {
      return parseIssue(await client.request<unknown, IssueFeedbackInput>(`/api/app/issues/${id}/feedback`, {
        method: "POST", body: input,
      }));
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
