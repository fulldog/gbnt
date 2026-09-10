import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createReportWorkspace, createTypeDraft, selectWorkspaceType, useReportWorkspace, workspaceStorageKey } from "@/composables/report/useReportWorkspace";
import { ISSUE_TYPE_OPTIONS } from "@/domain/issues/definitions";
import { useReportDraft } from "@/composables/report/useReportDraft";

const storage = new Map<string, unknown>();
beforeEach(() => {
  storage.clear();
  vi.stubGlobal("uni", { getStorageSync: (key: string) => storage.get(key), setStorageSync: (key: string, value: unknown) => storage.set(key, value), removeStorageSync: (key: string) => storage.delete(key), showModal: vi.fn() });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("五类巡查独立草稿", () => {
  it("旧编号和手动清空迁移为手动，旧建议值迁移为自动，模式随类型保存", () => {
    const workspace = createReportWorkspace();
    workspace.drafts.well!.form.code = "01";
    selectWorkspaceType(workspace, "road");
    workspace.drafts.road!.form.codeSource = "manual";
    selectWorkspaceType(workspace, "bridge");
    Object.assign(workspace.drafts.bridge!.form, { code: "03", codeSource: "auto" });
    const draft = useReportWorkspace(() => 7);
    draft.save(workspace);
    const restored = draft.load();
    expect(restored.drafts.well!.form).toMatchObject({ code: "01", codeMode: "manual" });
    expect(restored.drafts.road!.form).toMatchObject({ code: "", codeMode: "manual" });
    expect(restored.drafts.bridge!.form).toMatchObject({ code: "", codeMode: "auto" });
    expect(restored.drafts.bridge!.form.codeSource).toBeUndefined();
  });
  it("往返切换保留各自字段、照片、签名和步骤，不询问或清空", () => {
    const workspace = createReportWorkspace();
    for (const { value: type } of ISSUE_TYPE_OPTIONS) {
      selectWorkspaceType(workspace, type);
      const draft = workspace.drafts[type]!;
      draft.form.address = `${type} 的地址`;
      draft.form.quizzes[0]!.photos = [{ fileId: type, url: `/${type}.jpg` }];
      draft.form.signatureStrokes = [[{ x: .2, y: .3 }]];
      draft.step = 3;
    }
    for (const { value: type } of [...ISSUE_TYPE_OPTIONS].reverse()) {
      selectWorkspaceType(workspace, type);
      expect(workspace.drafts[type]).toMatchObject({ step: 3, form: { address: `${type} 的地址`, signatureStrokes: [[{ x: .2, y: .3 }]] } });
      expect(workspace.drafts[type]!.form.quizzes[0]!.photos[0]!.fileId).toBe(type);
    }
    expect(uni.showModal).not.toHaveBeenCalled();
  });
  it("重新进入恢复最后类型和步骤，按账号隔离", () => {
    const workspace = createReportWorkspace();
    selectWorkspaceType(workspace, "bridge");
    workspace.drafts.bridge!.step = 3;
    workspace.drafts.bridge!.form.projectYear = 2021;
    const drafts = useReportWorkspace(() => 7);
    expect(drafts.save(workspace)).toBe(true);
    expect(drafts.load()).toMatchObject({ activeType: "bridge", drafts: { bridge: { step: 3, form: { projectYear: 2021 } } } });
    expect(useReportWorkspace(() => 8).load().drafts.bridge).toBeUndefined();
  });
  it("提交清理只作用于成功类型，其余草稿继续保留", () => {
    const workspace = createReportWorkspace();
    workspace.drafts.well!.form.address = "机井草稿";
    selectWorkspaceType(workspace, "road");
    workspace.drafts.road!.form.address = "道路草稿";
    const drafts = useReportWorkspace(() => 7);
    drafts.clearType(workspace, "road");
    expect(drafts.load().drafts.well!.form.address).toBe("机井草稿");
    expect(drafts.load().drafts.road!.form.address).toBe("");
    expect(drafts.load().drafts.road!.form.projectYear).toBeNull();
  });
  it("切换后原类型上传回调不会写入当前类型", () => {
    const workspace = createReportWorkspace();
    const well = workspace.drafts.well!;
    selectWorkspaceType(workspace, "road");
    well.form.quizzes[0]!.photos.push({ fileId: "well-upload", url: "/watermarked.jpg" });
    expect(workspace.drafts.road!.form.quizzes[0]!.photos).toEqual([]);
    expect(workspace.drafts.well!.form.quizzes[0]!.photos[0]!.fileId).toBe("well-upload");
  });
  it("旧草稿静默迁移，旧默认年份不视为已选择", () => {
    const legacy = useReportDraft(7);
    const form = createTypeDraft("forest").form;
    form.address = "旧草稿"; form.projectYear = 2023;
    legacy.saveDraft(form);
    const workspace = useReportWorkspace(() => 7).load();
    expect(workspace.activeType).toBe("forest");
    expect(workspace.drafts.forest!.form.address).toBe("旧草稿");
    expect(workspace.drafts.forest!.form.projectYear).toBeNull();
    expect(storage.has(workspaceStorageKey(7))).toBe(true);
    expect(uni.showModal).not.toHaveBeenCalled();
  });
  it("损坏或跨类型草稿不能作为当前表单恢复", () => {
    storage.set(workspaceStorageKey(7), { version: 3, ownerUserId: 7, workspace: { activeType: "road", drafts: { road: createTypeDraft("bridge") } } });
    expect(useReportWorkspace(() => 7).load().drafts.road!.form.type).toBe("road");
  });
  it("存储失败返回失败状态，保留内存中的各类内容供重试", () => {
    vi.spyOn(uni, "setStorageSync").mockImplementationOnce(() => { throw new Error("quota"); });
    const workspace = createReportWorkspace(); workspace.drafts.well!.form.address = "待保存";
    const drafts = useReportWorkspace(() => 7);
    expect(drafts.save(workspace)).toBe(false);
    expect(drafts.saveState.value).toBe("failed");
    expect(workspace.drafts.well!.form.address).toBe("待保存");
    expect(drafts.save(workspace)).toBe(true);
  });
});
