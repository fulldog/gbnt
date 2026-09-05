import { computed, ref, shallowRef } from "vue";
import type { OrgTreeNode } from "@gbnt/api-client";
import { miniappApi } from "@/api/runtime";

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

export function useRegions() {
  const tree = ref<OrgTreeNode[]>([]);
  const loading = shallowRef(false);
  const error = shallowRef("");
  const options = computed(() => flattenLeafRegions(tree.value));

  async function load(): Promise<void> {
    if (loading.value || tree.value.length > 0) {
      return;
    }
    loading.value = true;
    error.value = "";
    try {
      const result = await miniappApi.regions.list();
      tree.value = result.list;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "行政区划加载失败";
    } finally {
      loading.value = false;
    }
  }

  return { tree, options, loading, error, load };
}
