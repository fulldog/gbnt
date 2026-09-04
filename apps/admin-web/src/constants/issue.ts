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

export const QUIZ_DEFINITIONS: Record<IssueType, readonly QuizDefinition[]> = {
  well: [
    { type: "water_out", label: "机井是否出水", negative: false, mustImg: true },
    { type: "pipe_ok", label: "管道是否按要求连接", negative: false, mustImg: true },
    { type: "wiring_ok", label: "走线是否规范", negative: false, mustImg: false },
    { type: "box_ok", label: "配电箱及电表等设施是否完好", negative: false, mustImg: true },
    { type: "cover_ok", label: "井台、井盖是否完整", negative: false, mustImg: true },
    { type: "transformer_ok", label: "变压器是否完好", negative: false, mustImg: true },
  ],
  road: [
    { type: "has_shoulder", label: "是否有路肩", negative: false, mustImg: false },
    { type: "has_ash", label: "是否有灰土层", negative: false, mustImg: false },
  ],
  bridge: [
    { type: "needs_rectify", label: "是否需要整改", negative: true, mustImg: true },
  ],
  forest: [
    { type: "broken_belt", label: "林带是否断带", negative: true, mustImg: true },
    { type: "dead_trees", label: "是否有枯死木", negative: true, mustImg: true },
    { type: "pest", label: "是否发现病虫害", negative: true, mustImg: true },
  ],
  transformer: [
    { type: "powered", label: "是否通电", negative: false, mustImg: true },
    { type: "device_ok", label: "设备是否完好", negative: false, mustImg: true },
    { type: "cabinet_ok", label: "配电设施是否完好", negative: false, mustImg: true },
    { type: "illegal_wire", label: "是否私拉乱接", negative: true, mustImg: true },
  ],
};

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
  return type;
}
