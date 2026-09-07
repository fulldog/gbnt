import { ISSUE_FORM_QUIZZES, issueQuizDefinitions, issueQuizIsAbnormal } from "@gbnt/api-client";
import type { IssueStatus, IssueType, QuizType } from "@gbnt/api-client";

export interface QuizDefinition {
  type: QuizType;
  label: string;
  negative: boolean;
  mustImg: boolean;
}

export const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
  well: "机井",
  road: "道路",
  bridge: "桥涵闸",
  forest: "林网",
  transformer: "变压器",
};

export const ISSUE_STATUS_META: Record<
  IssueStatus,
  { label: string; tag: "danger" | "warning" | "success" }
> = {
  new: { label: "待整改", tag: "danger" },
  pending: { label: "整改中", tag: "warning" },
  done: { label: "已整改", tag: "success" },
};

export const QUIZ_DEFINITIONS = ISSUE_FORM_QUIZZES;
export { issueQuizDefinitions, issueQuizIsAbnormal };

export function quizIndicatesIssue(value: boolean, negative: boolean): boolean {
  return negative ? value : !value;
}

export function issueTypeLabel(type: IssueType): string {
  return ISSUE_TYPE_LABELS[type];
}

export function quizLabel(type: QuizType): string {
  for (const definitions of Object.values(QUIZ_DEFINITIONS)) {
    const found = definitions.find((item) => item.type === type);
    if (found) return found.label;
  }
  return type === "transformer_ok" ? "变压器是否完好（历史项）" : type;
}
