import { describe, expect, it, vi } from "vitest";
import { reactive, shallowRef, type Ref } from "vue";
import type { MiniappIssue } from "@/api/types";
import { createIssuesApi } from "@/api/issues";
import { createMiniappApiClient } from "@/api/client";
import * as display from "@/utils/issue-display";
import * as regions from "@/utils/regions";
import * as drafts from "@/utils/rectify-draft";
import { setupSfc } from "./helpers/setup-sfc";

function issue(): MiniappIssue {
  return { id: 9, type: "road", status: "pending", project_year: 2023, org_id: 12, code: "01", issue_key: "I-9", report_user_id: 7, assignee_user: 7,
    rectify_round: 1, rectify_records: [], address: "甲村", lat: 36.4, lng: 115.9, plan_date: "2026-10-01", created_at: "2026-09-01T00:00:00Z",
    type_ext: { checklist: [{ type: "has_shoulder", value: false, mustImg: false, files: [], desc: "路肩缺失", photos: [] }, { type: "has_ash", value: true, mustImg: false, files: [], desc: "", photos: [] }] },
  } as unknown as MiniappIssue;
}

function detail() {
  const item = issue();
  const auth = reactive({ user: { id: 7 } });
  const api = { issues: { get: vi.fn().mockResolvedValue(item), submitFeedback: vi.fn().mockResolvedValue({ ...item, status: "done" }) },
    attachments: { uploadImages: vi.fn().mockResolvedValue({ list: [{ file_id: "photo-1" }] }) } };
  const uni = { setNavigationBarTitle: vi.fn(), showToast: vi.fn(), showModal: vi.fn(), navigateBack: vi.fn(), switchTab: vi.fn() };
  vi.stubGlobal("uni", uni);
  let unload = () => {};
  const state = setupSfc("pages-sub/issue/detail.vue", {}, {
    "@dcloudio/uni-app": { onLoad: vi.fn(), onPullDownRefresh: vi.fn(), onShareAppMessage: vi.fn(), onShareTimeline: vi.fn(), onUnload: (callback: () => void) => { unload = callback; } },
    "@/api/runtime": { miniappApi: api, toAssetUrl: (url: string) => url },
    "@/components/issue/IssueChecklist.vue": {}, "@/components/issue/IssueInfoList.vue": {},
    "@/components/issue/IssuePhotoGrid.vue": {},
    "@/components/issue/IssueRectifyHistory.vue": {}, "@/components/issue/IssueRectifyResult.vue": {},
    "@/components/issue/RectifyForm.vue": {}, "@/components/common/RecoverableImage.vue": {},
    "@/stores/auth": { useAuthStore: () => auth }, "@/utils/rectify-draft": drafts, "@/utils/regions": regions,
    "@/composables/useBusinessToday": { useBusinessToday: () => shallowRef("2026-09-10") },
    "@/domain/issues/definitions": { issueTypeLabel: () => "道路" }, "@/utils/issue-display": display,
  }) as unknown as {
    issueId: Ref<number>; issue: Ref<MiniappIssue>; canRectify: Ref<boolean>;
    rectifyFormRef: Ref<{ discardSubmitted: () => void }>;
    loadDetail: () => Promise<void>;
    submitRectification: (draft: { note: string; photoPaths: string[] }) => Promise<void>;
  };
  state.issueId.value = 9;
  const discard = vi.fn(); state.rectifyFormRef.value = { discardSubmitted: discard };
  return { state, auth, api, uni, discard, unload: () => unload() };
}

