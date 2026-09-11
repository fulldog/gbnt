import { describe, expect, it, vi } from "vitest";
import type { MiniappIssue, MiniappIssueListResult } from "@/api/types";
import { setupTodo, todoRegions } from "./helpers/todo-page";

function page(id: number, total = 1): MiniappIssueListResult {
  return { list: [{ id } as MiniappIssue], total, page: 1, size: 10 };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => { resolve = finish; });
  return { promise, resolve };
}


describe("待办列表区域刷新", () => {
  it("刷新保留筛选，等待记录和区划结束，重复下拉及同时触底不重复请求", async () => {
    const { state, loader, regions } = setupTodo();
    loader.mockResolvedValueOnce(page(1, 3));
    await state.loadRegions();
    await state.reload({ type: "well" });
    const rows = deferred<MiniappIssueListResult>();
    const tree = deferred<{ list: typeof todoRegions }>();
    loader.mockReturnValueOnce(rows.promise);
    regions.mockReturnValueOnce(tree.promise);

    const refreshing = state.refreshList();
    expect(state.refresherTriggered.value).toBe(true);
    await state.refreshList();
    await state.loadMore();
    expect(loader).toHaveBeenCalledTimes(2);
    expect(regions).toHaveBeenCalledTimes(2);
    tree.resolve({ list: todoRegions });
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(3));
    expect(loader).toHaveBeenLastCalledWith({ page: 1, size: 10, type: "well" });

    rows.resolve(page(2));
    await refreshing;
    expect(state.refresherTriggered.value).toBe(false);
  });

  it("刷新失败后收起下拉状态、保留旧记录，再次下拉可以恢复", async () => {
    const { state, loader, regions } = setupTodo();
    loader.mockResolvedValueOnce(page(1));
    await state.loadRegions();
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
    loader.mockResolvedValueOnce(page(1));
    await state.loadRegions();
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
