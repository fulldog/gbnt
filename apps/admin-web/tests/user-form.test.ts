import type { SysOrg, SysUser } from "@gbnt/api-client";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { ElForm, ElFormItem, ElInputNumber, ElSelect } from "element-plus";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import OrgTreeSelect from "@/components/OrgTreeSelect.vue";
import UserFormDialog from "@/views/system/UserFormDialog.vue";
import { sysRole } from "./fixtures/roles";

const users = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));
vi.mock("@/api/runtime", () => ({ useAdminApi: () => ({ users }) }));
vi.mock("element-plus", async (importOriginal) => ({
  ...await importOriginal<typeof import("element-plus")>(),
  ElMessage: { success: vi.fn(), error: vi.fn() },
}));

const DialogStub = defineComponent({
  props: { modelValue: Boolean },
  setup(props, { slots }) {
    return () => props.modelValue ? h("div", [slots.default?.(), slots.footer?.()]) : null;
  },
});
const orgs: SysOrg[] = [{
  id: 3, name: "北城街道", type: "street", parent_id: 2, sort: 1, created_at: "", updated_at: "", created_id: 0, updated_id: 0, is_delete: 0,
  within_org_scope: true,
}];
const user: SysUser = {
  id: 2, username: "worker", name: "张三", phone: "", org_id: 3, role_id: 2,
  sort: 25, status: 1, is_super_admin: false, created_at: "", updated_at: "", created_id: 0, updated_id: 0, is_delete: 0,
};
const wrappers: VueWrapper[] = [];

async function form(editing: SysUser | null = null, defaultOrgId?: number) {
  const wrapper = mount(UserFormDialog, {
    props: {
      modelValue: false, user: editing, orgs, roles: [sysRole(2)],
			defaultOrgId,
      sortSupported: true, optionsReady: true, optionsLoading: false, optionsError: "",
      "onUpdate:modelValue": (value) => wrapper.setProps({ modelValue: value }),
    },
    global: { stubs: { ElDialog: DialogStub, OrgTreeSelect: true } },
  });
  wrappers.push(wrapper);
  await wrapper.setProps({ modelValue: true });
  await flushPromises();
  expect(wrapper.getComponent(ElForm).vm.fields).toHaveLength(5);
  return wrapper;
}

function field(wrapper: VueWrapper, prop: string) {
  return wrapper.findAllComponents(ElFormItem).find((item) => item.props("prop") === prop)!;
}

async function save(wrapper: VueWrapper) {
  await wrapper.findAll("button").find((button) => button.text() === "保存")!.trigger("click");
  await flushPromises();
}

beforeEach(() => {
  vi.resetAllMocks();
  users.create.mockResolvedValue(user);
  users.update.mockResolvedValue(user);
});
afterEach(() => { for (const wrapper of wrappers.splice(0)) wrapper.unmount(); });

describe("工作人员弹窗字段与默认状态", () => {
  it.each([null, user])("新增和编辑的所属单位位于第二项，均不展示状态：%j", async (editing) => {
    const wrapper = await form(editing);
    expect(wrapper.findAllComponents(ElFormItem).map((item) => item.props("label"))).toEqual([
      "登录账号", "所属单位", editing ? "新密码" : "初始密码", "姓名", "手机号", "角色", "排序",
    ]);
    expect(wrapper.getComponent(OrgTreeSelect).props("placeholder")).toBe("请选择所属单位");
    expect(wrapper.find('[role="radiogroup"]').exists()).toBe(false);
    expect(wrapper.getComponent(ElInputNumber).props("modelValue")).toBe(editing?.sort ?? 100);
  });

  it("新增人员默认启用且正常提交所属单位", async () => {
    const wrapper = await form();
    await field(wrapper, "username").get("input").setValue("new_worker");
    await field(wrapper, "name").get("input").setValue(" 新人员 ");
    wrapper.getComponent(OrgTreeSelect).vm.$emit("update:modelValue", 3);
    wrapper.getComponent(ElSelect).vm.$emit("update:modelValue", 2);
    await save(wrapper);
    expect(users.create).toHaveBeenCalledExactlyOnceWith({
      username: "new_worker", password: undefined, name: "新人员", phone: "", org_id: 3, role_id: 2, sort: 100, status: 1,
    });
    expect(users.update).not.toHaveBeenCalled();
    expect(wrapper.props("modelValue")).toBe(false);
    expect(wrapper.emitted("saved")).toEqual([[]]);
  });

  it("新增人员默认填充当前登录用户组织", async () => {
    const wrapper = await form(null, 3);
    expect(wrapper.getComponent(OrgTreeSelect).props("modelValue")).toBe(3);
  });

  it.each([0, 1])("编辑状态为 %s 的人员不提交状态，防止资料保存覆盖启停状态", async (status) => {
    const wrapper = await form({ ...user, status });
    expect(field(wrapper, "username").get("input").attributes("disabled")).toBeDefined();
    expect(wrapper.getComponent(OrgTreeSelect).props("modelValue")).toBe(3);
    await field(wrapper, "name").get("input").setValue(" 新姓名 ");
    await save(wrapper);
    expect(users.update).toHaveBeenCalledExactlyOnceWith(user.id, {
      name: "新姓名", phone: "", org_id: 3, role_id: 2, sort: 25, password: undefined,
    });
    expect(users.create).not.toHaveBeenCalled();
    expect(wrapper.props("modelValue")).toBe(false);
  });

  it("未选择单位时使用所属单位的校验提示，且不能提交", async () => {
    const wrapper = await form();
    await field(wrapper, "username").get("input").setValue("new_worker");
    await field(wrapper, "name").get("input").setValue("新人员");
    wrapper.getComponent(ElSelect).vm.$emit("update:modelValue", 2);
    await save(wrapper);
    await vi.waitFor(() => expect(field(wrapper, "org_id").text()).toContain("请选择所属单位"));
    expect(users.create).not.toHaveBeenCalled();
    expect(wrapper.props("modelValue")).toBe(true);
  });

  it.each([0, -10, 150])("编辑排序 %s 时提交实际整数，不用默认值覆盖0", async (sort) => {
    const wrapper = await form(user);
    await field(wrapper, "sort").get("input").setValue(String(sort));
    await field(wrapper, "sort").get("input").trigger("change");
    await save(wrapper);
    expect(users.update).toHaveBeenCalledExactlyOnceWith(user.id, expect.objectContaining({ sort }));
  });

  it("清空排序后禁止保存并展示校验错误", async () => {
    const wrapper = await form(user);
    wrapper.getComponent(ElInputNumber).vm.$emit("update:modelValue", undefined);
    await save(wrapper);
    await vi.waitFor(() => expect(field(wrapper, "sort").text()).toContain("请输入有效的排序整数"));
    expect(users.update).not.toHaveBeenCalled();
  });

  it("旧后端禁用排序并提示升级，但普通资料仍可保存", async () => {
    const wrapper = await form({ ...user, sort: undefined });
    await wrapper.setProps({ sortSupported: false });
    expect(wrapper.text()).toContain("当前服务暂不支持人员排序");
    expect(wrapper.getComponent(ElInputNumber).props("disabled")).toBe(true);
    await save(wrapper);
    expect(users.update).toHaveBeenCalledExactlyOnceWith(user.id, {
      name: user.name, phone: "", org_id: 3, role_id: 2, password: undefined,
    });
  });
});
