import type {
  Issue,
  MineIssueListResult,
  MineIssueQuery,
  MineScope,
} from "@gbnt/api-client";
import { computed, shallowRef } from "vue";
import { miniappApi } from "@/api/runtime";

export interface MineScopeMeta {
  title: string;
  empty: string;
}

export const MINE_SCOPE_META: Record<MineScope, MineScopeMeta> = {
  reported: { title: "我上报", empty: "暂无上报记录" },
  pending: { title: "待整改", empty: "暂无待整改记录" },
  done: { title: "已整改", empty: "暂无已整改记录" },
};

export function normalizeMineScope(value: unknown): MineScope {
  return value === "pending" || value === "done" ? value : "reported";
}

function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "清单加载失败";
}

export type MineIssueListLoader = (
  query: MineIssueQuery,
) => Promise<MineIssueListResult>;

export function useMineIssueList(
  initialScope: MineScope = "reported",
  loader: MineIssueListLoader = miniappApi.mine.listIssues,
) {
  const scope = shallowRef(initialScope);
  const items = shallowRef<Issue[]>([]);
  const page = shallowRef(1);
  const total = shallowRef(0);
  const initialLoading = shallowRef(false);
  const refreshing = shallowRef(false);
  const loadingMore = shallowRef(false);
  const errorMessage = shallowRef("");
  const requestVersion = shallowRef(0);

  const scopeMeta = computed(() => MINE_SCOPE_META[scope.value]);
  const hasMore = computed(() => items.value.length < total.value);
  const isEmpty = computed(
    () => !initialLoading.value && !errorMessage.value && items.value.length === 0,
  );

  async function loadFirstPage(mode: "initial" | "refresh" = "initial"): Promise<void> {
    const version = ++requestVersion.value;
    // 首屏/刷新会淘汰在途的加载更多请求，立即清理其 UI 状态。
    loadingMore.value = false;
    if (mode === "initial") initialLoading.value = true;
    else refreshing.value = true;
    errorMessage.value = "";

    try {
      const result = await loader({
        scope: scope.value,
        page: 1,
        size: 20,
      });
      if (version !== requestVersion.value) return;
      items.value = result.list;
      page.value = result.page;
      total.value = result.total;
    } catch (error) {
      if (version !== requestVersion.value) return;
      if (mode === "initial") items.value = [];
      errorMessage.value = errorText(error);
    } finally {
      if (version === requestVersion.value) {
        initialLoading.value = false;
        refreshing.value = false;
      }
      uni.stopPullDownRefresh();
    }
  }

  async function loadMore(): Promise<void> {
    if (initialLoading.value || refreshing.value || loadingMore.value || !hasMore.value) return;
    const version = ++requestVersion.value;
    const nextPage = page.value + 1;
    loadingMore.value = true;
    errorMessage.value = "";

    try {
      const result = await loader({
        scope: scope.value,
        page: nextPage,
        size: 20,
      });
      if (version !== requestVersion.value) return;
      const existingIds = new Set(items.value.map((item) => item.id));
      items.value = [
        ...items.value,
        ...result.list.filter((item) => !existingIds.has(item.id)),
      ];
      page.value = result.page;
      total.value = result.total;
    } catch (error) {
      if (version === requestVersion.value) errorMessage.value = errorText(error);
    } finally {
      if (version === requestVersion.value) loadingMore.value = false;
    }
  }

  function setScope(nextScope: MineScope): void {
    if (nextScope === scope.value) return;
    requestVersion.value += 1;
    scope.value = nextScope;
    items.value = [];
    page.value = 1;
    total.value = 0;
    errorMessage.value = "";
    initialLoading.value = false;
    refreshing.value = false;
    loadingMore.value = false;
  }

  return {
    errorMessage,
    hasMore,
    initialLoading,
    isEmpty,
    items,
    loadingMore,
    refreshing,
    scope,
    scopeMeta,
    total,
    loadFirstPage,
    loadMore,
    setScope,
  };
}
