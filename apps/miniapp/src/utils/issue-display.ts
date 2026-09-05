import type {
  FileItem,
  Issue,
  IssueStatus,
  QuizBool,
  QuizType,
} from "@gbnt/api-client";
import {
  ISSUE_TYPE_OPTIONS as DOMAIN_ISSUE_TYPE_OPTIONS,
  quizDefinition,
  quizIndicatesIssue as definitionIndicatesIssue,
} from "@/domain/issues/definitions";

export type DisplayTone = "primary" | "success" | "warning" | "danger" | "muted";

export interface DisplayMeta<TValue extends string> {
  label: string;
  tone: DisplayTone;
  value: TValue;
}

export interface IssueInfoRow {
  label: string;
  value: string;
}

const ISSUE_STATUS_META: Record<IssueStatus, DisplayMeta<IssueStatus>> = {
  new: { label: "待整改", tone: "danger", value: "new" },
  pending: { label: "整改中", tone: "warning", value: "pending" },
  done: { label: "已整改", tone: "success", value: "done" },
};

export const ISSUE_FILTER_TYPE_OPTIONS = [
  { label: "全部类型", value: "all" },
  ...DOMAIN_ISSUE_TYPE_OPTIONS,
] as const;

export const ISSUE_STATUS_OPTIONS = [
  { label: "全部状态", value: "all" },
  ...Object.values(ISSUE_STATUS_META).map(({ value, label }) => ({ value, label })),
] as const;

export function issueStatusMeta(status: IssueStatus): DisplayMeta<IssueStatus> {
  return ISSUE_STATUS_META[status];
}

export function quizLabel(type: QuizType): string {
  return quizDefinition(type)?.label ?? type;
}

export function quizIndicatesIssue(quiz: QuizBool): boolean {
  const definition = quizDefinition(quiz.type);
  return definition ? definitionIndicatesIssue(definition, quiz.value) : false;
}

export function issueAbnormalQuizzes(issue: Issue): QuizBool[] {
  const checklist = issue.type_ext.checklist as readonly QuizBool[];
  return checklist.filter(quizIndicatesIssue);
}

export function issueEditableRectifyQuizzes(issue: Issue): QuizBool[] {
  const abnormal = issueAbnormalQuizzes(issue);
  const covered = new Set(issue.rectify_records.map((record) => record.quiz_type));
  const outstanding = abnormal.filter((quiz) => !covered.has(quiz.type));

  // 重新整改不会清除历史记录。此时历史已覆盖全部异常项，但仍需允许用户选择本轮整改项。
  if (issue.status === "pending" && abnormal.length > 0 && outstanding.length === 0) {
    return abnormal;
  }
  return outstanding;
}

export function formatDateTime(value: string): string {
  if (!value) return "—";
  return value.replace("T", " ").replace(/\.\d{3,}Z?$/, "").replace(/Z$/, "").slice(0, 16);
}

export function formatDate(value: string): string {
  if (!value) return "—";
  return value.slice(0, 10);
}

function currentLocalDate(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function issuePlanHint(issue: Issue): DisplayMeta<"plan"> {
  if (issue.status === "done") {
    return { label: "已完成", tone: "success", value: "plan" };
  }
  const planDate = formatDate(issue.plan_date);
  if (planDate === "—") {
    return { label: "未设置计划日期", tone: "muted", value: "plan" };
  }

  const today = currentLocalDate();
  const diffMs = new Date(`${planDate}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime();
  const diffDays = Math.round(diffMs / 86_400_000);
  if (diffDays < 0) {
    return { label: `逾期 ${Math.abs(diffDays)} 天`, tone: "danger", value: "plan" };
  }
  if (diffDays === 0) {
    return { label: "今日到期", tone: "warning", value: "plan" };
  }
  return { label: `${diffDays} 天后到期`, tone: "primary", value: "plan" };
}

function withUnit(value: number, unit: string): string {
  return `${value} ${unit}`;
}

function optionalText(value: string): string {
  return value.trim() || "—";
}

export function issueTypeInfoRows(issue: Issue): IssueInfoRow[] {
  let rows: IssueInfoRow[];

  switch (issue.type) {
    case "well": {
      const ext = issue.type_ext;
      rows = [
        { label: "建设类型", value: ext.build_kind === "new" ? "新建" : "配套" },
        { label: "出水口总数", value: withUnit(ext.outlet_total, "个") },
        { label: "出水口损坏", value: withUnit(ext.outlet_damaged, "个") },
        { label: "护筒总数", value: withUnit(ext.casing_total, "个") },
        { label: "护筒损坏", value: withUnit(ext.casing_damaged, "个") },
      ];
      break;
    }
    case "road": {
      const ext = issue.type_ext;
      rows = [
        { label: "长度", value: withUnit(ext.length, "千米") },
        { label: "宽度", value: withUnit(ext.width, "米") },
        { label: "厚度", value: withUnit(ext.thickness, "米") },
        { label: "林网存活数量", value: withUnit(ext.tree_survive, "棵") },
      ];
      break;
    }
    case "bridge": {
      const ext = issue.type_ext;
      rows = [
        {
          label: "设施类型",
          value: { bridge: "桥", culvert: "涵", gate: "闸" }[ext.kind],
        },
        { label: "长度", value: withUnit(ext.length, "米") },
        { label: "宽度", value: withUnit(ext.width, "米") },
      ];
      break;
    }
    case "forest": {
      const ext = issue.type_ext;
      rows = [
        { label: "移交株数", value: withUnit(ext.handover_count, "株") },
        { label: "现有株数", value: withUnit(ext.existing_count, "株") },
        { label: "存活率", value: withUnit(ext.survive_rate, "%") },
      ];
      break;
    }
    case "transformer": {
      const ext = issue.type_ext;
      rows = [
        { label: "容量", value: withUnit(ext.capacity, "kVA") },
        { label: "型号", value: optionalText(ext.model) },
        { label: "电压等级", value: ext.voltage === "10kv" ? "10 kV" : "0.4 kV" },
      ];
      break;
    }
  }

  const ext = issue.type_ext;
  rows.push(
    { label: "负责人", value: optionalText(ext.keeper_name) },
    { label: "联系电话", value: optionalText(ext.keeper_phone) },
  );
  return rows;
}

export function issueChecklistPhotos(issue: Issue): FileItem[] {
  const seen = new Set<string>();
  const photos: FileItem[] = [];

  const checklist = issue.type_ext.checklist as readonly QuizBool[];
  for (const quiz of checklist) {
    for (const photo of quiz.photos ?? []) {
      const key = photo.file_id || photo.url;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      photos.push(photo);
    }
  }
  return photos;
}

export function hasValidCoordinates(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

export function errorMessage(error: unknown, fallback = "操作失败，请稍后重试"): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
