import type {
  Issue,
  IssueListResult,
  MineIssueListResult,
} from "@gbnt/api-client";
import { describe, expect, it, vi } from "vitest";
import { useMineIssueList } from "@/composables/mine/useMineIssueList";
import { usePagedIssues } from "@/composables/usePagedIssues";

vi.stubGlobal("uni", {
  stopPullDownRefresh: vi.fn(),
});

function issue(id: number): Issue {
  return { id } as Issue;
}

function issuePage(ids: number[], total = ids.length, page = 1): IssueListResult {
  return {
    list: ids.map(issue),
    total,
    page,
    size: 20,
  };
}

function minePage(
  ids: number[],
  total = ids.length,
  page = 1,
): MineIssueListResult {
  return {
    ...issuePage(ids, total, page),
    scope: "reported",
  };
}

describe("todo pagination state", () => {
  it("does not show records from a previous filter after a new filter fails", async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce(issuePage([1]))
      .mockRejectedValueOnce(new Error("筛选请求失败"));
    const state = usePagedIssues(loader);

    await state.reload();
    expect(state.items.value.map((item) => item.id)).toEqual([1]);

    await state.reload({ status: "done" });

    expect(state.filters.value.status).toBe("done");
    expect(state.items.value).toEqual([]);
    expect(state.error.value).toBe("筛选请求失败");
  });
});

describe("mine pagination state", () => {
  it("clears a superseded load-more flag when refresh starts", async () => {
    let finishLoadMore: ((value: MineIssueListResult) => void) | undefined;
    const pendingLoadMore = new Promise<MineIssueListResult>((resolve) => {
      finishLoadMore = resolve;
    });
    const loader = vi
      .fn()
      .mockResolvedValueOnce(minePage([1], 2))
      .mockReturnValueOnce(pendingLoadMore)
      .mockResolvedValueOnce(minePage([1], 2));
    const state = useMineIssueList("reported", loader);

    await state.loadFirstPage();
    const loadMorePromise = state.loadMore();
    expect(state.loadingMore.value).toBe(true);

    await state.loadFirstPage("refresh");
    expect(state.loadingMore.value).toBe(false);

    finishLoadMore?.(minePage([2], 2, 2));
    await loadMorePromise;
    expect(state.loadingMore.value).toBe(false);
    expect(state.items.value.map((item) => item.id)).toEqual([1]);
  });
});
