import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearStoredReportDrafts,
  createReportWorkspace,
  selectWorkspaceType,
  workspaceStorageKey,
} from "@/composables/report/useReportWorkspace";
import { ISSUE_TYPE_OPTIONS } from "@/domain/issues/definitions";

const storage = new Map<string, unknown>();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("uni", {
    getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
    removeStorageSync: vi.fn((key: string) => storage.delete(key)),
    showModal: vi.fn(),
  });
});

afterEach(() => { vi.unstubAllGlobals(); });

describe("五类巡查页内表单", () => {
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
      expect(workspace.drafts[type]).toMatchObject({
        step: 3,
        form: { address: `${type} 的地址`, signatureStrokes: [[{ x: .2, y: .3 }]] },
      });
      expect(workspace.drafts[type]!.form.quizzes[0]!.photos[0]!.fileId).toBe(type);
    }
    expect(uni.showModal).not.toHaveBeenCalled();
  });

  it("新页面会话始终从空白机井表单开始", () => {
    const previous = createReportWorkspace();
    selectWorkspaceType(previous, "bridge");
    previous.drafts.bridge!.form.address = "上一页填写的地址";
    previous.drafts.bridge!.step = 3;

    const next = createReportWorkspace();

    expect(next.activeType).toBe("well");
    expect(next.drafts.bridge).toBeUndefined();
    expect(next.drafts.well).toMatchObject({
      step: 1,
      form: { address: "", projectYear: null, orgId: null, signatureStrokes: [] },
    });
  });

  it("进入页面时删除设备内全部旧版巡查草稿且不影响其他数据", () => {
    const keys = [
      "gbnt:miniapp:report-draft:v1",
      "gbnt:miniapp:report-draft:v2:user:7",
      workspaceStorageKey(7),
    ];
    keys.forEach((key) => storage.set(key, { old: true }));
    storage.set(workspaceStorageKey(8), { otherUser: true });
    storage.set("gbnt:miniapp:other", { keep: true });

    clearStoredReportDrafts(7);

    keys.forEach((key) => expect(storage.has(key)).toBe(false));
    expect(storage.has(workspaceStorageKey(8))).toBe(false);
    expect(storage.has("gbnt:miniapp:other")).toBe(true);
  });

  it("单个旧草稿删除失败时仍继续清理其余版本", () => {
    const removeStorageSync = vi.mocked(uni.removeStorageSync);
    removeStorageSync.mockImplementationOnce(() => { throw new Error("storage unavailable"); });

    clearStoredReportDrafts(7);

    expect(removeStorageSync).toHaveBeenCalledTimes(3);
  });

  it("切换后原类型上传回调不会写入当前类型", () => {
    const workspace = createReportWorkspace();
    const well = workspace.drafts.well!;
    selectWorkspaceType(workspace, "road");
    well.form.quizzes[0]!.photos.push({ fileId: "well-upload", url: "/watermarked.jpg" });
    expect(workspace.drafts.road!.form.quizzes[0]!.photos).toEqual([]);
    expect(workspace.drafts.well!.form.quizzes[0]!.photos[0]!.fileId).toBe("well-upload");
  });
});
