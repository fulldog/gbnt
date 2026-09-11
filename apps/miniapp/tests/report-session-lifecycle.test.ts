import { describe, expect, it, vi } from "vitest";
import { shallowRef, type Ref } from "vue";
import type { IssueType } from "@gbnt/api-client";
import * as reportWorkspace from "@/composables/report/useReportWorkspace";
import * as definitions from "@/domain/issues/definitions";
import { setupSfc } from "./helpers/setup-sfc";

interface ReportPageState {
  workspace: Ref<reportWorkspace.ReportWorkspace>;
  shown: Ref<boolean>;
  draftReady: Ref<boolean>;
  sessionRevision: Ref<number>;
  locationPickerActive: Ref<boolean>;
  saveType(type: IssueType, draft: reportWorkspace.ReportTypeDraft): void;
  selectType(type: IssueType): void;
}

function setupReportPage() {
  const storage = new Map<string, unknown>();
  const removeStorageSync = vi.fn((key: string) => storage.delete(key));
  vi.stubGlobal("uni", {
    removeStorageSync,
    pageScrollTo: vi.fn(),
    showToast: vi.fn(),
    reLaunch: vi.fn(),
  });

  const hooks = {
    load: async () => {},
    show: () => {},
    hide: () => {},
    unload: () => {},
  };
  const access = {
    ready: shallowRef(true),
    position: shallowRef(null),
    request: vi.fn().mockResolvedValue(undefined),
  };
  const loadRegions = vi.fn().mockResolvedValue(undefined);
  const state = setupSfc("pages/report/index.vue", {}, {
    "@dcloudio/uni-app": {
      onLoad: (callback: () => Promise<void>) => { hooks.load = callback; },
      onShow: (callback: () => void) => { hooks.show = callback; },
      onHide: (callback: () => void) => { hooks.hide = callback; },
      onUnload: (callback: () => void) => { hooks.unload = callback; },
      onShareAppMessage: vi.fn(),
      onShareTimeline: vi.fn(),
    },
    "@/components/common/PageTopInset.vue": {},
    "@/components/report/FacilityTypeTabs.vue": {},
    "@/components/report/ReportTypeForm.vue": {},
    "@/stores/auth": {
      useAuthStore: () => ({
        isAuthenticated: true,
        user: { id: 7 },
        restore: vi.fn().mockResolvedValue(undefined),
      }),
    },
    "@/composables/report/useRegions": {
      useRegions: () => ({
        tree: shallowRef([]),
        loading: shallowRef(false),
        error: shallowRef(""),
        load: loadRegions,
      }),
    },
    "@/composables/report/useInspectionAccess": { useInspectionAccess: () => access },
    "@/composables/report/useReportWorkspace": reportWorkspace,
    "@/domain/issues/definitions": definitions,
  }) as unknown as ReportPageState;

  return { state, hooks, storage, removeStorageSync, access };
}

describe("巡查表单页面会话", () => {
  it("页内切换保留输入，切到其他页面后清空全部类型并拒绝迟到回写", async () => {
    const { state, hooks, storage } = setupReportPage();
    storage.set("gbnt:miniapp:report-draft:v1", { old: true });
    storage.set("gbnt:miniapp:report-draft:v2:user:7", { old: true });
    storage.set(reportWorkspace.workspaceStorageKey(7), { old: true });
    await hooks.load();

    const well = reportWorkspace.createTypeDraft("well");
    well.form.address = "本次填写的机井地址";
    state.saveType("well", well);
    state.selectType("road");
    const road = reportWorkspace.createTypeDraft("road");
    road.form.address = "本次填写的道路地址";
    state.saveType("road", road);

    expect(state.workspace.value.drafts.well!.form.address).toBe("本次填写的机井地址");
    expect(state.workspace.value.drafts.road!.form.address).toBe("本次填写的道路地址");
    const previousRevision = state.sessionRevision.value;

    hooks.hide();

    expect(state.shown.value).toBe(false);
    expect(state.sessionRevision.value).toBe(previousRevision + 1);
    expect(state.workspace.value.activeType).toBe("well");
    expect(state.workspace.value.drafts.road).toBeUndefined();
    expect(state.workspace.value.drafts.well!.form.address).toBe("");
    state.saveType("road", road);
    expect(state.workspace.value.drafts.road).toBeUndefined();
    expect(storage.size).toBe(0);

    hooks.show();
    expect(state.shown.value).toBe(true);
    expect(state.workspace.value.drafts.well!.form.address).toBe("");
  });

  it("页面卸载时也清空内存表单", async () => {
    const { state, hooks } = setupReportPage();
    await hooks.load();
    const well = reportWorkspace.createTypeDraft("well");
    well.form.address = "卸载前的地址";
    state.saveType("well", well);

    hooks.unload();

    expect(state.shown.value).toBe(false);
    expect(state.workspace.value.drafts.well!.form.address).toBe("");
    state.saveType("well", well);
    expect(state.workspace.value.drafts.well!.form.address).toBe("");
  });

  it("原生地图遮挡页面时保留表单，地图关闭后的真实离开仍会清空", async () => {
    const { state, hooks } = setupReportPage();
    await hooks.load();
    const well = reportWorkspace.createTypeDraft("well");
    well.form.address = "地图选择前的地址";
    state.saveType("well", well);
    const previousRevision = state.sessionRevision.value;

    state.locationPickerActive.value = true;
    hooks.hide();

    expect(state.shown.value).toBe(true);
    expect(state.sessionRevision.value).toBe(previousRevision);
    expect(state.workspace.value.drafts.well!.form.address).toBe("地图选择前的地址");

    state.locationPickerActive.value = false;
    hooks.hide();
    expect(state.shown.value).toBe(false);
    expect(state.workspace.value.drafts.well!.form.address).toBe("");
  });
});
