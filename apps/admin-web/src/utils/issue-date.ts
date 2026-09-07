import type { IssueStatus } from "@gbnt/api-client";

export const BUSINESS_TIME_ZONE = "Asia/Shanghai";
export const DAY_MS = 86_400_000;
const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
});

export function businessDate(now: Date = new Date()): string {
  const parts = formatter.formatToParts(now);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

/** 将合法日期转换为自然日序号，避免小时数、时区及夏令时造成差一天。 */
function dateDay(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const stamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== value) return null;
  return stamp / DAY_MS;
}

export function issuePlanDateDisplay(plan: string): string {
  if (!plan) return "—";
  return dateDay(plan) === null ? "日期格式异常" : plan.replaceAll("-", "/");
}

/** 倒计时独立于计划完成日期，已完成记录不再计算逾期。 */
export function issueCountdownDisplay(
  issue: { plan_date: string; status: IssueStatus },
  today: string,
): { text: string; overdue: boolean } {
  if (issue.status === "done") return { text: "已完成", overdue: false };
  const plan = issue.plan_date;
  if (!plan) return { text: "—", overdue: false };
  const planDay = dateDay(plan);
  const todayDay = dateDay(today);
  if (planDay === null || todayDay === null) return { text: "日期格式异常", overdue: false };
  const days = planDay - todayDay;
  if (days < 0) return { text: `逾期 ${-days} 天`, overdue: true };
  if (days === 0) return { text: "今天到期", overdue: false };
  return { text: `剩余 ${days} 天`, overdue: false };
}

/** 详情页继续使用日期与期限组合展示。 */
export function issuePlanDisplay(
  issue: { plan_date: string; status: IssueStatus },
  today: string,
): { text: string; overdue: boolean } {
  const date = issuePlanDateDisplay(issue.plan_date);
  if (!issue.plan_date || dateDay(issue.plan_date) === null || issue.status === "done") return { text: date, overdue: false };
  const countdown = issueCountdownDisplay(issue, today);
  if (dateDay(today) === null) return countdown;
  return { text: `${date}（${countdown.text}）`, overdue: countdown.overdue };
}
