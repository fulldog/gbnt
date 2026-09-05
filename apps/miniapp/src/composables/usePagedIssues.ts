import type {
  IssueStatus,
  IssueType,
  MiniappTodoQuery,
  ProjectYear,
} from "@gbnt/api-client";
import { computed, readonly, ref, shallowReadonly, shallowRef } from "vue";
import { miniappApi } from "@/api/runtime";
import type { MiniappIssue, MiniappIssueListResult } from "@/api/types";
import { errorMessage } from "@/utils/issue-display";

export interface TodoIssueFilters {
  keyword: string;
  type: IssueType | "all";
  status: IssueStatus | "all";
  orgId?: number;
  projectYear?: ProjectYear;
}

export type IssueListLoader = (query: MiniappTodoQuery) => Promise<MiniappIssueListResult>;

type LoadingMode = "refresh" | "more" | null;

const DEFAULT_FILTERS: TodoIssueFilters = {
  keyword: "",
  type: "all",
  status: "all",
};

function toQuery(filters: TodoIssueFilters, page: number, size: number): MiniappTodoQuery {
  const query: MiniappTodoQuery = { page, size };
  const keyword = filters.keyword.trim();
  if (keyword) query.keyword = keyword;
  if (filters.type !== "all") query.type = filters.type;
  if (filters.status !== "all") query.status = filters.status;
  if (filters.orgId) query.org_id = filters.orgId;
  if (filters.projectYear) query.project_year = filters.projectYear;
  return query;
}

function mergeUniqueIssues(previous: readonly MiniappIssue[], next: readonly MiniappIssue[]): MiniappIssue[] {
  const merged = new Map<number, MiniappIssue>();
  for (const item of previous) merged.set(item.id, item);
  for (const item of next) merged.set(item.id, item);
  return [...merged.values()];
}

export function usePagedIssues(
  loader: IssueListLoader = miniappApi.todos.list,
  pageSize = 10,
) {
  const items = shallowRef<MiniappIssue[]>([]);
  const filters = ref<TodoIssueFilters>({ ...DEFAULT_FILTERS });
  const page = shallowRef(0);
  const total = shallowRef(0);
  const loadingMode = shallowRef<LoadingMode>(null);
  const error = shallowRef("");
  const isStale = shallowRef(false);
  let failedRequest: { page: number; replace: boolean } | null = null;
  let requestSequence = 0;

  const hasMore = computed(() => items.value.length < total.value);
  const isLoading = computed(() => loadingMode.value !== null);
  const isRefreshing = computed(() => loadingMode.value === "refresh");
  const isLoadingMore = computed(() => loadingMode.value === "more");

  async function requestPage(targetPage: number, replace: boolean): Promise<boolean> {
    const requestId = ++requestSequence;
    loadingMode.value = replace ? "refresh" : "more";
    error.value = "";

    try {
      const result = await loader(toQuery(filters.value, targetPage, pageSize));
      if (requestId !== requestSequence) return false;

      items.value = replace ? result.list : mergeUniqueIssues(items.value, result.list);
      page.value = result.page || targetPage;
      total.value = result.total;
      failedRequest = null;
      isStale.value = false;
      return true;
    } catch (cause) {
      if (requestId !== requestSequence) return false;
      error.value = errorMessage(cause, "待办加载失败，请稍后重试");
      failedRequest = { page: targetPage, replace };
      isStale.value = replace && items.value.length > 0;
      return false;
    } finally {
      if (requestId === requestSequence) loadingMode.value = null;
    }
  }

  function reload(patch?: Partial<TodoIssueFilters>): Promise<boolean> {
    if (patch) {
      filters.value = { ...filters.value, ...patch };
      // 新筛选失败时不能继续展示上一个筛选条件下的旧记录。
      items.value = [];
      page.value = 0;
      total.value = 0;
      isStale.value = false;
    }
    failedRequest = null;
    return requestPage(1, true);
  }

  function resetFilters(): Promise<boolean> {
    filters.value = { ...DEFAULT_FILTERS };
    items.value = [];
    page.value = 0;
    total.value = 0;
    isStale.value = false;
    return reload();
  }

  function loadMore(): Promise<boolean> {
    if (loadingMode.value !== null || !hasMore.value || failedRequest) return Promise.resolve(false);
    return requestPage(page.value + 1, false);
  }

  function retry(): Promise<boolean> {
    if (loadingMode.value !== null) return Promise.resolve(false);
    if (!failedRequest) return reload();
    return requestPage(failedRequest.page, failedRequest.replace);
  }

  function invalidate(): void {
    requestSequence += 1;
    loadingMode.value = null;
  }

  return {
    items: shallowReadonly(items),
    filters: readonly(filters),
    page: readonly(page),
    total: readonly(total),
    error: readonly(error),
    isStale: readonly(isStale),
    hasMore,
    isLoading,
    isRefreshing,
    isLoadingMore,
    reload,
    resetFilters,
    loadMore,
    retry,
    invalidate,
  } as const;
}
