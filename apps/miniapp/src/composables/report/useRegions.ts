import { computed, ref, shallowRef } from "vue";
import type { MiniappRegionsResult, OrgTreeNode } from "@gbnt/api-client";
import type { MiniappAuthUser } from "@/api/types";
import { miniappApi } from "@/api/runtime";
import { scopeRegionTree } from "@/utils/regions";

export interface RegionOption {
  id: number;
  label: string;
}

export function flattenLeafRegions(
  nodes: readonly OrgTreeNode[],
  parentNames: readonly string[] = [],
): RegionOption[] {
  const result: RegionOption[] = [];
  for (const node of nodes) {
    const names = [...parentNames, node.name];
    if (node.children.length === 0) {
      result.push({ id: node.id, label: names.join(" / ") });
      continue;
    }
    result.push(...flattenLeafRegions(node.children, names));
  }
  return result;
}

export function useRegions(
  getUser: () => MiniappAuthUser | null,
  listRegions: () => Promise<MiniappRegionsResult> = () => miniappApi.regions.list(),
) {
  const tree = ref<OrgTreeNode[]>([]);
  const loading = shallowRef(false);
  const error = shallowRef("");
  const options = computed(() => flattenLeafRegions(tree.value));
  const loadedScope = shallowRef("");
  let sequence = 0;
  let activeScope = "";

  function userScope(): string {
    const user = getUser();
    return user ? `${user.id}:${user.org_id}:${user.is_super_admin}` : "";
  }

  async function load(): Promise<void> {
    const account = getUser();
    const scope = userScope();
    if (!account) {
      tree.value = [];
      loadedScope.value = "";
      error.value = "未获取到当前账号的组织信息";
      return;
    }
    if (loading.value && activeScope === scope) {
      return;
    }
    if (tree.value.length > 0 && loadedScope.value === scope) {
      return;
    }
    const requestId = ++sequence;
    activeScope = scope;
    if (loadedScope.value !== scope) tree.value = [];
    loading.value = true;
    error.value = "";
    try {
      const result = await listRegions();
      if (requestId !== sequence || userScope() !== scope) return;
      // 服务端已返回组织范围；客户端再按登录账号收窄，防止旧服务端的全量树被直接选中。
      tree.value = account.is_super_admin
        ? result.list
        : scopeRegionTree(result.list, account.org_id);
      loadedScope.value = scope;
      if (tree.value.length === 0) {
        error.value = "当前账号未关联有效组织，无法提交整改";
      }
    } catch (cause) {
      if (requestId === sequence) {
        error.value = cause instanceof Error ? cause.message : "行政区划加载失败";
      }
    } finally {
      if (requestId === sequence) {
        activeScope = "";
        loading.value = false;
      }
    }
  }

  return { tree, options, loading, error, load };
}
