import type { FacilityCodeMode } from "../types";

/** 旧草稿无模式时保守保留手动值；明确标为旧自动建议的值不再提交。 */
export function resolveFacilityCodeMode(form: { code: string; codeMode?: FacilityCodeMode; codeSource?: string }): FacilityCodeMode {
  if (form.codeMode === "auto" || form.codeMode === "manual") return form.codeMode;
  if (form.codeSource === "auto" || form.codeSource === "manual") return form.codeSource;
  return form.code !== "" ? "manual" : "auto";
}

export interface IssueSubmissionAttempt {
  requestId: string;
  payload: string;
}

/** 平台无关的提交标识，不作为凭证。后端按账号、标识和提交内容校验。 */
function newRequestId(): string {
  return `issue_${Date.now().toString(36)}_${Array.from({ length: 4 }, () => Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, "0")).join("")}`;
}

/** 相同内容重试复用请求 ID；前端保存此结果到草稿，重启也不会重新建单。 */
export function prepareIssueSubmission(payload: object, previous?: IssueSubmissionAttempt): IssueSubmissionAttempt {
  const serialized = JSON.stringify(payload);
  if (previous?.payload === serialized && /^[A-Za-z0-9_-]{16,64}$/.test(previous.requestId)) return previous;
  return { requestId: newRequestId(), payload: serialized };
}
