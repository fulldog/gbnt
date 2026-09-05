import { defineComponent } from "vue";
import { enableAutoUnmount, flushPromises, shallowMount } from "@vue/test-utils";
import { ElMessage } from "element-plus";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminApiKey } from "@/api/runtime";
import BusinessUserSelect from "@/components/BusinessUserSelect.vue";
import PhotoUpload from "@/components/PhotoUpload.vue";
import IssueFormDialog from "@/views/issues/IssueFormDialog.vue";
import type { IssueFormDraft } from "@/views/issues/issue-form";

vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: { id: 7, name: "当前人" } }) }));
enableAutoUnmount(afterEach);
beforeEach(() => {
  vi.spyOn(ElMessage, "error").mockImplementation(() => ({ close: () => undefined }));
  vi.spyOn(ElMessage, "success").mockImplementation(() => ({ close: () => undefined }));
});
afterEach(() => vi.restoreAllMocks());

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function mountForm(toBlob = vi.fn().mockResolvedValue(new Blob(["signature"], { type: "image/png" })), validate = vi.fn().mockResolvedValue(true)) {
  const uploadImages = vi.fn().mockResolvedValue({ list: [{ file_id: "signature-id", url: "/signature.png" }] });
  const create = vi.fn().mockResolvedValue({ id: 9 });
  const wrapper = shallowMount(IssueFormDialog, {
    props: { modelValue: true, orgs: [], orgsReady: true },
    global: {
      provide: { [adminApiKey as symbol]: { attachments: { uploadImages }, issues: { create, listReporterOptions: vi.fn() } } },
      renderStubDefaultSlot: true,
      stubs: {
        ElDialog: { template: "<div><slot /><slot name='footer' /></div>" },
        ElForm: defineComponent({ setup(_, { expose }) { expose({ validate, clearValidate: vi.fn() }); }, template: "<div><slot /></div>" }),
        SignaturePad: defineComponent({ setup(_, { expose }) { expose({ toBlob }); }, template: "<div />" }),
      },
    },
  });
  const state = wrapper.vm as unknown as { form: IssueFormDraft };
  const submit = () => wrapper.findAllComponents({ name: "ElButton" }).at(-1)!;
  async function ready() {
    state.form.org_id = 1;
    state.form.report_user_id = 7;
    state.form.address = "真实现场位置";
    for (const question of state.form.checklist) {
      question.value = !question.negative;
      if (question.mustImg) question.files = [`photo-${question.type}`];
    }
    wrapper.findComponent(BusinessUserSelect).vm.$emit("ready", true);
    await flushPromises();
  }
  return { wrapper, state, submit, ready, create, uploadImages, toBlob, validate };
}

