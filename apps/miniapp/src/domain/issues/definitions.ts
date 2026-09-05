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

export interface QuizDefinition {
  type: QuizType;
  label: string;
  help: string;
  negative: boolean;
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

export const QUIZ_DEFINITIONS: Readonly<Record<IssueType, readonly QuizDefinition[]>> = {
  well: [
    {
      type: "water_out",
      label: "机井是否出水",
      help: "选择“是”时须现场拍摄至少两张照片，首张与第二张间隔不少于 60 秒。",
      negative: false,
    },
    {
      type: "pipe_ok",
      label: "管道是否按要求连接",
      help: "选择“否”表示存在问题。",
      negative: false,
    },
    {
      type: "wiring_ok",
      label: "走线是否规范",
      help: "选择“否”表示存在问题。",
      negative: false,
    },
    {
      type: "box_ok",
      label: "配电箱是否完好",
      help: "选择“否”表示存在问题。",
      negative: false,
    },
    {
      type: "cover_ok",
      label: "井台、井盖是否完整",
      help: "选择“否”表示存在问题。",
      negative: false,
    },
    {
      type: "transformer_ok",
      label: "变压器是否完好",
      help: "选择“否”表示存在问题。",
      negative: false,
    },
  ],
  road: [
    {
      type: "has_shoulder",
      label: "是否有路肩",
      help: "选择“否”表示存在问题。",
      negative: false,
    },
    {
      type: "has_ash",
      label: "是否有灰土层",
      help: "选择“否”表示存在问题。",
      negative: false,
    },
  ],
  bridge: [
    {
      type: "needs_rectify",
      label: "是否需要整改",
      help: "选择“是”表示存在问题。",
      negative: true,
    },
  ],
  forest: [
    {
      type: "broken_belt",
      label: "林带是否断带",
      help: "选择“是”表示存在问题。",
      negative: true,
    },
    {
      type: "dead_trees",
      label: "是否有枯死木",
      help: "选择“是”表示存在问题。",
      negative: true,
    },
    {
      type: "pest",
      label: "是否发现病虫害",
      help: "选择“是”表示存在问题。",
      negative: true,
    },
  ],
  transformer: [
    {
      type: "powered",
      label: "是否通电",
      help: "选择“否”表示存在问题。",
      negative: false,
    },
    {
      type: "device_ok",
      label: "设备是否完好",
      help: "选择“否”表示存在问题。",
      negative: false,
    },
    {
      type: "cabinet_ok",
      label: "配电设施是否完好",
      help: "选择“否”表示存在问题。",
      negative: false,
    },
    {
      type: "illegal_wire",
      label: "是否私拉乱接",
      help: "选择“是”表示存在问题。",
      negative: true,
    },
  ],
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
  return definition.negative ? value : !value;
}
