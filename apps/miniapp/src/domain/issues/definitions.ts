import {
  ISSUE_FORM_QUIZZES,
  issueQuizIsAbnormal,
  type IssueQuizDefinition,
} from "@gbnt/api-client";
import type {
  BridgeKind,
  FacilityBuildKind,
  IssueType,
  ProjectYear,
  QuizType,
  TransformerVoltage,
} from "@gbnt/api-client";

export interface SelectOption<TValue extends string | number> {
  label: string;
  value: TValue;
}

export interface QuizDefinition extends IssueQuizDefinition {
  help: string;
}

export const ISSUE_TYPE_OPTIONS: readonly SelectOption<IssueType>[] = [
  { value: "well", label: "机井" },
  { value: "road", label: "道路" },
  { value: "bridge", label: "桥涵闸" },
  { value: "forest", label: "林网" },
  { value: "transformer", label: "变压器" },
];

export const PROJECT_YEAR_OPTIONS: readonly SelectOption<ProjectYear>[] = [
  { value: 2020, label: "2020 年" },
  { value: 2021, label: "2021 年" },
  { value: 2022, label: "2022 年" },
  { value: 2023, label: "2023 年" },
];

export const BUILD_KIND_OPTIONS: readonly SelectOption<FacilityBuildKind>[] = [
  { value: "new", label: "新建" },
  { value: "match", label: "配套" },
];

export const BRIDGE_KIND_OPTIONS: readonly SelectOption<BridgeKind>[] = [
  { value: "bridge", label: "桥" },
  { value: "culvert", label: "涵" },
  { value: "gate", label: "闸" },
];

export const VOLTAGE_OPTIONS: readonly SelectOption<TransformerVoltage>[] = [
  { value: "10kv", label: "10 kV" },
  { value: "0.4kv", label: "0.4 kV" },
];

function quizHelp(definition: IssueQuizDefinition): string {
  if (definition.type === "water_out") {
    return "选择“是”时须现场拍摄至少两张照片，首张与第二张间隔不少于 60 秒。";
  }
  if (definition.observationOnly) {
    return "请选择现场实际情况，此项只记录现状。";
  }
  return definition.negative ? "选择“是”表示存在问题。" : "选择“否”表示存在问题。";
}

function formQuizDefinitions(type: IssueType): readonly QuizDefinition[] {
  return ISSUE_FORM_QUIZZES[type].map((definition) => ({
    ...definition,
    help: quizHelp(definition),
  }));
}

/** 创建表单直接复用共享新版契约，避免页面题目与服务端校验再次漂移。 */
export const QUIZ_DEFINITIONS: Readonly<Record<IssueType, readonly QuizDefinition[]>> = {
  well: formQuizDefinitions("well"),
  road: formQuizDefinitions("road"),
  bridge: formQuizDefinitions("bridge"),
  forest: formQuizDefinitions("forest"),
  transformer: formQuizDefinitions("transformer"),
};

export function issueTypeLabel(type: IssueType): string {
  return ISSUE_TYPE_OPTIONS.find((item) => item.value === type)?.label ?? type;
}

export function quizDefinition(type: QuizType): QuizDefinition | undefined {
  return Object.values(QUIZ_DEFINITIONS)
    .flat()
    .find((item) => item.type === type);
}

export function quizIndicatesIssue(definition: QuizDefinition, value: boolean): boolean {
  return issueQuizIsAbnormal(definition, value);
}
