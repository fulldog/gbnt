import { describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";
import { useRegionPicker } from "@/components/region/useRegionPicker";
import { findRegion } from "@/utils/regions";
import { issueOrganization } from "@/utils/issue-display";
import { setupTodo, todoRegions } from "./helpers/todo-page";

describe("待办默认全部街道", () => {
  it("村账号默认全选，候选仍限本村范围，列表名称去斜线", async () => {
    const { state, loader } = setupTodo();
    await state.loadRegions();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledWith({ page: 1, size: 10 });
    expect(state.regionReady.value).toBe(true);
    expect(state.region.selectedId.value).toBeUndefined();
    expect(findRegion(state.region.tree.value, 13)).toBeUndefined();
    expect(findRegion(state.region.tree.value, 22)).toBeUndefined();
    expect(issueOrganization({ org_path: "甲街道 / 甲村" })).toBe("甲街道甲村");
  });
  it.each([13, 22])("首次进入不恢复旧村筛选 %s，清除筛选回到全部街道", async (remembered) => {
    const { state, storage, loader } = setupTodo(11);
    storage.set("gbnt:miniapp:todo-region:7", remembered);
    await state.loadRegions();
    expect(loader).toHaveBeenLastCalledWith({ page: 1, size: 10 });
    state.changeRegion({ id: 13, label: "甲街道乙村" });
    expect(loader).toHaveBeenLastCalledWith({ org_id: 13, page: 1, size: 10 });
    state.clearAllFilters();
    expect(loader).toHaveBeenLastCalledWith({ page: 1, size: 10 });
  });
  it("刷新发现所选村已删除时清除列表，避免旧记录出现在无区划状态", async () => {
    const { state, regions, loader } = setupTodo(11);
    await state.loadRegions(); state.changeRegion({ id: 12, label: "甲村" });
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2));
    regions.mockResolvedValueOnce({ list: [] });
    await state.refreshList();
    expect(state.regionReady.value).toBe(false); expect(state.items.value).toEqual([]);
    expect(loader).toHaveBeenCalledTimes(2);
  });
  it("账号切换后拒绝旧区划请求与旧选择", async () => {
    const { state, regions, user, loader } = setupTodo(11);
    let resolve!: (result: { list: typeof todoRegions }) => void;
    regions.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const pending = state.loadRegions();
    user.id = 8; user.org_id = 22;
    resolve({ list: todoRegions }); await pending;
    expect(loader).not.toHaveBeenCalled(); expect(state.regionReady.value).toBe(false);
    expect(state.region.select(12)).toBe(false);
    await state.loadRegions();
    expect(loader).toHaveBeenLastCalledWith({ page: 1, size: 10 });
    expect(findRegion(state.region.tree.value, 12)).toBeUndefined();
  });
  it("待办滚轮可选择全部、具体街道或村，隐藏容器不会提交", () => {
    const scope = effectScope();
    const emit = vi.fn();
    const picker = scope.run(() => useRegionPicker(() => todoRegions, () => null, emit, () => "filter", () => "street"))!;
    picker.open();
    expect(picker.selectedLabel.value).toBe("全部街道");
    expect(picker.columns.value[0]).toEqual([{ id: null, name: "全部街道" }, { id: 11, name: "甲街道" }, { id: 21, name: "乙街道" }]);
    expect(picker.selection.value).toEqual({ id: null, label: "全部街道" });
    picker.change([1, 0]);
    expect(picker.selection.value).toEqual({ id: 11, label: "甲街道" });
    picker.change([1, 2]);
    expect(picker.selection.value).toEqual({ id: 13, label: "甲街道乙村" });
    picker.change([0, 0]);
    picker.confirm(); expect(emit).toHaveBeenCalledWith({ id: null, label: "全部街道" });
    scope.stop();
  });
  it("具体村模式仍无全选项，无村的街道不能确认", () => {
    const emptyScope = effectScope();
    const emit = vi.fn();
    const noVillage = emptyScope.run(() => useRegionPicker(() => [{ ...todoRegions[0]!.children[0]!, children: [] }], () => null, emit, () => "village", () => "street"))!;
    noVillage.open(); expect(noVillage.selection.value).toBeNull(); noVillage.confirm();
    expect(noVillage.columns.value.flat().every((option) => option.id !== null)).toBe(true);
    expect(emit).not.toHaveBeenCalled(); emptyScope.stop();
  });
  it("刷新保留具体街道，失效后回到权限内全部街道", async () => {
    const { state, regions, loader } = setupTodo(1);
    await state.loadRegions();
    state.changeRegion({ id: 11, label: "甲街道" });
    await state.refreshList();
    expect(loader).toHaveBeenLastCalledWith({ page: 1, size: 10, org_id: 11 });
    regions.mockResolvedValueOnce({ list: [{ ...todoRegions[0]!, children: [todoRegions[0]!.children[1]!] }] });
    await state.refreshList();
    expect(state.regionReady.value).toBe(true);
    expect(state.region.selectedId.value).toBeUndefined();
    expect(loader).toHaveBeenLastCalledWith({ page: 1, size: 10 });
  });
});
