import { flushPromises, shallowMount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import type { Issue } from "@gbnt/api-client";
import { adminApiKey } from "@/api/runtime";
import BusinessUserSelect from "@/components/BusinessUserSelect.vue";
import ReassignDialog from "@/views/issues/ReassignDialog.vue";
import IssueFormDialog from "@/views/issues/IssueFormDialog.vue";

vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: { id: 7, name: "当前人", username: "self" } }) }));

const issue = (id: number) => ({ id, org_id: id, assignee_user: 11, type: "well", type_ext: { checklist: [] } }) as unknown as Issue;
const showSlots = { template: "<div><slot /><slot name='footer' /></div>" };

describe("专项整改弹窗提交保护", () => {
  it("指派候选未成功/失败/切换问题时禁止提交，仅当前有效候选能提交", async () => {
    const api = { issues: { reassign: vi.fn().mockResolvedValue(issue(2)), listAssigneeOptions: vi.fn() } };
    const wrapper = shallowMount(ReassignDialog, {
      props: { modelValue: true, issue: issue(1) },
      global: { provide: { [adminApiKey as symbol]: api }, renderStubDefaultSlot: true, stubs: { ElDialog: showSlots } },
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
      global: { provide: { [adminApiKey as symbol]: api }, renderStubDefaultSlot: true, stubs: { ElDialog: showSlots } },
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

  it("新增切换组织清除旧上报人，禁止在组织候选失败时提交", async () => {
    const api = { issues: { listReporterOptions: vi.fn() } };
    const wrapper = shallowMount(IssueFormDialog, {
      props: { modelValue: true, orgs: [], orgsReady: true },
      global: { provide: { [adminApiKey as symbol]: api }, renderStubDefaultSlot: true, stubs: { ElDialog: showSlots } },
    });
    const state = wrapper.vm as unknown as { form: { org_id?: number; report_user_id?: number } };
    state.form.org_id = 1;
    await flushPromises();
    const candidates = wrapper.findComponent(BusinessUserSelect);
    candidates.vm.$emit("update:modelValue", 12);
    candidates.vm.$emit("ready", true);
    await flushPromises();
    expect(state.form.report_user_id).toBe(12);
    state.form.org_id = 2;
    await flushPromises();
    expect(state.form.report_user_id).toBeUndefined();
    expect(wrapper.findAllComponents({ name: "ElButton" }).at(-1)!.props("disabled")).toBe(true);
    candidates.vm.$emit("ready", true);
    await wrapper.setProps({ orgsReady: false });
    expect(wrapper.findAllComponents({ name: "ElButton" }).at(-1)!.props("disabled")).toBe(true);
    wrapper.unmount();
  });
});
