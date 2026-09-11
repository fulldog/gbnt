import { computed, shallowRef } from "vue";
import type { OrgTreeNode } from "@gbnt/api-client";
import type { MiniappAuthUser } from "@/api/types";
import { miniappApi } from "@/api/runtime";
import { errorMessage } from "@/utils/issue-display";
import { findRegion, scopeRegionTree } from "@/utils/regions";

export function useTodoRegion(getUser: () => MiniappAuthUser | null, loadTree = miniappApi.regions.list) {
  const tree = shallowRef<OrgTreeNode[]>([]);
  const selectedId = shallowRef<number>();
  const loading = shallowRef(false);
  const error = shallowRef("");
  const scope = shallowRef("");
  const userScope = () => `${getUser()?.id}:${getUser()?.org_id}:${getUser()?.is_super_admin}`;
  let sequence = 0;
  const isRegion = (id: number) => ["street", "village"].includes(findRegion(tree.value, id)?.type ?? "");
  const ready = computed(() => Boolean(getUser()) && scope.value === userScope() && tree.value.length > 0 &&
    (selectedId.value === undefined || isRegion(selectedId.value)));

  function select(id: number | undefined | null): boolean {
    if (!ready.value || (id != null && !isRegion(id))) return false;
    // 不传 org_id 表示当前账号权限范围内的全部街道，由后端继续限制数据范围。
    selectedId.value = id ?? undefined;
    return true;
  }

  async function load(): Promise<boolean> {
    const requestId = ++sequence;
    const account = getUser();
    const user = account ? { ...account } : null;
    if (!user || scope.value !== userScope()) {
      tree.value = []; selectedId.value = undefined; scope.value = "";
    }
    if (!user) { loading.value = false; return false; }
    loading.value = true;
    error.value = "";
    try {
      const result = await loadTree();
      if (requestId !== sequence || getUser()?.id !== user.id || getUser()?.org_id !== user.org_id || getUser()?.is_super_admin !== user.is_super_admin) return false;
      // 组织接口返回完整树，不能直接当作当前账号可查询的范围。
      tree.value = user.is_super_admin ? result.list : scopeRegionTree(result.list, user.org_id);
      scope.value = userScope();
      // 新进入首页默认全选；下拉刷新保留本页选择，不恢复上次进入时保存的村。
      if (selectedId.value !== undefined && !isRegion(selectedId.value)) selectedId.value = undefined;
      return true;
    } catch (cause) {
      if (requestId === sequence) error.value = errorMessage(cause, "行政区划加载失败");
      return false;
    } finally { if (requestId === sequence) loading.value = false; }
  }

  function reset(): void {
    select(null);
  }
  function invalidate(): void { sequence += 1; loading.value = false; }
  return { tree, selectedId, loading, error, ready, select, load, reset, invalidate };
}
