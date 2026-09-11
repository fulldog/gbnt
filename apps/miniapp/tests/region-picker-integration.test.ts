import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import * as vue from "vue";
import { parse } from "vue/compiler-sfc";
import type { OrgTreeNode } from "@gbnt/api-client";
import * as pickerLogic from "@/components/region/useRegionPicker";
import { setupSfc } from "./helpers/setup-sfc";
import { setupTodo } from "./helpers/todo-page";

const village: OrgTreeNode = { id: 3, name: "甲村", type: "village", parent_id: 2, sort: 0, children: [] };
const tree: OrgTreeNode[] = [{ id: 1, name: "甲区", type: "district", parent_id: 0, sort: 0,
  children: [{ id: 2, name: "甲街道", type: "street", parent_id: 1, sort: 0, children: [village] }] }];

function picker(mode: "leaf" | "filter" = "filter", startLevel: "district" | "street" = "district") {
  const props = vue.reactive({ tree, value: null as number | null, label: "", mode, startLevel, loading: false, error: "", disabled: false });
  const emit = vi.fn();
  let hide = () => {};
  vi.stubGlobal("uni", { hideKeyboard: vi.fn() });
  const state = setupSfc("components/region/RegionPicker.vue", props, {
    "./useRegionPicker": pickerLogic,
    "@dcloudio/uni-app": { onHide: (callback: () => void) => { hide = callback; } },
  }, emit) as unknown as {
    show: () => void; cancel: () => void; commit: () => void;
    onChange: (event: { detail: { value: number[] } }) => void;
    opened: vue.Ref<boolean>; rolling: vue.Ref<boolean>; triggerLabel: vue.Ref<string>;
  };
  return { props, emit, state, hide: () => hide() };
}

describe("共享行政区划组件接入", () => {
  it("筛选候选不会提前回填，取消保持原值，确认可提交真实上级 ID", () => {
    const { state, emit } = picker();
    state.show();
    state.onChange({ detail: { value: [1, 0, 0] } });
    expect(state.triggerLabel.value).toBe("全部区域");
    expect(emit).not.toHaveBeenCalled();
    state.cancel();
    expect(emit).not.toHaveBeenCalled();
    state.show();
    state.onChange({ detail: { value: [1, 0, 0] } });
    state.commit();
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith("select", { id: 1, label: "甲区" });
  });

  it("滚动过程中不能确认，页面隐藏会关闭弹窗且不提交", () => {
    const { state, emit, hide } = picker();
    state.show();
    state.rolling.value = true;
    state.commit();
    expect(emit).not.toHaveBeenCalled();
    hide();
    expect(state.opened.value).toBe(false);
    state.rolling.value = false;
    state.commit();
    expect(emit).not.toHaveBeenCalled();
  });

  it("创建模式仍提交末级区域；加载、错误及禁用状态拦截确认", async () => {
    const { state, props, emit } = picker("leaf");
    state.show();
    props.loading = true;
    state.commit();
    props.loading = false;
    props.error = "加载失败";
    state.commit();
    expect(emit).not.toHaveBeenCalled();
    props.error = "";
    props.disabled = true;
    await vue.nextTick();
    expect(state.opened.value).toBe(false);
    props.disabled = false;
    state.show();
    state.commit();
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith("select", { id: 3, label: "甲区甲街道甲村" });
  });

  it("街道两列初始展示全部街道，确认后才回填具体街道", () => {
    const { state, props, emit } = picker("filter", "street");
    expect(state.triggerLabel.value).toBe("全部街道");
    state.show();
    state.onChange({ detail: { value: [1, 0] } });
    expect(state.triggerLabel.value).toBe("全部街道");
    state.commit();
    expect(emit).toHaveBeenCalledWith("select", { id: 2, label: "甲街道" });
    props.value = 2;
    expect(state.triggerLabel.value).toBe("甲街道");
  });

  it("待办默认全选，可选权限内街道或村，清除筛选恢复全选", async () => {
    const { state, loader } = setupTodo(11);
    await state.loadRegions();
    expect(loader).toHaveBeenLastCalledWith({ page: 1, size: 10 });
    state.changeRegion({ id: 11, label: "甲街道" });
    expect(loader).toHaveBeenLastCalledWith({ page: 1, size: 10, org_id: 11 });
    const requests = loader.mock.calls.length;
    state.changeRegion({ id: 22, label: "其他街道的村" });
    state.changeRegion({ id: -1, label: "隐藏容器" });
    expect(loader).toHaveBeenCalledTimes(requests);
    state.changeRegion({ id: 12, label: "甲街道甲村" });
    await state.reload({ keyword: "1188", status: "done", type: "well" });
    expect(loader).toHaveBeenLastCalledWith({ page: 1, size: 10, keyword: "1188", status: "done", type: "well", org_id: 12 });
    state.clearAllFilters();
    expect(loader).toHaveBeenLastCalledWith({ page: 1, size: 10 });
  });

  it("创建和筛选只引用同一个组件，弹窗不再渲染底部已选路径", () => {
    const read = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
    for (const path of ["components/report/ReportTypeForm.vue", "pages/todo/index.vue"]) {
      expect(read(path)).toContain('import RegionPicker from "@/components/region/RegionPicker.vue"');
      expect(read(path)).toContain("<RegionPicker");
    }
    const { descriptor } = parse(read("components/region/RegionPicker.vue"));
    expect(descriptor.template!.content).not.toContain("region-picker__summary");
    expect(descriptor.template!.content).not.toContain("selection?.label");
  });
});
