import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useBusinessToday } from "@/composables/useBusinessToday";
import { businessDate, issuePlanDisplay } from "@/utils/issue-date";
import { displayOrg, displayRole, displayUser } from "@/utils/display";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("自然日到期提示", () => {
  it.each([
    ["2026-09-05", "2026-09-05", "今天到期", false],
    ["2026-09-04", "2026-09-05", "逾期 1 天", true],
    ["2026-09-06", "2026-09-05", "剩余 1 天", false],
    ["2026-08-31", "2026-09-01", "逾期 1 天", true],
    ["2027-01-01", "2026-12-31", "剩余 1 天", false],
    ["2024-02-29", "2024-03-01", "逾期 1 天", true],
  ])("%s 与 %s 的日期文字和颜色一致", (plan, today, text, overdue) => {
    expect(issuePlanDisplay({ plan_date: plan, status: "new" }, today)).toEqual({
      text: `${plan.replaceAll("-", "/")}（${text}）`, overdue,
    });
  });

  it("已完成不标逾期；无日期/非法日期不产生NaN或Invalid Date", () => {
    expect(issuePlanDisplay({ plan_date: "2026-09-04", status: "done" }, "2026-09-05")).toEqual({ text: "2026/09/04", overdue: false });
    expect(issuePlanDisplay({ plan_date: "", status: "new" }, "2026-09-05").text).toBe("—");
    for (const plan of ["not-a-date", "2026-02-29", "2026-13-01", "2026-9-5"]) {
      expect(issuePlanDisplay({ plan_date: plan, status: "pending" }, "2026-09-05")).toEqual({ text: "日期格式异常", overdue: false });
    }
  });

  it("北京时间而非访问者系统时区决定今天", () => {
    expect(businessDate(new Date("2026-09-04T16:00:00Z"))).toBe("2026-09-05");
    expect(businessDate(new Date("2026-09-04T15:59:59Z"))).toBe("2026-09-04");
  });

  it("跨午夜与窗口恢复后更新日期，卸载清理计时器", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-04T15:59:59Z"));
    const wrapper = mount({ setup: () => ({ today: useBusinessToday() }), template: "<span>{{ today }}</span>" });
    expect(wrapper.text()).toBe("2026-09-04");
    await vi.advanceTimersByTimeAsync(1100);
    expect(wrapper.text()).toBe("2026-09-05");
    vi.setSystemTime(new Date("2026-09-06T08:00:00Z"));
    window.dispatchEvent(new Event("focus"));
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toBe("2026-09-06");
    wrapper.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("关联名称兜底", () => {
  it("只用is_super_admin判断超管，不能由角色ID为0猜测身份", () => {
    expect(displayRole({ is_super_admin: true, role_id: 0 })).toBe("超级管理员");
    expect(displayRole({ is_super_admin: false, role_id: 0 })).toBe("—");
    expect(displayRole({ is_super_admin: false, role_id: 3, role_name: "操作员" })).toBe("操作员");
  });

  it("未设置ID与关联信息不可用明确区分", () => {
    expect(displayOrg(0, null)).toBe("—");
    expect(displayOrg(3, "区 / 街道")).toBe("区 / 街道");
    expect(displayOrg(3, null)).toBe("组织 #3（信息不可用）");
    expect(displayUser(1001, "")).toBe("用户 #1001（信息不可用）");
    expect(displayUser(1001, " 老用户 ")).toBe("老用户");
  });
});
