import type { IssueType, QuizType } from "./types";

export interface IssueQuizDefinition {
  type: QuizType;
  label: string;
  negative: boolean;
  /** 仅记录现状，是/否都不直接判定为问题。 */
  observationOnly?: boolean;
  mustImg: boolean;
}

/** 新版五类表单；管理端填报、小程序读取使用同一套题目语义。 */
export const ISSUE_FORM_QUIZZES: Record<IssueType, readonly IssueQuizDefinition[]> = {
  well: [
    { type: "water_out", label: "机井是否出水", negative: false, mustImg: true },
    { type: "pipe_ok", label: "管道是否按要求连接", negative: false, mustImg: true },
    { type: "wiring_ok", label: "走线是否规范", negative: false, mustImg: false },
    { type: "box_ok", label: "配电箱及电表等设施是否完好", negative: false, mustImg: true },
    { type: "cover_ok", label: "井台、井盖是否完整", negative: false, mustImg: true },
  ],
  road: [
    { type: "has_shoulder", label: "是否有路肩", negative: false, observationOnly: true, mustImg: false },
    { type: "has_ash", label: "是否有灰土层", negative: false, observationOnly: true, mustImg: false },
    { type: "has_road_damage", label: "是否有道路损坏", negative: true, mustImg: true },
  ],
  bridge: [{ type: "needs_rectify", label: "是否有淤堵与损坏", negative: true, mustImg: true }],
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

/** 读取旧记录时保留旧版题目和判定，不反向改写历史结论。 */
export function issueQuizDefinitions(type: IssueType, version = 1): readonly IssueQuizDefinition[] {
  const definitions = ISSUE_FORM_QUIZZES[type];
  if (version === 2) return definitions;
  if (type === "well") return [...definitions, { type: "transformer_ok", label: "变压器是否完好", negative: false, mustImg: true }];
  if (type === "road") return definitions.filter((q) => q.type !== "has_road_damage").map((q) => ({ ...q, observationOnly: false }));
  if (type === "bridge") return definitions.map((q) => ({ ...q, label: "是否需要整改" }));
  return definitions;
}

export function issueQuizIsAbnormal(definition: IssueQuizDefinition, value: boolean): boolean {
  return !definition.observationOnly && (definition.negative ? value : !value);
}
