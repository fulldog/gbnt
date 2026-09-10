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
  const key = () => `gbnt:miniapp:todo-region:${getUser()?.id ?? 0}`;
  const defaultId = computed(() => {
    const orgId = getUser()?.org_id;
    return orgId && findRegion(tree.value, orgId)?.type === "village" ? orgId : undefined;
  });
  const isVillage = (id: number | undefined | null) => Boolean(id && findRegion(tree.value, id)?.type === "village");
  const ready = computed(() => scope.value === userScope() && isVillage(selectedId.value));

  function select(id: number | undefined | null): boolean {
    if (scope.value !== userScope() || !isVillage(id)) return false;
    selectedId.value = id!;
    try { uni.setStorageSync(key(), id); } catch { /* 记忆失败不影响本次查询。 */ }
    return true;
  }

  async function load(): Promise<boolean> {
    const requestId = ++sequence;
    const account = getUser();
    const user = account ? { ...account } : null;
    if (!user) { tree.value = []; selectedId.value = undefined; loading.value = false; return false; }
    loading.value = true;
    error.value = "";
    try {
      const result = await loadTree();
      if (requestId !== sequence || getUser()?.id !== user.id || getUser()?.org_id !== user.org_id || getUser()?.is_super_admin !== user.is_super_admin) return false;
      // 组织接口返回完整树，不能直接当作当前账号可查询的范围。
      tree.value = user.is_super_admin ? result.list : scopeRegionTree(result.list, user.org_id);
      scope.value = userScope();
      let remembered: unknown;
      try { remembered = uni.getStorageSync(key()); } catch { /* 使用账号的村级默认值。 */ }
      selectedId.value = defaultId.value ?? (isVillage(selectedId.value) ? selectedId.value :
        typeof remembered === "number" && isVillage(remembered) ? remembered : undefined);
      return true;
    } catch (cause) {
      if (requestId === sequence) error.value = errorMessage(cause, "行政区划加载失败");
      return false;
    } finally { if (requestId === sequence) loading.value = false; }
  }

  function reset(): void {
    // 村级回到所属村；上级账号保留已选村，不退回隐含全选。
    if (defaultId.value) select(defaultId.value);
  }
  function invalidate(): void { sequence += 1; loading.value = false; }
  return { tree, selectedId, loading, error, ready, defaultId, select, load, reset, invalidate };
}
