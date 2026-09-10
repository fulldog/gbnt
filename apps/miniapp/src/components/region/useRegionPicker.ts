import { computed, shallowRef, watch } from "vue";
import type { OrgTreeNode } from "@gbnt/api-client";

export type RegionPickerMode = "leaf" | "filter" | "village";

export interface RegionSelection {
  /** null 仅表示筛选不限区域，不是后端组织 ID。 */
  id: number | null;
  label: string;
}

export interface RegionOption {
  id: number | null;
  name: string;
}

type RegionIndices = [number, number, number];
type RegionIds = [number | null, number | null, number | null];
type RegionColumns = [RegionOption[], RegionOption[], RegionOption[]];

interface DistrictEntry {
  node: OrgTreeNode;
  names: string[];
}

const ALL_NAMES = ["全部区域", "全部街道", "全部村（社区）"] as const;

/** 共享三级联动：创建只选真实末级，筛选允许任意层级及不限区域。 */
export function useRegionPicker(
  getTree: () => readonly OrgTreeNode[],
  getSelectedId: () => number | null,
  onConfirm: (selection: RegionSelection) => void,
  getMode: () => RegionPickerMode = () => "leaf",
  getStartLevel: () => "district" | "street" = () => "district",
) {
  const opened = shallowRef(false);
  // ID 三元组保存候选，null 三元组表示全选；整体 null 表示尚无有效候选。
  const pendingIds = shallowRef<RegionIds | null>(null);
  const isFilter = computed(() => getMode() === "filter");
  const districts = computed(() => {
    if (getStartLevel() === "street") {
      const streets: OrgTreeNode[] = [];
      function collectStreets(nodes: readonly OrgTreeNode[]): void {
        for (const node of nodes) {
          if (node.type === "street") streets.push(node);
          else collectStreets(node.children);
        }
      }
      collectStreets(getTree());
      // 隐藏的联动容器只用于复用选择逻辑，永远不能作为组织 ID 提交。
      return [{ node: { id: -1, name: "", type: "district" as const, parent_id: 0, sort: 0, children: streets }, names: [] }];
    }
    const entries: DistrictEntry[] = [];
    function collect(nodes: readonly OrgTreeNode[], names: string[]): void {
      for (const node of nodes) {
        const path = [...names, node.name];
        if (node.type === "root") collect(node.children, path);
        else if (node.type === "district") entries.push({ node, names: path });
      }
    }
    collect(getTree(), []);
    return entries;
  });

  const selectedPath = computed(() => {
    const id = getSelectedId();
    if (id === null) return [];
    function find(nodes: readonly OrgTreeNode[], path: OrgTreeNode[]): OrgTreeNode[] | null {
      for (const node of nodes) {
        const next = [...path, node];
        if (node.id === id) return next;
        const found = find(node.children, next);
        if (found) return found;
      }
      return null;
    }
    return find(getTree(), []) ?? [];
  });
  const selectedLabel = computed(() => getSelectedId() === null && isFilter.value
    ? ALL_NAMES[0] : selectedPath.value.filter((node) => getStartLevel() !== "street" || ["street", "village"].includes(node.type)).map((node) => node.name).join(""));
  const selectedName = computed(() => getSelectedId() === null && isFilter.value
    ? ALL_NAMES[0] : selectedPath.value[selectedPath.value.length - 1]?.name ?? "");

  function streetsOf(node: OrgTreeNode | undefined): OrgTreeNode[] {
    return node?.children.filter((child) => child.type === "street") ?? [];
  }

  function villagesOf(node: OrgTreeNode | undefined): OrgTreeNode[] {
    return node?.children.filter((child) => child.type === "village") ?? [];
  }

  function options(nodes: readonly OrgTreeNode[], column: 0 | 1 | 2): RegionOption[] {
    const result: RegionOption[] = nodes.map(({ id, name }) => ({ id, name }));
    return isFilter.value ? [{ id: null, name: ALL_NAMES[column] }, ...result] : result;
  }

  const columns = computed<RegionColumns>(() => {
    const districtNodes = districts.value.map((entry) => entry.node);
    const district = districtNodes.find((node) => node.id === pendingIds.value?.[0]);
    const streets = streetsOf(district);
    const street = streets.find((node) => node.id === pendingIds.value?.[1]);
    return [options(districtNodes, 0), options(streets, 1), options(villagesOf(street), 2)];
  });

  const indices = computed<RegionIndices>(() => [
    Math.max(0, columns.value[0].findIndex((node) => node.id === pendingIds.value?.[0])),
    Math.max(0, columns.value[1].findIndex((node) => node.id === pendingIds.value?.[1])),
    Math.max(0, columns.value[2].findIndex((node) => node.id === pendingIds.value?.[2])),
  ]);

  const selection = computed<RegionSelection | null>(() => {
    const ids = pendingIds.value;
    if (!opened.value || !ids) return null;
    if (ids[0] === null) {
      return isFilter.value && ids[1] === null && ids[2] === null ? { id: null, label: ALL_NAMES[0] } : null;
    }
    const entry = districts.value.find((item) => item.node.id === ids[0]);
    if (!entry) return null;
    const street = streetsOf(entry.node).find((node) => node.id === ids[1]);
    if (getStartLevel() === "street" && !street) return null;
    if (ids[1] !== null && !street) return null;
    const village = villagesOf(street).find((node) => node.id === ids[2]);
    if (ids[2] !== null && !village) return null;
    const path = [entry.node, ...(street ? [street] : []), ...(village ? [village] : [])];
    const endpoint = path[path.length - 1]!;
    // 创建兼容无下级的真实区县/街道；筛选可选有下级的父组织。
    if (!isFilter.value && endpoint.children.length !== 0) return null;
    if (getMode() === "village" && endpoint.type !== "village") return null;
    return { id: endpoint.id, label: [...entry.names, ...path.slice(1).map((node) => node.name)].join("") };
  });

  function initialIds(): RegionIds | null {
    const selectedId = getSelectedId();
    if (isFilter.value && selectedId === null) return [null, null, null];
    for (const { node: district } of districts.value) {
      const streets = streetsOf(district);
      if (district.id === selectedId && (isFilter.value || district.children.length === 0)) return [district.id, null, null];
      for (const street of streets) {
        if (street.id === selectedId && (isFilter.value || street.children.length === 0)) return [district.id, street.id, null];
        const village = villagesOf(street).find((node) => node.id === selectedId && (isFilter.value || node.children.length === 0));
        if (village) return [district.id, street.id, village.id];
      }
    }
    // 未加载、失效或不能表示的 root 筛选不静默改成其他地区；等用户明确选择。
    if (isFilter.value) return null;
    const district = districts.value[0]?.node;
    const street = streetsOf(district)[0];
    return [district?.id ?? null, street?.id ?? null, villagesOf(street)[0]?.id ?? null];
  }

  function open(): void {
    if (opened.value) return;
    pendingIds.value = initialIds();
    opened.value = true;
  }

  function cancel(): void {
    opened.value = false;
    pendingIds.value = null;
  }

  function validIndex(index: number, items: readonly RegionOption[]): boolean {
    return items.length === 0 ? index === 0 : index < items.length;
  }

  function change(values: readonly number[]): void {
    if (!opened.value || values.length !== 3 || values.some((value) => !Number.isInteger(value) || value < 0)) return;
    const districtOption = columns.value[0][values[0]!];
    if (!districtOption) return;
    const district = districts.value.find((entry) => entry.node.id === districtOption.id)?.node;
    const districtChanged = districtOption.id !== pendingIds.value?.[0];
    const streetOptions = options(streetsOf(district), 1);
    const streetIndex = districtChanged ? 0 : values[1]!;
    if (!validIndex(streetIndex, streetOptions)) return;
    const streetId = streetOptions[streetIndex]?.id ?? null;
    const street = streetsOf(district).find((node) => node.id === streetId);
    const villageOptions = options(villagesOf(street), 2);
    const villageIndex = districtChanged || streetId !== pendingIds.value?.[1] ? 0 : values[2]!;
    if (!validIndex(villageIndex, villageOptions)) return;
    pendingIds.value = [districtOption.id, streetId, villageOptions[villageIndex]?.id ?? null];
  }

  function confirm(): void {
    if (!opened.value || !selection.value) return;
    const selected = selection.value;
    cancel();
    onConfirm(selected);
  }

  watch(getTree, () => {
    if (!opened.value) return;
    if (!pendingIds.value || (!isFilter.value && pendingIds.value.every((id) => id === null))) {
      pendingIds.value = initialIds();
      return;
    }
    // 删除或移动候选路径时丢弃草稿；筛选全选不因异步加载变成具体地区。
    if (!selection.value) cancel();
  }, { deep: true, flush: "sync" });
  watch(getMode, cancel, { flush: "sync" });
  watch(getStartLevel, cancel, { flush: "sync" });

  return { opened, indices: computed(() => getStartLevel() === "street" ? indices.value.slice(1) : indices.value),
    columns: computed(() => getStartLevel() === "street" ? columns.value.slice(1) : columns.value),
    selection, selectedLabel, selectedName, open, cancel,
    change: (values: readonly number[]) => change(getStartLevel() === "street" ? [0, ...values] : values), confirm };
}
