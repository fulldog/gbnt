import { describe, expect, it } from "vitest";
import { issueDeadline, issueDeadlineHint } from "@/utils/issue-deadline";

const deadline = Date.parse("2026-09-10T00:00:00+08:00");
const hour = 3_600_000;
describe("首页精确倒计时", () => {
  it.each([
    [96, "primary", "剩余4天0时", 2],
    [95, "warning", "剩余3天23时", 1],
    [24, "warning", "剩余1天0时", 1],
    [23, "danger", "剩余0天23时", 0],
    [0, "danger", "已逾期0天0时", 0],
    [-25, "danger", "已逾期1天1时", 0],
  ])("剩余 %s 小时对应颜色、文字、分组一致", (hours, tone, label, group) => {
    expect(issueDeadlineHint({ status: "new", plan_date: "2026-09-09" }, deadline - Number(hours) * hour)).toEqual({ tone, label, group });
  });
  it("日期固定按北京时间日末换算，覆盖闰年与跨年", () => {
    expect(issueDeadline("2026-09-09")).toBe(deadline);
    expect(issueDeadline("2028-02-29")).toBe(Date.parse("2028-03-01T00:00:00+08:00"));
    expect(issueDeadline("2026-12-31")).toBe(Date.parse("2027-01-01T00:00:00+08:00"));
  });
  it.each(["2026-02-30", "2026-02-29", "", "bad-date", "2026-09-09T12:00:00"])("非法或缺失日期不参与正常倒计时：%s", (plan_date) => {
    expect(issueDeadlineHint({ status: "pending", plan_date }, deadline)).toMatchObject({ tone: "muted", group: 3 });
  });
  it("已完成记录不受历史计划日期影响", () => {
    expect(issueDeadlineHint({ status: "done", plan_date: "2020-01-01" }, deadline)).toEqual({ label: "已完成", tone: "success", group: 4 });
  });
});
