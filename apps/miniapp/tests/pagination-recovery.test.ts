import { describe, expect, it, vi } from "vitest";
import type { MiniappIssue, MiniappIssueListResult, MiniappMineIssueListResult } from "@/api/types";
import { usePagedIssues } from "@/composables/usePagedIssues";
import { useMineIssueList } from "@/composables/mine/useMineIssueList";

vi.stubGlobal("uni", { stopPullDownRefresh: vi.fn() });

function page(ids: number[], total = ids.length, number = 1): MiniappIssueListResult {
  return { list: ids.map((id) => ({ id } as MiniappIssue)), total, page: number, size: 20 };
}
function mine(ids: number[], total = ids.length, number = 1): MiniappMineIssueListResult {
  return { ...page(ids, total, number), scope: "reported" };
}

describe("todo retry retains request intent", () => {
  it("retains previous rows and total after refresh failure, then retries page one even when there is no next page", async () => {
    const loader = vi.fn().mockResolvedValueOnce(page([1])).mockRejectedValueOnce(new Error("网络断开")).mockResolvedValueOnce(page([2]));
    const state = usePagedIssues(loader);
    await state.reload();
    await state.reload();
    expect(state.items.value.map((row) => row.id)).toEqual([1]);
    expect(state.total.value).toBe(1);
    expect(state.page.value).toBe(1);
    expect(state.isStale.value).toBe(true);
    expect(state.hasMore.value).toBe(false);
    await state.retry();
    expect(loader.mock.calls[2][0].page).toBe(1);
    expect(state.items.value.map((row) => row.id)).toEqual([2]);
    expect(state.isStale.value).toBe(false);
  });

  it("retries the failed next page and does not automatically advance while refresh has failed", async () => {
    const loader = vi.fn().mockResolvedValueOnce(page([1], 3)).mockRejectedValueOnce(new Error("弱网")).mockResolvedValueOnce(page([2], 3, 2));
    const state = usePagedIssues(loader);
    await state.reload();
    await state.loadMore();
    await state.loadMore();
    expect(loader).toHaveBeenCalledTimes(2);
    await state.retry();
    expect(loader.mock.calls[2][0].page).toBe(2);
    expect(state.items.value.map((row) => row.id)).toEqual([1, 2]);
  });

  it("does not put obsolete filter data back after retry or invalidation", async () => {
    let resolveOld: (result: MiniappIssueListResult) => void = () => {};
    const loader = vi.fn().mockImplementationOnce(() => new Promise<MiniappIssueListResult>((resolve) => { resolveOld = resolve; })).mockResolvedValueOnce(page([2]));
    const state = usePagedIssues(loader);
    const old = state.reload();
    await state.reload({ status: "done" });
    resolveOld(page([1]));
    await old;
    expect(state.items.value.map((row) => row.id)).toEqual([2]);
    expect(state.filters.value.status).toBe("done");
    expect(state.isLoading.value).toBe(false);
  });
});

describe("mine list retry and lifecycle", () => {
  it("retries a failed refresh even when all rows were previously loaded", async () => {
    const loader = vi.fn().mockResolvedValueOnce(mine([1])).mockRejectedValueOnce(new Error("超时")).mockResolvedValueOnce(mine([]));
    const state = useMineIssueList("reported", loader);
    await state.loadFirstPage();
    await state.loadFirstPage("refresh");
    expect(state.total.value).toBe(1);
    expect(state.isStale.value).toBe(true);
    await state.retry();
    expect(loader.mock.calls[2][0].page).toBe(1);
    expect(state.items.value).toEqual([]);
    expect(state.total.value).toBe(0);
    expect(state.isStale.value).toBe(false);
  });

  it("retries load-more using the failed page, retaining existing rows", async () => {
    const loader = vi.fn().mockResolvedValueOnce(mine([1], 2)).mockRejectedValueOnce(new Error("超时")).mockResolvedValueOnce(mine([2], 2, 2));
    const state = useMineIssueList("reported", loader);
    await state.loadFirstPage();
    await state.loadMore();
    await state.retry();
    expect(loader.mock.calls[2][0].page).toBe(2);
    expect(state.items.value.map((row) => row.id)).toEqual([1, 2]);
  });

  it("ignores responses after page unload", async () => {
    let finish: (result: MiniappMineIssueListResult) => void = () => {};
    const loader = vi.fn(() => new Promise<MiniappMineIssueListResult>((resolve) => { finish = resolve; }));
    const state = useMineIssueList("reported", loader);
    const pending = state.loadFirstPage();
    state.invalidate();
    finish(mine([1]));
    await pending;
    expect(state.items.value).toEqual([]);
    expect(state.initialLoading.value).toBe(false);
  });
});
