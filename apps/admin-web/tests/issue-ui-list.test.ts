import { flushPromises, shallowMount } from "@vue/test-utils";
import { ElMessageBox } from "element-plus";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adminApiKey } from "@/api/runtime";
import type { AdminIssue, AdminIssueListResult } from "@/api/types";
import IssueDetailDrawer from "@/views/issues/IssueDetailDrawer.vue";
import IssueFormDialog from "@/views/issues/IssueFormDialog.vue";
import IssuesView from "@/views/issues/IssuesView.vue";

vi.mock("@/stores/permission", () => ({ usePermissionStore: () => ({ can: () => true }) }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function issue(id: number): AdminIssue {
  return {
    id, issue_key: `ISSUE-${id}`, type: "well", org_id: 9, report_user_id: 1, assignee_user: 2,
    report_user_name: "上报姓名", assignee_user_name: "整改姓名", org_path: "区 / 街道 / 村",
    status: "new", plan_date: "2026-09-05", type_ext: { checklist: [] }, rectify_records: [],
  } as unknown as AdminIssue;
}
function rows(...list: AdminIssue[]): AdminIssueListResult {
  return { list, total: list.length, page: 1, size: 20 };
}
interface ViewState {
  filters: { keyword: string };
  page: number;
  detailVisible: boolean;
  load: () => Promise<void>;
  search: () => void;
  openDetail: (issue: AdminIssue) => Promise<void>;
  removeIssue: (issue: AdminIssue) => Promise<void>;
}
function mountView(overrides = {}) {
  const api = {
    issues: { list: vi.fn().mockResolvedValue(rows()), listOrgOptions: vi.fn().mockResolvedValue([]), get: vi.fn().mockImplementation((id: number) => Promise.resolve(issue(id))), remove: vi.fn().mockResolvedValue(undefined), ...overrides },
    users: { list: vi.fn() }, orgs: { list: vi.fn() },
  };
  const wrapper = shallowMount(IssuesView, { global: { provide: { [adminApiKey as symbol]: api } } });
  const state = wrapper.vm as unknown as ViewState;
  return { wrapper, state, api };
}
afterEach(() => vi.restoreAllMocks());

describe("专项整改读取状态", () => {
  it("无系统字典请求，快速搜索只接收最后一次结果且首尾去空白", async () => {
    const old = deferred<AdminIssueListResult>();
    const latest = deferred<AdminIssueListResult>();
    const list = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    const { wrapper, state, api } = mountView({ list });
    state.page = 3;
    state.filters.keyword = "  ISSUE-2  ";
    state.search();
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ keyword: "ISSUE-2", page: 1 }));
    expect(wrapper.findComponent({ name: "ElTable" }).props("data")).toEqual([]);
    latest.resolve(rows(issue(2)));
    await flushPromises();
    old.reject(new Error("旧请求失败"));
    await flushPromises();
    expect(wrapper.findComponent({ name: "ElTable" }).props("data")).toEqual([issue(2)]);
    expect(api.users.list).not.toHaveBeenCalled();
    expect(api.orgs.list).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("失败时不保留旧行或旧总数", async () => {
    const { wrapper, state } = mountView({ list: vi.fn().mockResolvedValueOnce(rows(issue(1))).mockRejectedValueOnce(new Error("断网")) });
    await flushPromises();
    await state.load();
    await flushPromises();
    expect(wrapper.findComponent({ name: "ElTable" }).props("data")).toEqual([]);
    expect(wrapper.findComponent({ name: "ElPagination" }).exists()).toBe(false);
    expect(wrapper.text()).not.toContain("共 0 条记录");
    wrapper.unmount();
  });

  it("详情快速切换和关闭时，不接受过期详情", async () => {
    const old = deferred<AdminIssue>();
    const latest = deferred<AdminIssue>();
    const { wrapper, state } = mountView({ get: vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise) });
    const first = state.openDetail(issue(1));
    const second = state.openDetail(issue(2));
    latest.resolve(issue(2));
    await second;
    old.resolve(issue(1));
    await first;
    await flushPromises();
    expect(wrapper.findComponent(IssueDetailDrawer).props("issue")).toEqual(issue(2));
    state.detailVisible = false;
    await flushPromises();
    expect(wrapper.findComponent(IssueDetailDrawer).props("issue")).toBeNull();
    wrapper.unmount();
  });

  it("删除末页后退回有效页重新查询", async () => {
    // Element Plus 声明将输入框结果和 Action 写为交叉类型；confirm 的实际成功值是字符串。
    vi.spyOn(ElMessageBox, "confirm").mockResolvedValue("confirm" as Awaited<ReturnType<typeof ElMessageBox.confirm>>);
    const list = vi.fn().mockResolvedValueOnce({ list: [issue(21)], total: 21, page: 2, size: 20 })
      .mockResolvedValueOnce({ list: [], total: 20, page: 2, size: 20 })
      .mockResolvedValueOnce({ list: [issue(1)], total: 20, page: 1, size: 20 });
    const { wrapper, state, api } = mountView({ list });
    await flushPromises();
    state.page = 2;
    await state.removeIssue(issue(21));
    await flushPromises();
    expect(api.issues.remove).toHaveBeenCalledWith(21);
    expect(state.page).toBe(1);
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
    expect(wrapper.findComponent({ name: "ElTable" }).props("data")).toEqual([issue(1)]);
    wrapper.unmount();
  });

  it("写入成功后重新读取管理端详情和列表", async () => {
    const { wrapper, api } = mountView();
    await flushPromises();
    wrapper.findComponent(IssueFormDialog).vm.$emit("saved", 123);
    await flushPromises();
    expect(api.issues.get).toHaveBeenCalledWith(123);
    expect(api.issues.list).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
});

describe("专项整改详情名称", () => {
  it("只使用业务响应提供的姓名与组织路径", () => {
    const wrapper = shallowMount(IssueDetailDrawer, {
      props: { modelValue: true, issue: issue(1) },
      global: { renderStubDefaultSlot: true },
    });
    expect(wrapper.text()).toContain("上报姓名");
    expect(wrapper.text()).toContain("整改姓名");
    expect(wrapper.text()).toContain("区 / 街道 / 村");
    wrapper.unmount();
  });
});
