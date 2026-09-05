import { describe, expect, it } from "vitest";
import type { Issue } from "@gbnt/api-client";
import { businessToday, calendarDate, calendarDayDifference, millisecondsUntilBusinessMidnight } from "@/utils/business-date";
import { formatDateTime, issueEditableRectifyQuizzes, issuePlanHint, issueSummary } from "@/utils/issue-display";

function issue(patch: Record<string, unknown> = {}): Issue {
  return {
    type: "road", status: "pending", plan_date: "2026-09-06", rectify_round: 1,
    type_ext: { checklist: [
      { type: "has_shoulder", value: false, desc: "路肩塌陷" },
      { type: "has_ash", value: false, desc: "灰土层缺失" },
    ] },
    rectify_records: [], ...patch,
  } as unknown as Issue;
}

describe("business date display", () => {
  it("uses Asia/Shanghai for instants independently of the device timezone", () => {
    expect(businessToday(Date.parse("2026-09-05T16:00:00Z"))).toBe("2026-09-06");
    expect(formatDateTime("2026-09-05T16:12:00Z")).toBe("2026-09-06 00:12");
    expect(formatDateTime("2026-09-05T16:12:00+08:00")).toBe("2026-09-05 16:12");
    expect(formatDateTime("2026-09-05 16:12:00")).toBe("2026-09-05 16:12");
  });

  it.each(["garbage", "2026-02-30", "0001-01-01T00:00:00Z", "2026-13-01"])("never displays invalid dates as NaN: %s", (date) => {
    expect(calendarDate(date)).toBeNull();
    expect(formatDateTime(date)).toBe("—");
    expect(issuePlanHint(issue({ plan_date: date }), "2026-09-05").label).toBe("计划日期异常");
  });

  it("handles leap days and plan calendar dates without timezone shifts", () => {
    expect(calendarDate("2024-02-29")).toBe("2024-02-29");
    expect(calendarDayDifference("2024-03-01", "2024-02-29")).toBe(1);
    expect(issuePlanHint(issue(), "2026-09-05").label).toBe("1 天后到期");
    expect(issuePlanHint(issue(), "2026-09-06").label).toBe("今日到期");
    expect(issuePlanHint(issue(), "2026-09-07").label).toBe("逾期 1 天");
    expect(millisecondsUntilBusinessMidnight(Date.parse("2026-09-05T15:59:59Z"))).toBe(1100);
  });
});

describe("safe issue summary and rectify round display", () => {
  it("shows a clear data warning for missing historical checklist", () => {
    expect(issueSummary(issue({ type_ext: {} }))).toContain("数据异常");
    expect(issueSummary(issue())).toBe("路肩塌陷；灰土层缺失");
  });

  it("does not count previous rounds as completed in the current round", () => {
    const current = issue({ rectify_round: 2, rectify_records: [
      { round: 1, quiz_type: "has_shoulder" }, { round: 1, quiz_type: "has_ash" },
      { round: 2, quiz_type: "has_shoulder" },
    ] });
    expect(issueEditableRectifyQuizzes(current).map((quiz) => quiz.type)).toEqual(["has_ash"]);
  });

  it("does not offer already-completed current-round items even when status is pending", () => {
    const current = issue({ rectify_records: [{ round: 1, quiz_type: "has_shoulder" }, { round: 1, quiz_type: "has_ash" }] });
    expect(issueEditableRectifyQuizzes(current)).toEqual([]);
  });

  it("keeps the legacy reopen fallback only for old responses without round metadata", () => {
    const legacy = issue({ rectify_round: undefined, rectify_records: [{ quiz_type: "has_shoulder" }, { quiz_type: "has_ash" }] });
    expect(issueEditableRectifyQuizzes(legacy)).toHaveLength(2);
  });
});
