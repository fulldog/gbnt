import { effectScope, ref, shallowRef } from "vue";
import type { OrgTreeNode } from "@gbnt/api-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRegionPicker, type RegionPickerMode } from "@/components/region/useRegionPicker";

function node(id: number, type: OrgTreeNode["type"], name: string, children: OrgTreeNode[] = []): OrgTreeNode {
  for (const child of children) child.parent_id = id;
  return { id, type, name, children, parent_id: 0, sort: id };
}

function regions(): OrgTreeNode[] {
  return [node(1, "root", "管委会", [
    node(10, "district", "甲区", [
      node(11, "street", "甲街道", [node(111, "village", "甲村"), node(112, "village", "乙社区")]),
      node(12, "street", "乙街道", [node(121, "village", "丙村"), node(122, "village", "丁村")]),
    ]),
    node(20, "district", "乙区", [
      node(21, "street", "丙街道", [node(211, "village", "戊村")]),
      node(22, "street", "丁街道", [node(221, "village", "己村")]),
    ]),
  ])];
}

const scopes: ReturnType<typeof effectScope>[] = [];
afterEach(() => { for (const scope of scopes.splice(0)) scope.stop(); });

function setup(tree = regions(), selectedId: number | null = null, initialMode: RegionPickerMode = "leaf") {
  const source = shallowRef(tree);
  const selected = shallowRef(selectedId);
  const mode = shallowRef(initialMode);
  const onConfirm = vi.fn();
  const scope = effectScope();
  scopes.push(scope);
  const picker = scope.run(() => useRegionPicker(() => source.value, () => selected.value, onConfirm, () => mode.value))!;
  return { picker, source, selected, mode, onConfirm };
}

