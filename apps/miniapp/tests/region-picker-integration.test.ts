import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as vue from "vue";
import { compileScript, parse } from "vue/compiler-sfc";
import ts from "typescript";
import type { OrgTreeNode } from "@gbnt/api-client";
import * as pickerLogic from "@/components/region/useRegionPicker";
import { usePagedIssues } from "@/composables/usePagedIssues";
import * as issueDisplay from "@/utils/issue-display";

const scopes: ReturnType<typeof vue.effectScope>[] = [];
afterEach(() => { scopes.splice(0).forEach((scope) => scope.stop()); vi.unstubAllGlobals(); });

/** 编译并执行实际 SFC 的 setup，验证页面事件接线，不用复制一份处理函数代替。 */
function setupSfc(path: string, props: object, imports: Record<string, unknown>, emit = vi.fn()) {
  const filename = fileURLToPath(new URL(`../src/${path}`, import.meta.url));
  const { descriptor } = parse(readFileSync(filename, "utf8"), { filename });
  const compiled = compileScript(descriptor, { id: path });
  const { outputText } = ts.transpileModule(compiled.content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} as { default: { setup: (props: object, context: object) => Record<string, unknown> } } };
  const require = (name: string) => {
    if (name === "vue") return vue;
    if (name in imports) return imports[name];
    throw new Error(`Unexpected component import: ${name}`);
  };
  new Function("require", "module", "exports", outputText)(require, module, module.exports);
  const scope = vue.effectScope();
  scopes.push(scope);
  return scope.run(() => module.exports.default.setup(props, { expose: () => {}, emit }))!;
}

const village: OrgTreeNode = { id: 3, name: "甲村", type: "village", parent_id: 2, sort: 0, children: [] };
const tree: OrgTreeNode[] = [{ id: 1, name: "甲区", type: "district", parent_id: 0, sort: 0,
  children: [{ id: 2, name: "甲街道", type: "street", parent_id: 1, sort: 0, children: [village] }] }];

function picker(mode: "leaf" | "filter" = "filter") {
  const props = vue.reactive({ tree, value: null as number | null, label: "", mode, loading: false, error: "", disabled: false });
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
    expect(emit).toHaveBeenCalledWith("select", { id: 3, label: "甲区 / 甲街道 / 甲村" });
  });

  it("待办页面确认区域后从第一页查询，全部区域清除 org_id 并保留其他筛选", async () => {
    const loader = vi.fn().mockResolvedValue({ list: [], total: 0, page: 1, size: 10 });
    let listState: ReturnType<typeof usePagedIssues>;
    const state = setupSfc("pages/todo/index.vue", {}, {
      "@dcloudio/uni-app": { onLoad: vi.fn(), onShow: vi.fn(), onUnload: vi.fn(), onPullDownRefresh: vi.fn(), onReachBottom: vi.fn() },
      "@/api/runtime": { miniappApi: { regions: { list: vi.fn() } } },
      "@/components/issue/IssueCard.vue": {},
      "@/components/region/RegionPicker.vue": {},
      "@/composables/usePagedIssues": { usePagedIssues: () => (listState = usePagedIssues(loader)) },
      "@/composables/useBusinessToday": { useBusinessToday: () => vue.shallowRef("2026-09-06") },
      "@/utils/issue-display": issueDisplay,
    }) as unknown as { changeRegion: (selection: pickerLogic.RegionSelection) => void; clearAllFilters: () => void };
    await listState!.reload({ keyword: "1188", status: "done", type: "well", projectYear: 2023 });
    state.changeRegion({ id: 2, label: "甲区 / 甲街道" });
    expect(loader).toHaveBeenLastCalledWith({ page: 1, size: 10, keyword: "1188", status: "done", type: "well", project_year: 2023, org_id: 2 });
    state.changeRegion({ id: null, label: "全部区域" });
    expect(loader).toHaveBeenLastCalledWith({ page: 1, size: 10, keyword: "1188", status: "done", type: "well", project_year: 2023 });
    state.clearAllFilters();
    expect(loader).toHaveBeenLastCalledWith({ page: 1, size: 10 });
  });

  it("创建和筛选只引用同一个组件，弹窗不再渲染底部已选路径", () => {
    const read = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
    for (const path of ["pages/report/index.vue", "pages/todo/index.vue"]) {
      expect(read(path)).toContain('import RegionPicker from "@/components/region/RegionPicker.vue"');
      expect(read(path)).toContain("<RegionPicker");
    }
    const { descriptor } = parse(read("components/region/RegionPicker.vue"));
    expect(descriptor.template!.content).not.toContain("region-picker__summary");
    expect(descriptor.template!.content).not.toContain("selection?.label");
  });
});
