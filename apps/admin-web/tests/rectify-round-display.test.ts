import type { ApiClient, Issue, RectifyRecord } from "@gbnt/api-client";
import { shallowMount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { createIssuesApi } from "@/api/issues";
import type { AdminIssue } from "@/api/types";
import IssueDetailDrawer from "@/views/issues/IssueDetailDrawer.vue";

function record(id: number, round?: number): RectifyRecord {
  return { id, round, quiz_type: "water_out", note: `反馈 ${id}`, photos: [], created_at: "2026-09-01T10:00:00+08:00" } as unknown as RectifyRecord;
}

function issue(round: number | undefined, records: RectifyRecord[]): AdminIssue {
  return {
    id: 1, issue_key: "ISS-1", type: "well", status: "pending", rectify_round: round,
    org_id: 1, report_user_id: 2, assignee_user: 3, project_year: 2023,
    lat: 36, lng: 116, address: "街道机井", type_ext: { checklist: [] }, rectify_records: records,
  } as unknown as AdminIssue;
}

function api(value: unknown) {
  return createIssuesApi({ request: vi.fn().mockResolvedValue(value), raw: vi.fn() } as ApiClient);
}

describe("后台整改轮次展示", () => {
  it("详情保留所有历史，并逐条区分当前轮次与旧轮次", () => {
    const wrapper = shallowMount(IssueDetailDrawer, {
      props: { modelValue: true, issue: issue(2, [record(3, 2), record(2, 1), record(1, 0)]) },
      global: { renderStubDefaultSlot: true },
    });
    const tags = wrapper.findAllComponents({ name: "ElTag" }).map((tag) => tag.text());
    expect(tags).toEqual(expect.arrayContaining(["第 3 轮 · 本轮", "第 2 轮 · 历史", "第 1 轮 · 历史"]));
    expect(wrapper.findAllComponents({ name: "ElTimelineItem" })).toHaveLength(3);
    expect(wrapper.text()).toContain("反馈 1");
    expect(wrapper.findAllComponents({ name: "ElDescriptionsItem" }).find((entry) => entry.props("label") === "当前整改轮次")?.text()).toBe("第 3 轮");
    wrapper.unmount();
  });

  it("旧服务未提供轮次时兼容第1轮，响应更新后标签跟随新轮次", async () => {
    const wrapper = shallowMount(IssueDetailDrawer, {
      props: { modelValue: true, issue: issue(undefined, [record(1)]) },
      global: { renderStubDefaultSlot: true },
    });
    expect(wrapper.text()).toContain("第 1 轮 · 本轮");
    await wrapper.setProps({ issue: issue(1, [record(1)]) });
    expect(wrapper.text()).toContain("第 1 轮 · 历史");
    expect(wrapper.text()).not.toContain("第 1 轮 · 本轮");
    wrapper.unmount();
  });
});

describe("后台整改轮次 API 契约", () => {
  it("读取保留当前轮和历史轮，兼容缺少轮次的旧记录且不修改原响应", async () => {
    const oldRecord = Object.freeze(record(1));
    const raw = Object.freeze({ id: 1, rectify_round: 2, rectify_records: Object.freeze([record(2, 2), oldRecord]) });
    const value = await api(raw).get(1);
    expect(value.rectify_round).toBe(2);
    expect(value.rectify_records.map((entry) => entry.round)).toEqual([2, 0]);
    expect(oldRecord.round).toBeUndefined();
  });

  it.each([null, -1, 0.5, "1", Number.NaN])("非缺失的错误轮次不能被兜底成0：%s", async (round) => {
    await expect(api({ id: 1, rectify_round: round }).get(1)).rejects.toThrow("整改轮次格式异常");
    await expect(api({ id: 1, rectify_round: 1, rectify_records: [{ ...record(1), round }] }).get(1)).rejects.toThrow("历史整改轮次格式异常");
  });

  it("整改和重新整改的写入入口保留后端返回的轮次，不在前端推算状态", async () => {
    const result = issue(3, [record(1, 2)]);
    const request = vi.fn().mockResolvedValue(result);
    const client = createIssuesApi({ request, raw: vi.fn() } as ApiClient);
    expect(await client.rectify(1, { rectify_list: [{ type: "water_out", note: "已修", file_uuids: ["photo"] }] })).toBe(result);
    expect(await client.reRectify(1)).toBe(result);
    expect(request).toHaveBeenLastCalledWith("/api/issues/1/re-rectify", { method: "POST" });
    expect((result as Issue).status).toBe("pending");
  });
});