describe("排查表单照片与签名", () => {
  it("全部题目提供上传入口，mustImg 仅决定必填；照片获得现场位置", async () => {
    const { wrapper, state } = mountForm();
    state.form.address = "村东机井";
    state.form.lat = 36.45;
    state.form.lng = 115.98;
    await flushPromises();
    const uploads = wrapper.findAllComponents(PhotoUpload);
    expect(uploads).toHaveLength(state.form.checklist.length);
    expect(state.form.checklist.some((question) => !question.mustImg)).toBe(true);
    expect(wrapper.text()).toContain("现场照片（选填）");
    expect(wrapper.text()).toContain("现场照片（必填）");
    expect(wrapper.text()).toContain("系统不会自动补零");
    for (const upload of uploads) expect(upload.props()).toMatchObject({ address: "村东机井", lat: 36.45, lng: 115.98, disabled: false });
  });

  it("签名关闭水印，新增请求保留选填照片且不制造坐标", async () => {
    const { wrapper, state, ready, submit, uploadImages, create } = mountForm();
    await ready();
    const optional = state.form.checklist.find((question) => !question.mustImg)!;
    optional.files = ["optional-photo"];
    submit().vm.$emit("click");
    await flushPromises();
    expect(uploadImages).toHaveBeenCalledExactlyOnceWith({ files: [expect.any(File)], watermark: false });
    expect(create).toHaveBeenCalledOnce();
    const input = create.mock.calls[0]![0];
    expect(input).toMatchObject({ reporter_signature_file_id: "signature-id", lat: undefined, lng: undefined });
    expect(input.type_ext.checklist).toContainEqual(expect.objectContaining({ type: optional.type, files: ["optional-photo"] }));
    expect(wrapper.emitted("saved")).toEqual([[9]]);
  });

  it("跨题聚合上传状态，任一仍在上传时禁止实际提交", async () => {
    const { wrapper, submit, ready, uploadImages, create } = mountForm();
    await ready();
    const [first, second] = wrapper.findAllComponents(PhotoUpload);
    first!.vm.$emit("uploading", true);
    second!.vm.$emit("uploading", true);
    await flushPromises();
    expect(submit().props("disabled")).toBe(true);
    submit().vm.$emit("click");
    await flushPromises();
    expect(uploadImages).not.toHaveBeenCalled();
    first!.vm.$emit("uploading", false);
    await flushPromises();
    expect(submit().props("disabled")).toBe(true);
    expect(create).not.toHaveBeenCalled();
    second!.vm.$emit("uploading", false);
    await flushPromises();
    expect(submit().props("disabled")).toBe(false);
    submit().vm.$emit("click");
    await flushPromises();
    expect(create).toHaveBeenCalledOnce();
  });

  it("表单异步校验期间开始上传，也不能绕过提交保护", async () => {
    const pending = deferred<boolean>();
    const { wrapper, submit, ready, create, uploadImages } = mountForm(undefined, vi.fn().mockReturnValue(pending.promise));
    await ready();
    submit().vm.$emit("click");
    wrapper.findComponent(PhotoUpload).vm.$emit("uploading", true);
    pending.resolve(true);
    await flushPromises();
    expect(uploadImages).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it.each(["reopen", "type"] as const)("%s 后重建照片组件并忽略旧题上传状态，不覆盖新题状态", async (mode) => {
    const { wrapper, state, submit, ready } = mountForm();
    await ready();
    const oldUpload = wrapper.findComponent(PhotoUpload);
    const oldListener = oldUpload.vm.$attrs.onUploading as (busy: boolean) => void;
    const oldFilesListener = oldUpload.vm.$attrs["onUpdate:modelValue"] as (ids: string[]) => void;
    oldUpload.vm.$emit("uploading", true);
    if (mode === "reopen") {
      await wrapper.setProps({ modelValue: false });
      await wrapper.setProps({ modelValue: true });
    } else {
      state.form.type = "road";
      await flushPromises();
    }
    await ready();
    expect(wrapper.findComponent(PhotoUpload).vm).not.toBe(oldUpload.vm);
    expect(submit().props("disabled")).toBe(false);
    wrapper.findComponent(PhotoUpload).vm.$emit("uploading", true);
    oldListener(false);
    oldFilesListener(["late-old-photo"]);
    await flushPromises();
    expect(submit().props("disabled")).toBe(true);
    expect(state.form.checklist.some((item) => item.files.includes("late-old-photo"))).toBe(false);
    wrapper.findComponent(PhotoUpload).vm.$emit("uploading", false);
    oldListener(true);
    await flushPromises();
    expect(submit().props("disabled")).toBe(false);
  });

  it("关闭重开后迟到的签名 Blob 不上传、不触发新弹窗提交", async () => {
    const pending = deferred<Blob>();
    const { wrapper, ready, submit, toBlob, uploadImages, create } = mountForm(vi.fn().mockReturnValue(pending.promise));
    await ready();
    submit().vm.$emit("click");
    await flushPromises();
    expect(toBlob).toHaveBeenCalledOnce();
    await wrapper.setProps({ modelValue: false });
    await wrapper.setProps({ modelValue: true });
    pending.resolve(new Blob(["old signature"], { type: "image/png" }));
    await flushPromises();
    expect(uploadImages).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(wrapper.emitted("saved")).toBeUndefined();
    expect(ElMessage.error).not.toHaveBeenCalled();
  });
});
