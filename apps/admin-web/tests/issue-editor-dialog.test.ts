import { defineComponent, watch } from "vue";
import { enableAutoUnmount, flushPromises, shallowMount } from "@vue/test-utils";
import { ISSUE_TYPES } from "@gbnt/api-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adminApiKey } from "@/api/runtime";
import IssueFormDialog from "@/views/issues/IssueFormDialog.vue";
import IssueTypeFields from "@/views/issues/IssueTypeFields.vue";
import type { IssueFormDraft } from "@/views/issues/issue-form";
import { editorIssue } from "./fixtures/issue-editor";

vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: { id: 7, name: "操作账号" } }) }));
enableAutoUnmount(afterEach);
function mountEditor(type: typeof ISSUE_TYPES[number], get = vi.fn().mockResolvedValue(editorIssue(type))) {
  const update = vi.fn().mockResolvedValue(editorIssue(type));
  const upload = vi.fn(); const toBlob = vi.fn();
  const wrapper = shallowMount(IssueFormDialog, {
    props: { modelValue: true, issue: editorIssue(type), orgs: [], orgsReady: true },
    global: {
      provide: { [adminApiKey as symbol]: { issues: { get, update }, attachments: { uploadImages: upload } } },
      renderStubDefaultSlot: true,
      stubs: {
        IssueTypeFields: false, IssueChecklistFields: false,
        ElDialog: { template: "<div><slot/><slot name='footer'/></div>" },
        ElForm: defineComponent({ setup(_, { expose }) { expose({ validate: () => Promise.resolve(true), clearValidate: vi.fn() }); }, template: "<div><slot/></div>" }),
        BusinessUserSelect: defineComponent({
          props: ["active"], emits: ["ready"],
          setup(props, { emit }) { watch(() => props.active, (active) => emit("ready", Boolean(active)), { immediate: true }); }, template: "<div/>",
        }),
        SignaturePad: defineComponent({ props: ["existing"], setup(_, { expose }) { expose({ changed: false, toBlob }); }, template: "<div class='signature-preview'/>" }),
      },
    },
  });
  const state = wrapper.vm as unknown as { form: IssueFormDraft };
  const submit = () => wrapper.findAllComponents({ name: "ElButton" }).at(-1)!;
  return { wrapper, state, get, update, upload, toBlob, submit };
}

describe("编辑入口的完整五类表单", () => {
  it.each(ISSUE_TYPES)("%s 编辑读取详情、显示两侧内容，修改后保存对应类型字段", async (type) => {
    const { wrapper, state, get, update, upload, submit } = mountEditor(type);
    expect(submit().props("disabled")).toBe(true);
    await flushPromises();
    expect(get).toHaveBeenCalledExactlyOnceWith(9);
    expect(wrapper.findAll(".issue-form-pane")).toHaveLength(2);
    expect(wrapper.text()).toContain("类型属性"); expect(wrapper.text()).toContain("排查清单"); expect(wrapper.text()).toContain("电子签名");
    expect(wrapper.findComponent(IssueTypeFields).props("modelValue").type).toBe(type);
    expect(state.form.reporter_name).toBe("张三");
    state.form.types[type].checklist[0]!.desc = "编辑后的说明";
    submit().vm.$emit("click"); await flushPromises();
    expect(update).toHaveBeenCalledExactlyOnceWith(9, expect.objectContaining({ type, type_ext: expect.objectContaining({ checklist: expect.arrayContaining([expect.objectContaining({ desc: "编辑后的说明" })]) }) }));
    expect(upload).not.toHaveBeenCalled(); expect(wrapper.emitted("saved")).toEqual([[9]]);
  });

  it("切换类型再返回恢复各自输入与附件，未保存时不写入接口", async () => {
    const { wrapper, state, update } = mountEditor("road"); await flushPromises();
    state.form.types.road.length = 2.3; state.form.types.road.checklist[0]!.files.push("new-road-file");
    state.form.type = "bridge"; await flushPromises();
    expect(state.form.types.bridge.length).toBeUndefined();
    state.form.types.bridge.length = 18;
    expect(wrapper.text()).toContain("是否有淤堵与损坏");
    expect(wrapper.text()).not.toContain("是否有道路损坏");
    state.form.type = "road"; await flushPromises();
    expect(state.form.types.road.length).toBe(2.3);
    expect(state.form.types.road.checklist[0]!.files).toContain("new-road-file");
    expect(update).not.toHaveBeenCalled();
    await wrapper.setProps({ modelValue: false }); await wrapper.setProps({ modelValue: true }); await flushPromises();
    expect(state.form.types.road.length).toBe(1.25);
    expect(state.form.types.road.checklist[0]!.files).not.toContain("new-road-file");
  });

  it("旧详情迟到不覆盖当前记录，加载失败时禁止保存并可重试", async () => {
    let resolve!: (value: ReturnType<typeof editorIssue>) => void;
    const first = new Promise<ReturnType<typeof editorIssue>>((done) => { resolve = done; });
    const get = vi.fn().mockReturnValueOnce(first).mockRejectedValueOnce(new Error("读取失败")).mockResolvedValue(editorIssue("forest", 10));
    const { wrapper, state, submit } = mountEditor("well", get);
    await wrapper.setProps({ issue: editorIssue("forest", 10) }); await flushPromises();
    expect(submit().props("disabled")).toBe(true);
    resolve(editorIssue("well")); await flushPromises();
    wrapper.findComponent({ name: "AsyncError" }).vm.$emit("retry"); await flushPromises();
    expect(state.form.type).toBe("forest"); expect(submit().props("disabled")).toBe(false);
  });

  it("原值保存不上传签名、不重写类型属性和状态", async () => {
    const { submit, update, upload, toBlob } = mountEditor("well"); await flushPromises();
    submit().vm.$emit("click"); await flushPromises();
    expect(update).toHaveBeenCalledExactlyOnceWith(9, { expected_updated_at: "2026-09-07T08:00:00Z" });
    expect(upload).not.toHaveBeenCalled(); expect(toBlob).not.toHaveBeenCalled();
  });
});
