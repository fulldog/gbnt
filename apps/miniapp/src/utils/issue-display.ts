import type {
  FileItem,
  Issue,
  IssueStatus,
  QuizBool,
  QuizType,
} from "@gbnt/api-client";
import type { MiniappIssue } from "@/api/types";
import { businessDateTime, businessToday, calendarDate, calendarDayDifference } from "./business-date";
import {
  ISSUE_TYPE_OPTIONS as DOMAIN_ISSUE_TYPE_OPTIONS,
  quizDefinition,
  QUIZ_DEFINITIONS,
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
  return ISSUE_STATUS_META[status] ?? { label: "状态异常", tone: "danger", value: status };
}

export function quizLabel(type: QuizType): string {
  return quizDefinition(type)?.label ?? type;
}

export function quizIndicatesIssue(quiz: QuizBool): boolean {
  const definition = quizDefinition(quiz.type);
  return definition ? definitionIndicatesIssue(definition, quiz.value) : false;
}

export function issueAbnormalQuizzes(issue: Issue): QuizBool[] {
  const checklist = Array.isArray(issue.type_ext?.checklist) ? issue.type_ext.checklist as readonly QuizBool[] : [];
  return checklist.filter(quizIndicatesIssue);
}

export function issueEditableRectifyQuizzes(issue: Issue): QuizBool[] {
  const abnormal = issueAbnormalQuizzes(issue);
  const records = Array.isArray(issue.rectify_records) ? issue.rectify_records : [];
  const covered = new Set(records
    .filter((record) => (record.round ?? 0) === (issue.rectify_round ?? 0))
    .map((record) => record.quiz_type));
  const outstanding = abnormal.filter((quiz) => !covered.has(quiz.type));

  // 重新整改不会清除历史记录。此时历史已覆盖全部异常项，但仍需允许用户选择本轮整改项。
  if (issue.rectify_round === undefined && issue.status === "pending" && abnormal.length > 0 && outstanding.length === 0) {
    return abnormal;
  }
  return outstanding;
}

export function formatDateTime(value: string): string {
  return businessDateTime(value) ?? "—";
}

export function formatDate(value: string): string {
  return calendarDate(value) ?? "—";
}

export function issuePlanHint(issue: Issue, today = businessToday()): DisplayMeta<"plan"> {
  if (issue.status === "done") {
    return { label: "已完成", tone: "success", value: "plan" };
  }
  const planDate = formatDate(issue.plan_date);
  if (planDate === "—") {
    return { label: issue.plan_date ? "计划日期异常" : "未设置计划日期", tone: "muted", value: "plan" };
  }

  const diffDays = calendarDayDifference(planDate, today);
  if (diffDays === null) return { label: "计划日期异常", tone: "muted", value: "plan" };
  if (diffDays < 0) {
    return { label: `逾期 ${Math.abs(diffDays)} 天`, tone: "danger", value: "plan" };
  }
  if (diffDays === 0) {
    return { label: "今日到期", tone: "warning", value: "plan" };
  }
  return { label: `${diffDays} 天后到期`, tone: "primary", value: "plan" };
}

function withUnit(value: number, unit: string): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value} ${unit}` : "未填写";
}

function optionalText(value: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : "未填写";
}

export function issueTypeInfoRows(issue: Issue): IssueInfoRow[] {
  let rows: IssueInfoRow[];

  switch (issue.type) {
    case "well": {
      const ext = issue.type_ext;
      rows = [
        { label: "建设类型", value: { new: "新建", match: "配套" }[ext.build_kind] ?? "未填写" },
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
          value: { bridge: "桥", culvert: "涵", gate: "闸" }[ext.kind] ?? "未填写",
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
        { label: "电压等级", value: { "10kv": "10 kV", "0.4kv": "0.4 kV" }[ext.voltage] ?? "未填写" },
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

  const checklist = Array.isArray(issue.type_ext?.checklist) ? issue.type_ext.checklist as readonly QuizBool[] : [];
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

export function issueSummary(issue: Issue): string {
  const checklist = issue.type_ext?.checklist;
  if (!Array.isArray(checklist) || checklist.length !== QUIZ_DEFINITIONS[issue.type]?.length) return "巡查数据异常，请联系管理员核对";
  const descriptions = issueAbnormalQuizzes(issue).map((quiz) => quiz.desc?.trim() || `${quizLabel(quiz.type)}：${quiz.value ? "是" : "否"}`);
  if (issue.type === "well") {
    if (issue.type_ext.outlet_damaged > 0) descriptions.push(`出水口损坏 ${issue.type_ext.outlet_damaged} 个`);
    if (issue.type_ext.casing_damaged > 0) descriptions.push(`护筒损坏 ${issue.type_ext.casing_damaged} 个`);
  }
  return descriptions.join("；") || (issue.status === "done" ? "未记录异常题项" : "暂无问题摘要，请查看详情核对");
}

export function issueReporter(issue: Partial<MiniappIssue>): string {
  return issue.report_user_name?.trim() || (issue.report_user_id ? "上报人资料暂缺" : "未填写上报人");
}

export function issueOrganization(issue: Partial<MiniappIssue>): string {
  return issue.org_path?.trim() || issue.org_name?.trim() || "所属区域资料暂缺";
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