describe("整单整改反馈", () => {
  it("上传一次并使用整单接口，成功后清理草稿并展示完成状态", async () => {
    const { state, api, discard } = detail();
    await state.loadDetail();
    await state.submitRectification({ note: "已修复", photoPaths: ["/temp/a.png"] });
    expect(api.issues.submitFeedback).toHaveBeenCalledWith(9, { note: "已修复", file_uuids: ["photo-1"], expected_round: 1 });
    expect(api.attachments.uploadImages).toHaveBeenCalledWith(expect.objectContaining({ watermark: true, lat: "36.4", lng: "115.9", address: "甲村" }));
    expect(discard).toHaveBeenCalledOnce();
    expect(state.canRectify.value).toBe(false);
  });
  it("提交失败保留草稿和已上传照片，重试不重复上传", async () => {
    const { state, api, discard } = detail();
    await state.loadDetail();
    api.issues.submitFeedback.mockRejectedValueOnce(new Error("网络断开"));
    const input = { note: "已修复", photoPaths: ["/temp/a.png"] };
    await state.submitRectification(input);
    expect(discard).not.toHaveBeenCalled();
    expect(state.canRectify.value).toBe(true);
    await state.submitRectification(input);
    expect(api.attachments.uploadImages).toHaveBeenCalledOnce();
    expect(discard).toHaveBeenCalledOnce();
  });
  it("只有整改责任人可以提交反馈", async () => {
    const { state, auth, api } = detail();
    await state.loadDetail();
    auth.user.id = 8;
    expect(state.canRectify.value).toBe(false);
    await state.submitRectification({ note: "修复", photoPaths: ["/p"] });
    expect(api.issues.submitFeedback).not.toHaveBeenCalled();
  });
  it("离开页面后迟到的照片上传结果不能再提交反馈", async () => {
    const { state, api, unload } = detail();
    await state.loadDetail();
    let resolve!: (value: { list: { file_id: string }[] }) => void;
    api.attachments.uploadImages.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const pending = state.submitRectification({ note: "修复", photoPaths: ["/p"] });
    unload(); resolve({ list: [{ file_id: "photo-1" }] }); await pending;
    expect(api.issues.submitFeedback).not.toHaveBeenCalled();
  });
  it("正式 API 方法同步反馈路径、参数及旧版本删除契约", async () => {
    const request = vi.fn((options) => options.success({ statusCode: 200, data: { code: 0, data: options.method === "DELETE" ? null : issue(), message: "ok" }, header: {} }));
    const client = createMiniappApiClient({ baseUrl: "https://example.test", request });
    const api = createIssuesApi(client);
    await api.submitFeedback(9, { note: "修复", file_uuids: ["photo-1"], expected_round: 1 });
    expect(request.mock.calls[0]![0]).toMatchObject({ method: "POST", url: "https://example.test/api/app/issues/9/feedback", data: { note: "修复", file_uuids: ["photo-1"], expected_round: 1 } });
    expect(await api.deleteReported(9)).toBeNull();
    expect(request.mock.calls[1]![0]).toMatchObject({ method: "DELETE", url: "https://example.test/api/app/issues/9" });
  });
});

describe("整改说明兼容", () => {
  it("旧分项文字合并后可以编辑或清空，成功后同时移除旧草稿", () => {
    const storage = new Map<string, unknown>();
    vi.stubGlobal("uni", { getStorageSync: (key: string) => storage.get(key), setStorageSync: (key: string, value: unknown) => storage.set(key, value), removeStorageSync: (key: string) => storage.delete(key) });
    const key = drafts.rectifyDraftKey(7, 9, 1);
    storage.set(key, [{ type: "has_shoulder", note: "路肩修复", selected: true }, { type: "has_ash", note: "杂物清除", selected: true }]);
    expect(drafts.readRectifyFeedback(key, ["has_shoulder", "has_ash"])).toBe("路肩修复\n杂物清除");
    drafts.saveRectifyFeedback(key, "新说明"); expect(drafts.readRectifyFeedback(key, [])).toBe("新说明");
    drafts.saveRectifyFeedback(key, ""); expect(drafts.readRectifyFeedback(key, ["has_shoulder"])).toBe("");
    drafts.clearRectifyFeedback(key); expect(storage.size).toBe(0);
  });
});
