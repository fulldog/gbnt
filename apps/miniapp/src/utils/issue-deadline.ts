import type { Issue } from "@gbnt/api-client";
import { calendarDate } from "./business-date";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** 计划日按北京时间当天结束截止，严格拒绝历史非法日期。 */
export function issueDeadline(planDate: string): number | null {
  if (calendarDate(planDate) !== planDate) return null;
  const date = Date.parse(`${planDate}T00:00:00+08:00`);
  return Number.isFinite(date) ? date + DAY : null;
}

export function issueDeadlineHint(issue: Pick<Issue, "status" | "plan_date">, now = Date.now()) {
  if (issue.status === "done") return { label: "已完成", tone: "success" as const, group: 4 };
  const deadline = issueDeadline(issue.plan_date);
  if (deadline === null) return { label: issue.plan_date ? "计划日期异常" : "未设置计划日期", tone: "muted" as const, group: 3 };
  const remaining = deadline - now;
  const days = Math.floor(remaining / DAY);
  const group = days <= 0 ? 0 : days <= 3 ? 1 : 2;
  const hours = Math.floor(Math.abs(remaining) / HOUR);
  const duration = `${Math.floor(hours / 24)}天${hours % 24}时`;
  return {
    label: remaining <= 0 ? `已逾期${duration}` : `剩余${duration}`,
    tone: group === 0 ? "danger" as const : group === 1 ? "warning" as const : "primary" as const,
    group,
  };
}
