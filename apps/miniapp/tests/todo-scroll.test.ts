import { describe, expect, it, vi } from "vitest";
import { shallowRef, type Ref } from "vue";
import type { MiniappIssue, MiniappIssueListResult } from "@/api/types";
import { usePagedIssues } from "@/composables/usePagedIssues";
import * as issueDisplay from "@/utils/issue-display";
import { setupSfc } from "./helpers/setup-sfc";

function page(id: number, total = 1): MiniappIssueListResult {
  return { list: [{ id } as MiniappIssue], total, page: 1, size: 10 };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => { resolve = finish; });
  return { promise, resolve };
}

function setupTodo() {
  const loader = vi.fn().mockResolvedValue(page(1));
  const regions = vi.fn().mockResolvedValue({ list: [] });
  let unload = () => {};
  const state = setupSfc("pages/todo/index.vue", {}, {
    "@/components/common/PageTopInset.vue": {},
    "@dcloudio/uni-app": {
      onLoad: vi.fn(), onShow: vi.fn(), onShareAppMessage: vi.fn(), onShareTimeline: vi.fn(),
      onUnload: (callback: () => void) => { unload = callback; },
    },
    "@/api/runtime": { miniappApi: { regions: { list: regions } } },
    "@/components/issue/IssueCard.vue": {},
    "@/components/region/RegionPicker.vue": {},
    "@/composables/usePagedIssues": { usePagedIssues: () => usePagedIssues(loader) },
    "@/composables/useBusinessToday": { useBusinessToday: () => shallowRef("2026-09-09") },
    "@/utils/issue-display": issueDisplay,
  }) as unknown as ReturnType<typeof usePagedIssues> & {
    refreshList: () => Promise<void>;
    refresherTriggered: Ref<boolean>;
  };
  return { state, loader, regions, unload: () => unload() };
}

describe("待办列表区域刷新", () => {
  it("刷新保留筛选，等待记录和区划结束，重复下拉及同时触底不重复请求", async () => {
    const { state, loader, regions } = setupTodo();
    loader.mockResolvedValueOnce(page(1, 3));
    await state.reload({ type: "well", orgId: 12 });
    const rows = deferred<MiniappIssueListResult>();
    const tree = deferred<{ list: [] }>();
    loader.mockReturnValueOnce(rows.promise);
    regions.mockReturnValueOnce(tree.promise);

    const refreshing = state.refreshList();
    expect(state.refresherTriggered.value).toBe(true);
    await state.refreshList();
    await state.loadMore();
    expect(loader).toHaveBeenCalledTimes(2);
    expect(regions).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenLastCalledWith({ page: 1, size: 10, type: "well", org_id: 12 });

    rows.resolve(page(2));
    await vi.waitFor(() => expect(state.items.value.map((row) => row.id)).toEqual([2]));
    expect(state.refresherTriggered.value).toBe(true);
    tree.resolve({ list: [] });
    await refreshing;
    expect(state.refresherTriggered.value).toBe(false);
  });

  it("刷新失败后收起下拉状态、保留旧记录，再次下拉可以恢复", async () => {
    const { state, loader, regions } = setupTodo();
    await state.reload();
    loader.mockRejectedValueOnce(new Error("网络断开"));
    regions.mockRejectedValueOnce(new Error("区划请求失败"));
    await state.refreshList();
    expect(state.refresherTriggered.value).toBe(false);
    expect(state.items.value.map((row) => row.id)).toEqual([1]);
    expect(state.isStale.value).toBe(true);

    loader.mockResolvedValueOnce(page(2));
    await state.refreshList();
    expect(state.refresherTriggered.value).toBe(false);
    expect(state.items.value.map((row) => row.id)).toEqual([2]);
    expect(state.isStale.value).toBe(false);
  });

  it("刷新途中退出页面会停止刷新状态并忽略迟到数据", async () => {
    const { state, loader, unload } = setupTodo();
    await state.reload();
    const rows = deferred<MiniappIssueListResult>();
    loader.mockReturnValueOnce(rows.promise);
    const refreshing = state.refreshList();
    unload();
    expect(state.refresherTriggered.value).toBe(false);
    rows.resolve(page(2));
    await refreshing;
    expect(state.items.value.map((row) => row.id)).toEqual([1]);
    expect(state.refresherTriggered.value).toBe(false);
  });
});
