import { defineComponent, watch } from "vue";
import { enableAutoUnmount, flushPromises, shallowMount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, FACILITY_CODE_CONFLICT } from "@gbnt/api-client";
import { adminApiKey } from "@/api/runtime";
import IssueFormDialog from "@/views/issues/IssueFormDialog.vue";
import { hydrateIssueDraft, type IssueFormDraft } from "@/views/issues/issue-form";
import { editorIssue } from "./fixtures/issue-editor";

vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: { id: 7, name: "操作账号" } }) }));
enableAutoUnmount(afterEach);

async function mountForm(editing = false) {
  const create = vi.fn().mockResolvedValue({ ...editorIssue("road"), code: "03" });
  const update = vi.fn().mockResolvedValue(editorIssue("road"));
  const get = vi.fn().mockResolvedValue(editorIssue("road"));
  const upload = vi.fn().mockResolvedValue({ list: [{ file_id: "new-signature", url: "/sign.png" }] });
  const scrollToField = vi.fn();
  const toBlob = vi.fn().mockResolvedValue(new Blob(["signature"], { type: "image/png" }));
  const wrapper = shallowMount(IssueFormDialog, {
    props: { modelValue: true, issue: editing ? editorIssue("road") : null, orgs: [] },
    global: { provide: { [adminApiKey as symbol]: { issues: { create, get, update }, attachments: { uploadImages: upload } } }, renderStubDefaultSlot: true,
      stubs: { ElDialog: { template: "<div><slot/><slot name='footer'/></div>" },
        ElForm: defineComponent({ setup(_, { expose }) { expose({ validate: () => Promise.resolve(true), clearValidate: vi.fn(), scrollToField }); }, template: "<div><slot/></div>" }),
        BusinessUserSelect: defineComponent({
          props: ["active"], emits: ["ready"],
          setup(props, { emit }) { watch(() => props.active, (active) => emit("ready", Boolean(active)), { immediate: true }); }, template: "<div/>",
        }),
        SignaturePad: defineComponent({ setup(_, { expose }) { expose({ changed: false, revision: 0, toBlob }); }, template: "<div/>" }),
      },
    },
  });
  await flushPromises();
  const state = wrapper.vm as unknown as { form: IssueFormDraft; codeError: string; setCodeMode(value: string): void };
  if (!editing) {
    state.form.type = "road";
    await flushPromises();
    Object.assign(state.form, hydrateIssueDraft(editorIssue("road")), { code: "", codeMode: "auto" });
  }
  const submit = async () => { wrapper.findAllComponents({ name: "ElButton" }).at(-1)!.vm.$emit("click"); await flushPromises(); };
  return { wrapper, state, create, get, update, upload, submit, scrollToField };
}

describe("设施编号提交时生成", () => {
  it("新增自动模式不请求建议值，提交空 code 并接收最终编号", async () => {
    const { wrapper, create, get, submit } = await mountForm();
    expect(wrapper.text()).toContain("提交时自动生成");
    expect(create).not.toHaveBeenCalled(); expect(get).not.toHaveBeenCalled();
    await submit();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ code_mode: "auto", code: undefined, request_id: expect.any(String) }));
    expect(wrapper.emitted("saved")).toEqual([[9]]);
  });
  it("新建切换类型保留各类型模式与手动清空", async () => {
    const { state, create } = await mountForm();
    state.form.codeMode = "manual"; state.form.code = "02";
    state.form.type = "well"; await flushPromises();
    expect(state.form.codeMode).toBe("auto");
    state.form.codeMode = "manual"; state.form.code = "";
    state.form.type = "road"; await flushPromises();
    expect(state.form.code).toBe("02");
    state.form.type = "well"; await flushPromises();
    expect(state.form.codeMode).toBe("manual"); expect(state.form.code).toBe("");
    expect(create).not.toHaveBeenCalled();
  });
  it("失败重试复用签名与提交 ID；重复错误保持弹窗与字段", async () => {
    const { wrapper, state, create, upload, submit, scrollToField } = await mountForm();
    create.mockRejectedValueOnce(new Error("响应丢失"));
    await submit();
    const first = create.mock.calls[0]![0];
    create.mockRejectedValueOnce(new ApiError("编号重复", { status: 409, code: FACILITY_CODE_CONFLICT }));
    await submit();
    expect(create.mock.calls[1]![0]).toEqual(first);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(state.codeError).toBe("编号重复");
    expect(scrollToField).toHaveBeenCalledWith("code");
    expect(wrapper.emitted("saved")).toBeUndefined();
    expect(state.form.types.road.checklist[0]!.files.length).toBeGreaterThan(0);
  });
  it("编辑不自动改号，组织或类型变化也保留当前编号给后端校验", async () => {
    const { wrapper, state, get, create, update, submit } = await mountForm(true);
    const code = state.form.code;
    state.form.org_id = 102;
    state.form.type = "well"; state.form.type = "road";
    expect(state.form.code).toBe(code);
    expect(wrapper.find(".code-mode-options").exists()).toBe(false);
    await submit();
    expect(update).toHaveBeenCalledWith(9, expect.objectContaining({ org_id: 102 }));
    expect(create).not.toHaveBeenCalled(); expect(get).toHaveBeenCalledTimes(1);
  });
});
