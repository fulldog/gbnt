import { describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";
import { useRegionPicker } from "@/components/region/useRegionPicker";
import { findRegion } from "@/utils/regions";
import { issueOrganization } from "@/utils/issue-display";
import { setupTodo, todoRegions } from "./helpers/todo-page";

describe("待办具体区划", () => {
  it("村账号首次查询直接带本村 ID，列表名称去斜线", async () => {
    const { state, loader } = setupTodo();
    await state.loadRegions();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledWith({ org_id: 12, page: 1, size: 10 });
    expect(findRegion(state.region.tree.value, 13)).toBeUndefined();
    expect(findRegion(state.region.tree.value, 22)).toBeUndefined();
    expect(issueOrganization({ org_path: "甲街道 / 甲村" })).toBe("甲街道甲村");
  });
  it("街道账号恢复有权限的已选村，失效记忆不会退回全部区域", async () => {
    const { state, storage, loader } = setupTodo(11);
    storage.set("gbnt:miniapp:todo-region:7", 22);
    await state.loadRegions(); expect(loader).not.toHaveBeenCalled();
    storage.set("gbnt:miniapp:todo-region:7", 13);
    await state.loadRegions();
    expect(loader).toHaveBeenLastCalledWith({ org_id: 13, page: 1, size: 10 });
    state.clearAllFilters();
    expect(loader).toHaveBeenLastCalledWith({ org_id: 13, page: 1, size: 10 });
  });
  it("刷新发现所选村已删除时清除列表，避免旧记录出现在无区划状态", async () => {
    const { state, regions, loader } = setupTodo(11);
    await state.loadRegions(); state.changeRegion({ id: 12, label: "甲村" });
    await vi.waitFor(() => expect(loader).toHaveBeenCalledOnce());
    regions.mockResolvedValueOnce({ list: [] });
    await state.refreshList();
    expect(state.regionReady.value).toBe(false); expect(state.items.value).toEqual([]);
    expect(loader).toHaveBeenCalledOnce();
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
    expect(loader).toHaveBeenLastCalledWith({ org_id: 22, page: 1, size: 10 });
  });
  it("待办滚轮只有真实街道和村，无村的街道不能确认", () => {
    const scope = effectScope();
    const emit = vi.fn();
    const picker = scope.run(() => useRegionPicker(() => todoRegions, () => null, emit, () => "village", () => "street"))!;
    picker.open();
    expect(picker.columns.value.flat().every((node) => node.id !== null && !node.name.startsWith("全部"))).toBe(true);
    picker.confirm(); expect(emit).toHaveBeenCalledWith({ id: 12, label: "甲街道甲村" });
    scope.stop();
    const emptyScope = effectScope();
    const noVillage = emptyScope.run(() => useRegionPicker(() => [{ ...todoRegions[0]!.children[0]!, children: [] }], () => null, emit, () => "village", () => "street"))!;
    noVillage.open(); expect(noVillage.selection.value).toBeNull(); noVillage.confirm();
    expect(emit).toHaveBeenCalledOnce(); emptyScope.stop();
  });
});
