import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive, nextTick, type Ref } from "vue";
import { setupSfc } from "./helpers/setup-sfc";
import * as definitions from "@/domain/issues/definitions";
import * as forms from "@/domain/issues/form";
import * as mapper from "@/domain/issues/mapper";
import * as validation from "@/domain/issues/validation";
import * as events from "@/utils/events";
import * as display from "@/utils/issue-display";
import { ApiError, FACILITY_CODE_CONFLICT } from "@gbnt/api-client";

const api = { issues: { create: vi.fn() }, attachments: { uploadImages: vi.fn() } };
function validTransformer() {
  const form = forms.createReportForm("transformer");
  Object.assign(form, { projectYear: 2022, orgId: 3, orgLabel: "街道 / 村", code: "保持原设施编号", address: "现场地址", lat: 36, lng: 116, signatureFileId: "signed", signaturePreviewUrl: "/signature.png", planDate: "2026-09-20" });
  form.details.capacity = "100";
  for (const quiz of form.quizzes) { quiz.value = true; quiz.desc = "现场情况"; quiz.photos = [{ fileId: "photo", url: "/watermarked.jpg" }]; }
  return form;
}
function setup(form = validTransformer(), visible = true) {
  const props = reactive({ draft: { form, step: definitions.QUIZ_DEFINITIONS[form.type].length + 2 }, visible, regionTree: [], regionsLoading: false, regionsError: "" });
  const emit = vi.fn();
  const state = setupSfc("components/report/ReportTypeForm.vue", props, {
    "@dcloudio/uni-app": { onHide: vi.fn() },
    "@/api/runtime": { miniappApi: api, toAssetUrl: (url: string) => url },
    "@/components/media/SignaturePad.vue": {}, "@/components/common/RecoverableImage.vue": {},
    "@/components/report/IssueTypeFields.vue": {}, "@/components/report/QuizCard.vue": {}, "@/components/region/RegionPicker.vue": {},
    "@/composables/report/useLocation": { useLocation: () => ({ choosing: false, choose: vi.fn() }) },
    "@/domain/issues/definitions": definitions, "@/domain/issues/form": forms, "@/domain/issues/mapper": mapper,
    "@/domain/issues/validation": validation, "@/utils/events": events, "@/utils/issue-display": display,
  }, emit) as unknown as { form: forms.ReportFormState; step: Ref<number>; codeError: Ref<string>; hasPendingPhotos: Ref<boolean>; setPhotosPending(change: {type: forms.QuizFormItem['type']; value: boolean}): void; updateQuizPhotos(change: {type: forms.QuizFormItem['type']; value: forms.UploadedPhoto[]}): void; setCodeMode(mode: "auto" | "manual"): void; submit(): Promise<void>; updateSignatureStrokes(strokes: forms.ReportFormState["signatureStrokes"]): void; signatureRef: Ref<unknown> };
  return { state, props, emit };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("uni", { showToast: vi.fn(), showLoading: vi.fn(), hideLoading: vi.fn(), pageScrollTo: vi.fn() });
  api.issues.create.mockResolvedValue({ issue_key: "created", code: "03" });
});
describe("当前类型提交与签名", () => {
  it("离开题目后照片回调仍对应原题，卸载通知不报错或误清下一题状态", () => {
    const { state } = setup();
    state.step.value = 2;
    state.setPhotosPending({ type: "powered", value: true });
    state.step.value = 3;
    state.setPhotosPending({ type: "device_ok", value: true });
    state.setPhotosPending({ type: "powered", value: false });
    expect(state.hasPendingPhotos.value).toBe(true);
    state.updateQuizPhotos({ type: "powered", value: [{ fileId: "late-photo", url: "/late.png" }] });
    expect(state.form.quizzes[0]!.photos[0]!.fileId).toBe("late-photo");
    expect(state.form.quizzes[1]!.photos[0]!.fileId).toBe("photo");
    state.step.value = 6;
    expect(() => state.setPhotosPending({ type: "device_ok", value: false })).not.toThrow();
    expect(state.hasPendingPhotos.value).toBe(false);
  });
  it("自动模式不预占、不传草稿中的手动号，成功回显后端真实编号", async () => {
    const form = validTransformer(); form.codeMode = "auto";
    const { state, emit } = setup(form);
    expect(api.issues.create).not.toHaveBeenCalled();
    await state.submit();
    const input = api.issues.create.mock.calls[0]![0];
    expect(input).toMatchObject({ code_mode: "auto", request_id: expect.stringMatching(/^[A-Za-z0-9_-]{16,64}$/) });
    expect(input.code).toBeUndefined();
    expect(input.codeMode).toBeUndefined();
    expect(input.submissionAttempt).toBeUndefined();
    expect(emit).toHaveBeenCalledWith("submitted", "03");
  });
  it("手动清空不自动改号，切换模式也不会清空已输入内容", async () => {
    const { state } = setup();
    state.setCodeMode("auto"); state.setCodeMode("manual");
    expect(state.form.code).toBe("保持原设施编号");
    state.form.code = "";
    await state.submit();
    expect(api.issues.create).not.toHaveBeenCalled();
    expect(state.form.codeMode).toBe("manual");
    expect(uni.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: "请填写设施编号" }));
  });
  it("网络重试和草稿重启复用请求 ID，不再次上传已保存签名", async () => {
    api.issues.create.mockRejectedValueOnce(new Error("响应丢失"));
    const first = setup(); await first.state.submit();
    const request = api.issues.create.mock.calls[0]![0].request_id;
    const restored = setup(JSON.parse(JSON.stringify(first.state.form)) as forms.ReportFormState);
    await restored.state.submit();
    expect(api.issues.create.mock.calls[1]![0].request_id).toBe(request);
    expect(api.attachments.uploadImages).not.toHaveBeenCalled();
  });
  it("重复提示返回基本信息并保留当前字段、照片和签名", async () => {
    api.issues.create.mockRejectedValueOnce(new ApiError("设施编号重复", { status: 409, code: FACILITY_CODE_CONFLICT }));
    const { state, emit } = setup(); await state.submit();
    expect(state.step.value).toBe(1);
    expect(state.codeError.value).toBe("设施编号重复");
    expect(state.form.signatureFileId).toBe("signed");
    expect(state.form.quizzes[0]!.photos).toHaveLength(1);
    expect(emit.mock.calls.some(([event]) => event === "submitted")).toBe(false);
  });
  it("另一类型不完整不影响当前类型，只发送当前类型一次", async () => {
    const other = setup(forms.createReportForm("road"), false);
    const current = setup();
    await other.state.submit();
    expect(api.issues.create).not.toHaveBeenCalled();
    await current.state.submit();
    expect(api.issues.create).toHaveBeenCalledTimes(1);
    expect(api.issues.create.mock.calls[0]![0]).toMatchObject({ type: "transformer", code: "保持原设施编号", project_year: 2022 });
    expect(current.emit).toHaveBeenCalledWith("submitted", "03");
    expect(other.emit).not.toHaveBeenCalledWith("submitted", "03");
  });
  it("年份未选时不上传签名也不提交", async () => {
    const form = validTransformer(); form.projectYear = null; form.signatureFileId = "";
    await setup(form).state.submit();
    expect(api.attachments.uploadImages).not.toHaveBeenCalled();
    expect(api.issues.create).not.toHaveBeenCalled();
    expect(uni.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: "请选择项目年度" }));
  });
  it("提交自动导出上传签名，照片水印不叠加到签名图上", async () => {
    const form = validTransformer(); form.signatureFileId = "";
    const { state } = setup(form);
    state.signatureRef.value = { exportPng: async () => ({ filePath: "paper.png", revision: 2 }), getRevision: () => 2 };
    api.attachments.uploadImages.mockResolvedValue({ list: [{ file_id: "new-sign", url: "/paper.png" }] });
    await state.submit();
    expect(api.attachments.uploadImages).toHaveBeenCalledWith({ files: [{ filePath: "paper.png", fileType: "image" }], watermark: false });
    expect(api.issues.create.mock.calls[0]![0]).toMatchObject({ reporter_signature_file_id: "new-sign" });
  });
  it("修改当前表单使旧签名确认失效，但切换隐藏不会删除笔迹", async () => {
    const { state, props } = setup();
    state.updateSignatureStrokes([[{ x: .1, y: .2 }]]);
    props.visible = false; await nextTick();
    expect(state.form.signatureStrokes).toHaveLength(1);
    expect(state.form.signatureFileId).toBe("signed");
    state.form.address = "修改地址";
    expect(state.form.signatureFileId).toBe("");
    expect(state.form.signatureStrokes).toHaveLength(1);
  });
  it("网络失败保留当前表单和草稿，不发送提交成功事件", async () => {
    api.issues.create.mockRejectedValueOnce(new Error("网络失败"));
    const { state, emit } = setup(); await state.submit();
    expect(state.form.code).toBe("保持原设施编号");
    expect(emit).toHaveBeenCalledWith("save", expect.objectContaining({ form: expect.objectContaining({ code: "保持原设施编号" }) }));
    expect(emit).not.toHaveBeenCalledWith("submitted", "03");
  });
});
