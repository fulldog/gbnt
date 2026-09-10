import { vi } from "vitest";
import { reactive, shallowRef, type Ref } from "vue";
import type { OrgTreeNode } from "@gbnt/api-client";
import type { MiniappAuthUser, MiniappIssueListResult } from "@/api/types";
import { usePagedIssues } from "@/composables/usePagedIssues";
import { useTodoRegion } from "@/composables/useTodoRegion";
import * as issueDisplay from "@/utils/issue-display";
import { setupSfc } from "./setup-sfc";

const node = (id: number, name: string, type: OrgTreeNode["type"], parent_id: number, children: OrgTreeNode[] = []): OrgTreeNode => ({ id, name, type, parent_id, children, sort: 0 });
export const todoRegions = [node(1, "甲区", "district", 0, [
  node(11, "甲街道", "street", 1, [node(12, "甲村", "village", 11), node(13, "乙村", "village", 11)]),
  node(21, "乙街道", "street", 1, [node(22, "丙村", "village", 21)]),
])];

export function setupTodo(orgId = 12) {
  const user = reactive({ id: 7, org_id: orgId, is_super_admin: false } as MiniappAuthUser);
  const storage = new Map<string, unknown>();
  vi.stubGlobal("uni", { getStorageSync: (key: string) => storage.get(key), setStorageSync: (key: string, value: unknown) => storage.set(key, value) });
  const loader = vi.fn().mockResolvedValue({ list: [], total: 0, page: 1, size: 10 } as MiniappIssueListResult);
  const regions = vi.fn().mockResolvedValue({ list: todoRegions });
  let unload = () => {};
  const state = setupSfc("pages/todo/index.vue", {}, {
    "@/components/common/PageTopInset.vue": {},
    "@dcloudio/uni-app": { onLoad: vi.fn(), onShow: vi.fn(), onShareAppMessage: vi.fn(), onShareTimeline: vi.fn(), onUnload: (callback: () => void) => { unload = callback; } },
    "@/api/runtime": { miniappApi: { todos: { list: loader }, regions: { list: regions } } },
    "@/components/issue/IssueCard.vue": {}, "@/components/region/RegionPicker.vue": {},
    "@/stores/auth": { useAuthStore: () => ({ user }) },
    "@/composables/usePagedIssues": { usePagedIssues },
    "@/composables/useTodoRegion": { useTodoRegion: (getUser: () => MiniappAuthUser | null) => useTodoRegion(getUser, regions) },
    "@/composables/useBusinessNow": { useBusinessNow: () => shallowRef(Date.parse("2026-09-09T00:00:00+08:00")) },
    "@/utils/business-date": { businessToday: () => "2026-09-09" },
    "@/utils/issue-display": issueDisplay,
  }) as unknown as Omit<ReturnType<typeof usePagedIssues>, "resetFilters"> & {
    loadRegions: () => Promise<void>; refreshList: () => Promise<void>; clearAllFilters: () => void;
    changeRegion: (selection: { id: number | null; label: string }) => void;
    refresherTriggered: Ref<boolean>; regionReady: Ref<boolean>; region: ReturnType<typeof useTodoRegion>;
  };
  return { state, user, storage, loader, regions, unload: () => unload() };
}
