import { defineComponent } from "vue";
import { flushPromises, shallowMount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import type { Issue } from "@gbnt/api-client";
import { adminApiKey } from "@/api/runtime";
import BusinessUserSelect from "@/components/BusinessUserSelect.vue";
import ReassignDialog from "@/views/issues/ReassignDialog.vue";
import IssueFormDialog from "@/views/issues/IssueFormDialog.vue";
import { editorIssue } from "./fixtures/issue-editor";

vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: { id: 7, name: "当前人", username: "self" } }) }));

const issue = (id: number) => ({ id, org_id: id, assignee_user: 11, type: "well", type_ext: { checklist: [] } }) as unknown as Issue;
const showSlots = { template: "<div><slot /><slot name='footer' /></div>" };

describe("专项整改弹窗提交保护", () => {
  it("新增专项整改默认填充当前登录用户组织", async () => {
    const wrapper = shallowMount(IssueFormDialog, {
      props: { modelValue: true, orgs: [], orgsReady: true, defaultOrgId: 12 },
      global: { provide: { [adminApiKey as symbol]: { issues: {} } }, renderStubDefaultSlot: true, stubs: { ElDialog: showSlots, ElForm: defineComponent({ setup(_, { expose }) { expose({ clearValidate: vi.fn() }); }, template: "<div><slot/></div>" }) } },
    });
    await flushPromises();
    expect((wrapper.vm as unknown as { form: { org_id?: number } }).form.org_id).toBe(12);
    wrapper.unmount();
  });

  it("指派候选未成功/失败/切换问题时禁止提交，仅当前有效候选能提交", async () => {
    const api = { issues: { reassign: vi.fn().mockResolvedValue(issue(2)), listAssigneeOptions: vi.fn() } };
    const wrapper = shallowMount(ReassignDialog, {
      props: { modelValue: true, issue: issue(1) },
      global: { provide: { [adminApiKey as symbol]: api }, renderStubDefaultSlot: true, stubs: { ElDialog: showSlots, ElForm: defineComponent({ setup(_, { expose }) { expose({ clearValidate: vi.fn() }); }, template: "<div><slot/></div>" }) } },
    });
    const submit = () => wrapper.findAllComponents({ name: "ElButton" }).at(-1)!;
    expect(submit().props("disabled")).toBe(true);
    const candidates = wrapper.findComponent(BusinessUserSelect);
    candidates.vm.$emit("ready", true);
    await flushPromises();
    expect(submit().props("disabled")).toBe(false);
    candidates.vm.$emit("ready", false);
    await flushPromises();
    submit().vm.$emit("click");
    await flushPromises();
    expect(api.issues.reassign).not.toHaveBeenCalled();
    candidates.vm.$emit("ready", true);
    await wrapper.setProps({ issue: issue(2) });
    expect(submit().props("disabled")).toBe(true);
    wrapper.findComponent(BusinessUserSelect).vm.$emit("ready", true);
    await flushPromises();
    submit().vm.$emit("click");
    await flushPromises();
    expect(api.issues.reassign).toHaveBeenCalledExactlyOnceWith(2, { assignee_user: 11 });
    expect(wrapper.emitted("saved")).toEqual([[2]]);
    wrapper.unmount();
  });

  it("指派写请求迟到时，不关闭或触发新问题弹窗的保存事件", async () => {
    let resolve!: (value: Issue) => void;
    const pending = new Promise<Issue>((done) => { resolve = done; });
    const api = { issues: { reassign: vi.fn().mockReturnValue(pending), listAssigneeOptions: vi.fn() } };
    const wrapper = shallowMount(ReassignDialog, {
      props: { modelValue: true, issue: issue(1) },
      global: { provide: { [adminApiKey as symbol]: api }, renderStubDefaultSlot: true, stubs: { ElDialog: showSlots, ElForm: defineComponent({ setup(_, { expose }) { expose({ clearValidate: vi.fn() }); }, template: "<div><slot/></div>" }) } },
    });
    wrapper.findComponent(BusinessUserSelect).vm.$emit("ready", true);
    await flushPromises();
    wrapper.findAllComponents({ name: "ElButton" }).at(-1)!.vm.$emit("click");
    await wrapper.setProps({ issue: issue(2) });
    resolve(issue(1));
    await flushPromises();
    expect(wrapper.emitted("saved")).toBeUndefined();
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    wrapper.unmount();
  });

  it("手工上报信息随组织选择保留，组织候选失败时禁止提交", async () => {
    const wrapper = shallowMount(IssueFormDialog, {
      props: { modelValue: true, orgs: [], orgsReady: true },
      global: { provide: { [adminApiKey as symbol]: { issues: {} } }, renderStubDefaultSlot: true, stubs: { ElDialog: showSlots, ElForm: defineComponent({ setup(_, { expose }) { expose({ clearValidate: vi.fn() }); }, template: "<div><slot/></div>" }) } },
    });
    const state = wrapper.vm as unknown as { form: { org_id?: number; reporter_name: string; reporter_phone: string } };
    state.form.org_id = 1; state.form.reporter_name = "实际巡查员"; state.form.reporter_phone = "13800000001";
    state.form.org_id = 2;
    await flushPromises();
    expect(state.form.reporter_name).toBe("实际巡查员");
    expect(state.form.reporter_phone).toBe("13800000001");
    await wrapper.setProps({ orgsReady: false });
    expect(wrapper.findAllComponents({ name: "ElButton" }).at(-1)!.props("disabled")).toBe(true);
    wrapper.unmount();
  });

  it("编辑组织后重新校验责任人候选，加载中及失败时禁止保存", async () => {
    const record = editorIssue("road"); record.status = "pending";
    let rejectOptions!: (error: Error) => void;
    const pending = new Promise<never>((_, reject) => { rejectOptions = reject; });
    const optionResult = (id: number) => ({ list: [{ id, name: "整改员", username: `user-${id}` }], selected: null, total: 1, page: 1, size: 20 });
    const api = { issues: {
      get: vi.fn().mockResolvedValue(record), update: vi.fn().mockResolvedValue(record),
      listAssigneeOptions: vi.fn((_id: number, query: { org_id: number }) => query.org_id === 12 ? Promise.resolve(optionResult(15)) : pending),
    } };
    const wrapper = shallowMount(IssueFormDialog, {
      props: { modelValue: true, issue: record, orgs: [], orgsReady: true },
      global: { provide: { [adminApiKey as symbol]: api }, renderStubDefaultSlot: true, stubs: {
        BusinessUserSelect: false, ElDialog: showSlots,
        ElForm: defineComponent({ setup(_, { expose }) { expose({ clearValidate: vi.fn(), validate: vi.fn().mockResolvedValue(true) }); }, template: "<div><slot/></div>" }),
      } },
    });
    await flushPromises();
    const form = (wrapper.vm as unknown as { form: { org_id: number; assignee_user: number } }).form;
    const submit = () => wrapper.findAllComponents({ name: "ElButton" }).at(-1)!.vm.$emit("click");
    expect(api.issues.listAssigneeOptions).toHaveBeenLastCalledWith(record.id, expect.objectContaining({ org_id: 12, selected_id: 15 }));
    form.org_id = 13; await flushPromises();
    submit(); await flushPromises();
    expect(api.issues.update).not.toHaveBeenCalled();
    expect(api.issues.listAssigneeOptions).toHaveBeenLastCalledWith(record.id, expect.objectContaining({ org_id: 13 }));
    rejectOptions(new Error("加载失败")); await flushPromises();
    submit(); await flushPromises();
    expect(api.issues.update).not.toHaveBeenCalled();
    api.issues.listAssigneeOptions.mockResolvedValue(optionResult(22));
    form.assignee_user = 22; await flushPromises();
    submit(); await flushPromises();
    expect(api.issues.update).toHaveBeenCalledExactlyOnceWith(record.id, expect.objectContaining({ org_id: 13, assignee_user: 22 }));
    wrapper.unmount();
  });
});
