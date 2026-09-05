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

export function issuePlanDisplay(
  issue: { plan_date: string; status: IssueStatus },
  today: string,
): { text: string; overdue: boolean } {
  const plan = issue.plan_date;
  if (!plan) return { text: "—", overdue: false };
  const planDay = dateDay(plan);
  const todayDay = dateDay(today);
  if (planDay === null || todayDay === null) return { text: "日期格式异常", overdue: false };
  const date = plan.replaceAll("-", "/");
  if (issue.status === "done") return { text: date, overdue: false };
  const days = planDay - todayDay;
  if (days < 0) return { text: `${date}（逾期 ${-days} 天）`, overdue: true };
  if (days === 0) return { text: `${date}（今天到期）`, overdue: false };
  return { text: `${date}（剩余 ${days} 天）`, overdue: false };
}
