import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReportDraft, reportDraftStorageKey } from "@/composables/report/useReportDraft";
import { createReportForm } from "@/domain/issues/form";
import { readRectifyNotes, rectifyDraftKey, saveRectifyNotes } from "@/utils/rectify-draft";
import { createMiniappAttachmentsApi } from "@/api/attachments";

const storage = new Map<string, unknown>();
const setStorage = vi.fn((key: string, value: unknown) => storage.set(key, value));
const removeStorage = vi.fn((key: string) => storage.delete(key));
beforeEach(() => {
  storage.clear();
  setStorage.mockClear();
  removeStorage.mockClear();
  vi.stubGlobal("uni", { getStorageSync: (key: string) => storage.get(key), setStorageSync: setStorage, removeStorageSync: removeStorage });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("草稿恢复真实性", () => {
  it("存储满时显示失败，重试成功后才显示已保存", () => {
    const draft = useReportDraft(7);
    const form = createReportForm();
    form.address = "真实地址";
    setStorage.mockImplementationOnce(() => { throw new Error("quota"); });
    draft.saveDraft(form);
    expect(draft.saveState.value).toBe("failed");
    draft.saveDraft(form);
    expect(draft.saveState.value).toBe("saved");
    expect(draft.loadDraft()?.address).toBe("真实地址");
  });

  it("清理失败不谎报已清空", () => {
    const draft = useReportDraft(7);
    const form = createReportForm();
    form.address = "已经提交的地址";
    draft.saveDraft(form);
    removeStorage.mockImplementationOnce((key) => storage.delete(key));
    removeStorage.mockImplementationOnce(() => { throw new Error("storage unavailable"); });
    expect(draft.clearDraft()).toBe(false);
    expect(draft.saveState.value).toBe("failed");
    expect(storage.has(reportDraftStorageKey(7))).toBe(true);
  });

  it("恢复时按正式题目顺序重排，避免逐题向导显示错配", () => {
    const form = createReportForm();
    const order = form.quizzes.map((quiz) => quiz.type);
    form.quizzes[0]!.desc = "第一题的说明";
    form.quizzes.reverse();
    const draft = useReportDraft(7);
    draft.saveDraft(form);
    const restored = draft.loadDraft()!;
    expect(restored.quizzes.map((quiz) => quiz.type)).toEqual(order);
    expect(restored.quizzes[0]!.desc).toBe("第一题的说明");
  });

  it("整改文字按用户、记录和轮次隔离且不持久化临时照片", () => {
    const key = rectifyDraftKey(7, 42, 1);
    const draft = { type: "water_out" as const, note: "已处理", selected: true, photoPaths: ["temporary-path"] };
    expect(saveRectifyNotes(key, [draft])).toBe(true);
    expect(storage.get(key)).toEqual([{ type: "water_out", note: "已处理", selected: true }]);
    expect(readRectifyNotes(rectifyDraftKey(7, 42, 2), ["water_out"])).toEqual([]);
    expect(readRectifyNotes(rectifyDraftKey(8, 42, 1), ["water_out"])).toEqual([]);
    expect(readRectifyNotes(key, ["water_out"])).toHaveLength(1);
  });

  it("损坏整改草稿仅恢复仍存在的有效题目", () => {
    const key = rectifyDraftKey(7, 42, 0);
    storage.set(key, [null, {}, { type: "water_out", note: 123, selected: true }, { type: "tree_dead", note: "旧题", selected: true }, { type: "water_out", note: "保留", selected: false }]);
    expect(readRectifyNotes(key, ["water_out"])).toEqual([{ type: "water_out", note: "保留", selected: false }]);
    expect(rectifyDraftKey(undefined, 42, 0)).toBe("");
    expect(rectifyDraftKey(7, -1, 0)).toBe("");
  });
});

describe("上传结果契约", () => {
  it.each([null, { list: null }, { list: [] }, { list: [{}] }, { list: [{ file_id: "", url: "/a.png" }] }])("缺少附件有效结果时不给页面写假成功：%j", async (data) => {
    const api = createMiniappAttachmentsApi({ baseUrl: "https://unit.test", uploadFile: (options) => {
      options.success({ statusCode: 200, data: JSON.stringify({ code: 0, data, message: "ok", cost_ms: 0, trace_id: "unit" }) });
    } });
    await expect(api.uploadImages({ files: [{ filePath: "one" }] })).rejects.toThrow("照片上传结果异常");
  });
});