describe("report region picker", () => {
  it("shows district / street / village columns without the root and keeps the full confirmation path", () => {
    const { picker, onConfirm } = setup();
    expect(picker.opened.value).toBe(false);
    picker.open();
    expect(picker.columns.value.map((column) => column.map((item) => item.name))).toEqual([
      ["甲区", "乙区"], ["甲街道", "乙街道"], ["甲村", "乙社区"],
    ]);
    expect(picker.indices.value).toEqual([0, 0, 0]);
    expect(picker.selection.value).toEqual({ id: 111, label: "管委会 / 甲区 / 甲街道 / 甲村" });
    expect(onConfirm).not.toHaveBeenCalled();
    picker.confirm();
    picker.confirm();
    expect(onConfirm.mock.calls).toEqual([[{ id: 111, label: "管委会 / 甲区 / 甲街道 / 甲村" }]]);
    expect(picker.opened.value).toBe(false);
  });

  it("restores all three indices from the selected organization ID", () => {
    const { picker } = setup(regions(), 221);
    picker.open();
    expect(picker.indices.value).toEqual([1, 1, 0]);
    expect(picker.selection.value?.label).toBe("管委会 / 乙区 / 丁街道 / 己村");
  });

  it("resets both descendants when the district changes, ignoring stale child indices", () => {
    const { picker } = setup(regions(), 122);
    picker.open();
    expect(picker.indices.value).toEqual([0, 1, 1]);
    picker.change([1, 1, 1]);
    expect(picker.indices.value).toEqual([1, 0, 0]);
    expect(picker.selection.value?.id).toBe(211);
  });

  it("resets only the village when the street changes", () => {
    const { picker } = setup(regions(), 112);
    picker.open();
    picker.change([0, 1, 1]);
    expect(picker.indices.value).toEqual([0, 1, 0]);
    expect(picker.selection.value?.id).toBe(121);
    picker.change([0, 1, 1]);
    expect(picker.selection.value?.id).toBe(122);
  });

  it("keeps external form state unchanged while scrolling and discards pending selection on cancel", () => {
    const { picker, selected, onConfirm } = setup(regions(), 112);
    picker.open();
    picker.change([1, 0, 0]);
    picker.cancel();
    expect(selected.value).toBe(112);
    expect(picker.selection.value).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
    picker.open();
    expect(picker.indices.value).toEqual([0, 0, 1]);
    selected.value = 221;
    expect(picker.selection.value?.id).toBe(112);
    picker.cancel();
    picker.open();
    expect(picker.selection.value?.id).toBe(221);
  });

  it.each([null, 999, 1, 10, 11])("starts an unknown/non-leaf selected ID %s at the first path without submitting", (selectedId) => {
    const { picker, selected, onConfirm } = setup(regions(), selectedId);
    picker.open();
    expect(picker.selection.value?.id).toBe(111);
    expect(selected.value).toBe(selectedId);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("preserves all roots in labels and also accepts a tree whose root wrapper is omitted", () => {
    const tree = regions();
    tree.push(node(2, "root", "第二管委会", [node(30, "district", "丙区")]));
    const { picker } = setup(tree, 30);
    picker.open();
    expect(picker.columns.value[0].map((item) => item.id)).toEqual([10, 20, 30]);
    expect(picker.selection.value).toEqual({ id: 30, label: "第二管委会 / 丙区" });
    const direct = setup(regions()[0]!.children, 112).picker;
    direct.open();
    expect(direct.selection.value?.label).toBe("甲区 / 甲街道 / 乙社区");
  });

  it.each([
    { tree: [node(1, "root", "根", [node(10, "district", "空区")])], id: 10, lengths: [1, 0, 0], label: "根 / 空区" },
    { tree: [node(1, "root", "根", [node(10, "district", "区", [node(11, "street", "空街道")])])], id: 11, lengths: [1, 1, 0], label: "根 / 区 / 空街道" },
  ])("preserves existing non-root leaf compatibility for organization $id without fabricated descendants", ({ tree, id, lengths, label }) => {
    const { picker, onConfirm } = setup(tree, id);
    picker.open();
    expect(picker.columns.value.map((column) => column.length)).toEqual(lengths);
    expect(picker.selection.value).toEqual({ id, label });
    picker.confirm();
    expect(onConfirm).toHaveBeenCalledWith({ id, label });
  });

  it.each([
    { tree: [] },
    { tree: [node(1, "root", "空根")] },
    { tree: [node(11, "street", "缺失区县")] },
  ])("does not submit an empty/root-only/missing-district tree", ({ tree }) => {
    const { picker, onConfirm } = setup(tree);
    picker.open();
    picker.change([0, 0, 0]);
    picker.confirm();
    expect(picker.columns.value).toEqual([[], [], []]);
    expect(picker.selection.value).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("does not mistake an unexpected child type or non-leaf village for a valid endpoint", () => {
    const trees = [
      [node(10, "district", "区", [node(111, "village", "越级村")])],
      [node(10, "district", "区", [node(11, "street", "街道", [node(111, "village", "村", [node(112, "village", "异常下级")])])])],
    ];
    for (const tree of trees) {
      const { picker, onConfirm } = setup(tree);
      picker.open();
      expect(picker.selection.value).toBeNull();
      picker.confirm();
      expect(onConfirm).not.toHaveBeenCalled();
    }
  });

  it.each([null, 221])("initializes an open empty picker after retry loads data with selected ID %s", (selectedId) => {
    const { picker, source, onConfirm } = setup([], selectedId);
    picker.open();
    expect(picker.selection.value).toBeNull();
    source.value = regions();
    expect(picker.opened.value).toBe(true);
    expect(picker.selection.value?.id).toBe(selectedId ?? 111);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it.each([[], [0], [0, 0], [0, 0, 0, 0], [-1, 0, 0], [0, -1, 0], [0, 0, -1], [NaN, 0, 0], [Infinity, 0, 0], [0, 0.5, 0], [5, 0, 0], [0, 5, 0], [0, 0, 5]])("ignores malformed/out-of-range indices %j", (...values) => {
    const { picker } = setup(regions(), 112);
    picker.open();
    picker.change(values);
    expect(picker.indices.value).toEqual([0, 0, 1]);
    expect(picker.selection.value?.id).toBe(112);
  });

  it("ignores delayed change or confirm after cancel", () => {
    const { picker, onConfirm } = setup();
    picker.open();
    picker.cancel();
    picker.change([1, 1, 0]);
    picker.confirm();
    expect(picker.selection.value).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("relocates indices by real IDs after a tree reorder rather than selecting a different branch", () => {
    const { picker, source } = setup(regions(), 112);
    picker.open();
    const updated = regions();
    updated[0]!.children.reverse();
    updated[0]!.children[1]!.children.reverse();
    updated[0]!.children[1]!.children[1]!.children.reverse();
    source.value = updated;
    expect(picker.opened.value).toBe(true);
    expect(picker.indices.value).toEqual([1, 1, 0]);
    expect(picker.selection.value?.id).toBe(112);
  });

  it.each(["district", "street", "village", "move"])("discards an open draft when its %s path changes", (kind) => {
    const { picker, source, onConfirm } = setup(regions(), 112);
    picker.open();
    const updated = regions();
    const root = updated[0]!;
    if (kind === "district") root.children.shift();
    else if (kind === "street") root.children[0]!.children.shift();
    else {
      const village = root.children[0]!.children[0]!.children.pop()!;
      if (kind === "move") root.children[0]!.children[1]!.children.push(village);
    }
    source.value = updated;
    expect(picker.opened.value).toBe(false);
    expect(picker.selection.value).toBeNull();
    picker.confirm();
    expect(onConfirm).not.toHaveBeenCalled();
    picker.open();
    expect(picker.selection.value).not.toBeNull();
  });

  it("reacts to an in-place mutation without retaining a removed candidate", () => {
    const tree = ref(regions());
    const scope = effectScope();
    scopes.push(scope);
    const picker = scope.run(() => useRegionPicker(() => tree.value, () => 112, vi.fn()))!;
    picker.open();
    tree.value[0]!.children[0]!.children[0]!.children.pop();
    expect(picker.opened.value).toBe(false);
    expect(picker.selection.value).toBeNull();
  });

  it("discards a previously valid leaf when new children make it non-terminal", () => {
    const { picker, source, onConfirm } = setup([node(10, "district", "区")], 10);
    picker.open();
    source.value = [node(10, "district", "区", [node(11, "street", "新增街道")])];
    expect(picker.opened.value).toBe(false);
    expect(picker.selection.value).toBeNull();
    picker.confirm();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("updates a pending label from the current tree and does not mutate the supplied tree", () => {
    const tree = regions();
    const snapshot = JSON.stringify(tree);
    const { picker, source } = setup(tree, 112);
    picker.open();
    picker.change([0, 1, 0]);
    expect(JSON.stringify(tree)).toBe(snapshot);
    const updated = regions();
    updated[0]!.children[0]!.children[1]!.name = "更新街道";
    source.value = updated;
    expect(picker.selection.value?.label).toBe("管委会 / 甲区 / 更新街道 / 丙村");
  });
});

describe("shared region picker filter mode", () => {
  it("starts at all regions and keeps only all options in dependent columns", () => {
    const { picker, onConfirm } = setup(regions(), null, "filter");
    picker.open();
    expect(picker.columns.value).toEqual([
      [{ id: null, name: "全部区域" }, { id: 10, name: "甲区" }, { id: 20, name: "乙区" }],
      [{ id: null, name: "全部街道" }],
      [{ id: null, name: "全部村（社区）" }],
    ]);
    expect(picker.indices.value).toEqual([0, 0, 0]);
    expect(picker.selection.value).toEqual({ id: null, label: "全部区域" });
    expect(onConfirm).not.toHaveBeenCalled();
    picker.confirm();
    picker.confirm();
    expect(onConfirm.mock.calls).toEqual([[{ id: null, label: "全部区域" }]]);
  });

  it.each([
    { id: 10, indices: [1, 0, 0], label: "管委会 / 甲区", name: "甲区" },
    { id: 12, indices: [1, 2, 0], label: "管委会 / 甲区 / 乙街道", name: "乙街道" },
    { id: 112, indices: [1, 1, 2], label: "管委会 / 甲区 / 甲街道 / 乙社区", name: "乙社区" },
    { id: 221, indices: [2, 2, 1], label: "管委会 / 乙区 / 丁街道 / 己村", name: "己村" },
  ])("restores and confirms any real level $id without choosing an arbitrary descendant", ({ id, indices, label, name }) => {
    const { picker, onConfirm } = setup(regions(), id, "filter");
    expect(picker.selectedLabel.value).toBe(label);
    expect(picker.selectedName.value).toBe(name);
    picker.open();
    expect(picker.indices.value).toEqual(indices);
    expect(picker.selection.value).toEqual({ id, label });
    picker.confirm();
    expect(onConfirm).toHaveBeenCalledWith({ id, label });
  });

  it("resets to all descendants when selecting a different district", () => {
    const { picker } = setup(regions(), 112, "filter");
    picker.open();
    picker.change([2, 1, 2]);
    expect(picker.indices.value).toEqual([2, 0, 0]);
    expect(picker.columns.value[1].map(({ id }) => id)).toEqual([null, 21, 22]);
    expect(picker.columns.value[2]).toEqual([{ id: null, name: "全部村（社区）" }]);
    expect(picker.selection.value).toEqual({ id: 20, label: "管委会 / 乙区" });
  });

  it("resets to all villages when selecting a different street", () => {
    const { picker } = setup(regions(), 112, "filter");
    picker.open();
    picker.change([1, 2, 2]);
    expect(picker.indices.value).toEqual([1, 2, 0]);
    expect(picker.selection.value).toEqual({ id: 12, label: "管委会 / 甲区 / 乙街道" });
    expect(picker.columns.value[2].map(({ id }) => id)).toEqual([null, 121, 122]);
    picker.change([1, 2, 2]);
    expect(picker.selection.value?.id).toBe(122);
  });

  it("clears descendants when the street or district is changed back to all", () => {
    const { picker, selected, onConfirm } = setup(regions(), 112, "filter");
    picker.open();
    picker.change([1, 0, 2]);
    expect(picker.indices.value).toEqual([1, 0, 0]);
    expect(picker.selection.value?.id).toBe(10);
    picker.change([0, 0, 0]);
    expect(picker.indices.value).toEqual([0, 0, 0]);
    expect(picker.selection.value).toEqual({ id: null, label: "全部区域" });
    expect(selected.value).toBe(112);
    expect(onConfirm).not.toHaveBeenCalled();
    picker.confirm();
    expect(onConfirm).toHaveBeenCalledWith({ id: null, label: "全部区域" });
  });

  it("cancels a new parent or all selection without replacing the external selection", () => {
    const { picker, selected, onConfirm } = setup(regions(), 112, "filter");
    picker.open();
    picker.change([0, 0, 0]);
    picker.cancel();
    expect(picker.selection.value).toBeNull();
    expect(selected.value).toBe(112);
    expect(onConfirm).not.toHaveBeenCalled();
    picker.open();
    expect(picker.indices.value).toEqual([1, 1, 2]);
  });

  it("starts newly opened selection at all after the caller clears the filter", () => {
    const { picker, selected } = setup(regions(), 112, "filter");
    picker.open();
    picker.cancel();
    selected.value = null;
    expect(picker.selectedLabel.value).toBe("全部区域");
    expect(picker.selectedName.value).toBe("全部区域");
    picker.open();
    expect(picker.indices.value).toEqual([0, 0, 0]);
    expect(picker.selection.value?.id).toBeNull();
  });

  it("does not replace all with a specific region when the initially empty tree loads or reorders", () => {
    const { picker, source, onConfirm } = setup([], null, "filter");
    picker.open();
    expect(picker.selection.value).toEqual({ id: null, label: "全部区域" });
    source.value = regions();
    const reordered = regions();
    reordered[0]!.children.reverse();
    source.value = reordered;
    expect(picker.opened.value).toBe(true);
    expect(picker.indices.value).toEqual([0, 0, 0]);
    expect(picker.selection.value).toEqual({ id: null, label: "全部区域" });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it.each([10, 11, 112])("restores selected level %s after an async tree load, without emitting", (id) => {
    const { picker, source, onConfirm } = setup([], id, "filter");
    picker.open();
    expect(picker.selection.value).toBeNull();
    picker.confirm();
    source.value = regions();
    expect(picker.opened.value).toBe(true);
    expect(picker.selection.value?.id).toBe(id);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it.each([1, 999])("never silently changes a root or unknown external ID %s to all or another organization", (id) => {
    const { picker, selected, source, onConfirm } = setup(regions(), id, "filter");
    picker.open();
    expect(picker.selection.value).toBeNull();
    picker.confirm();
    source.value = regions();
    expect(picker.selection.value).toBeNull();
    expect(selected.value).toBe(id);
    expect(picker.selectedLabel.value).toBe(id === 1 ? "管委会" : "");
    expect(picker.selectedName.value).toBe(id === 1 ? "管委会" : "");
    expect(onConfirm).not.toHaveBeenCalled();
    picker.change([1, 0, 0]);
    expect(picker.selection.value?.id).toBe(10);
    picker.confirm();
    expect(onConfirm).toHaveBeenCalledWith({ id: 10, label: "管委会 / 甲区" });
  });

  it("allows explicitly selecting all even when the existing ID is not representable", () => {
    const { picker, onConfirm } = setup(regions(), 1, "filter");
    picker.open();
    picker.change([0, 0, 0]);
    picker.confirm();
    expect(onConfirm).toHaveBeenCalledWith({ id: null, label: "全部区域" });
  });

  it("retains a parent's all-descendants filter when children are added or removed", () => {
    const { picker, source } = setup(regions(), 10, "filter");
    picker.open();
    source.value = [node(1, "root", "管委会", [node(10, "district", "甲区")])];
    expect(picker.opened.value).toBe(true);
    expect(picker.selection.value?.id).toBe(10);
    source.value = regions();
    expect(picker.indices.value).toEqual([1, 0, 0]);
    expect(picker.selection.value?.id).toBe(10);
  });

  it("keeps real IDs when the tree is reordered", () => {
    const { picker, source } = setup(regions(), 112, "filter");
    picker.open();
    const updated = regions();
    updated[0]!.children.reverse();
    updated[0]!.children[1]!.children.reverse();
    updated[0]!.children[1]!.children[1]!.children.reverse();
    source.value = updated;
    expect(picker.indices.value).toEqual([2, 2, 1]);
    expect(picker.selection.value?.id).toBe(112);
  });

  it.each(["district", "street", "village", "move"])('cancels when the selected "%s" branch changes', (kind) => {
    const { picker, source, selected, onConfirm } = setup(regions(), 112, "filter");
    picker.open();
    const updated = regions();
    const root = updated[0]!;
    if (kind === "district") root.children.shift();
    else if (kind === "street") root.children[0]!.children.shift();
    else {
      const village = root.children[0]!.children[0]!.children.pop()!;
      if (kind === "move") root.children[0]!.children[1]!.children.push(village);
    }
    source.value = updated;
    expect(picker.opened.value).toBe(false);
    expect(picker.selection.value).toBeNull();
    expect(selected.value).toBe(112);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it.each([[], [0, 0], [1, 1, 0, 0], [-1, 1, 1], [1, NaN, 1], [1, 1, Infinity], [1, 0.5, 1], [3, 1, 2], [1, 3, 2], [1, 1, 3]])("ignores malformed or out-of-range filter indices %j", (...values) => {
    const { picker } = setup(regions(), 112, "filter");
    picker.open();
    picker.change(values);
    expect(picker.indices.value).toEqual([1, 1, 2]);
    expect(picker.selection.value?.id).toBe(112);
  });

  it("does not mutate the shared input tree or insert fake organization IDs", () => {
    const tree = regions();
    const snapshot = JSON.stringify(tree);
    const { picker } = setup(tree, 112, "filter");
    picker.open();
    picker.change([1, 0, 0]);
    picker.change([0, 0, 0]);
    expect(JSON.stringify(tree)).toBe(snapshot);
    expect(picker.columns.value.every((column) => column.every((item) => item.id === null || item.id > 0))).toBe(true);
  });
});

describe("confirmed region labels", () => {
  it("derives the confirmed labels from external state, never pending wheel values", () => {
    const { picker, selected, source } = setup(regions(), 112);
    picker.open();
    picker.change([1, 1, 0]);
    expect(picker.selectedLabel.value).toBe("管委会 / 甲区 / 甲街道 / 乙社区");
    expect(picker.selectedName.value).toBe("乙社区");
    selected.value = 221;
    expect(picker.selectedName.value).toBe("己村");
    const updated = regions();
    updated[0]!.children[1]!.children[1]!.children[0]!.name = "更新村";
    source.value = updated;
    expect(picker.selectedLabel.value).toBe("管委会 / 乙区 / 丁街道 / 更新村");
  });

  it("uses empty labels for a cleared creation value and never mistakes unknown IDs for all", () => {
    const { picker, selected, mode } = setup();
    expect(picker.selectedLabel.value).toBe("");
    expect(picker.selectedName.value).toBe("");
    mode.value = "filter";
    expect(picker.selectedLabel.value).toBe("全部区域");
    selected.value = 999;
    expect(picker.selectedLabel.value).toBe("");
    expect(picker.selectedName.value).toBe("");
  });

  it("cancels pending interaction when switching between creation and filter modes", () => {
    const { picker, mode, onConfirm } = setup(regions(), 112);
    picker.open();
    mode.value = "filter";
    expect(picker.opened.value).toBe(false);
    expect(picker.selection.value).toBeNull();
    picker.confirm();
    expect(onConfirm).not.toHaveBeenCalled();
    picker.open();
    expect(picker.indices.value).toEqual([1, 1, 2]);
  });
});
