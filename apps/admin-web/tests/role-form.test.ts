import type { ApiClient, ApiRequestOptions, SysApi } from "@gbnt/api-client";
import { readFileSync } from "node:fs";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { ElCheckbox, ElForm, ElInput, ElOption } from "element-plus";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { createRolesApi } from "@/api/roles";
import PermissionMatrix from "@/components/PermissionMatrix.vue";
import RoleFormDialog from "@/views/system/RoleFormDialog.vue";
import UserFormDialog from "@/views/system/UserFormDialog.vue";
import { previewRoleName, rolePermissionGroups } from "@/utils/role-permissions";
import { roleApi, roleCatalog, sysRole } from "./fixtures/roles";

const roles = vi.hoisted(() => ({ listApis: vi.fn(), getPermissions: vi.fn(), create: vi.fn(), update: vi.fn() }));
vi.mock("@/api/runtime", () => ({ useAdminApi: () => ({ roles }) }));
vi.mock("element-plus", async (importOriginal) => ({ ...await importOriginal<typeof import("element-plus")>(), ElMessage: { success: vi.fn() } }));
const DialogStub = defineComponent({ props: { modelValue: Boolean }, setup(props, { slots }) {
  return () => props.modelValue ? h("div", [slots.default?.(), slots.footer?.()]) : null;
} });
const wrappers: VueWrapper[] = [];
function form(role: ReturnType<typeof sysRole> | null = null) {
  const wrapper = mount(RoleFormDialog, {
    props: { modelValue: true, role, "onUpdate:modelValue": (value) => wrapper.setProps({ modelValue: value }) },
    global: { stubs: { ElDialog: DialogStub } },
  });
  wrappers.push(wrapper);
  return wrapper;
}
function button(wrapper: VueWrapper, label = "保存") { return wrapper.findAll("button").find((item) => item.text() === label)!; }
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => {
  vi.resetAllMocks();
  roles.listApis.mockResolvedValue(roleCatalog);
  roles.getPermissions.mockResolvedValue({ api_ids: [3, 999] });
  roles.create.mockResolvedValue(sysRole(8, "系统配置员"));
  roles.update.mockResolvedValue(sysRole());
});
afterEach(() => { for (const wrapper of wrappers.splice(0)) wrapper.unmount(); });

describe("角色职责与树形分组", () => {
  it.each([
    [[3, 5], "系统配置员"], [[1, 2, 3], "系统配置员"],
    [[3, 6, 7], "专项整改员、汇总管理员、系统配置员"],
    [[1, 2], "工作台查看员"], [[1], "未分配职责"], [[], "未分配职责"],
  ] as const)("%j 预览与后端命名场景一致", (ids, name) => {
    expect(previewRoleName(roleCatalog, ids)).toEqual({ name, error: "" });
  });
  it("按顶级分组，仅主动勾选父级时批量更改其子权限", async () => {
    const wrapper = form(sysRole());
    await flushPromises();
    const matrix = wrapper.getComponent(PermissionMatrix);
    const system = matrix.findAllComponents(ElCheckbox).find((item) => item.text() === "系统配置")!;
    expect(system.props("indeterminate")).toBe(true);
    expect(rolePermissionGroups(roleCatalog).map((group) => group.label)).toEqual(["基础权限", "工作台", "专项整改", "汇总管理", "系统配置"]);
    await system.get("input").setValue(true);
    expect(matrix.props("modelValue")).toEqual([3, 999, 4, 5, 8]);
    await system.get("input").setValue(false);
    expect(matrix.props("modelValue")).toEqual([999]);
  });
  it("未知业务职责报错，停用或非RBAC权限不参加命名", () => {
    expect(previewRoleName([roleApi(100, "web.unknown")], [100]).error).toContain("尚未配置职责");
    expect(previewRoleName([{ ...roleApi(1, "web.sys-org"), enabled: false }, { ...roleApi(2, "web.rectify"), is_rbac: false }], [1, 2]).name).toBe("未分配职责");
  });
});

describe("统一角色弹窗", () => {
  it("紧凑样式作用于真实弹窗容器，标题与保存按钮位于滚动正文外", async () => {
    const wrapper = mount(RoleFormDialog, { props: { modelValue: true }, attachTo: document.body });
    wrappers.push(wrapper);
    await flushPromises();
    const dialog = wrapper.get(".el-dialog.role-form-dialog");
    const style = document.createElement("style");
    style.textContent = readFileSync("src/styles/role-form-dialog.css", "utf8");
    document.head.append(style);
    try {
      expect(getComputedStyle(dialog.element).display).toBe("flex");
      expect(getComputedStyle(dialog.element).maxHeight).toBe("80dvh");
      expect(getComputedStyle(dialog.get(".el-dialog__header").element).padding).toBe("14px 16px");
      expect(getComputedStyle(dialog.get(".el-dialog__body").element).overflow).toBe("auto");
      expect(getComputedStyle(dialog.get(".el-dialog__footer").element).padding).toBe("12px 16px");
    } finally {
      style.remove();
    }
    expect((dialog.element as HTMLElement).style.getPropertyValue("--el-dialog-width")).toBe("min(640px, 94vw)");
    expect(dialog.get(".el-dialog__header").text()).toContain("新增角色");
    expect(dialog.find(".el-dialog__body .role-auth").exists()).toBe(true);
    expect(dialog.get(".el-dialog__footer").text()).toContain("保存");
    expect(dialog.find(".el-dialog__body .el-dialog__footer").exists()).toBe(false);
  });

  it.each([null, sysRole()])("新增和修改共用紧凑弹窗与左侧标签布局：%j", async (role) => {
    const wrapper = form(role);
    await flushPromises();
    const dialog = wrapper.getComponent(DialogStub);
    expect(dialog.attributes("width")).toBe("min(640px, 94vw)");
    expect(dialog.attributes("top")).toBe("10vh");
    expect(dialog.classes()).toContain("role-form-dialog");
    expect(wrapper.getComponent(ElForm).props()).toMatchObject({ labelPosition: "right", labelWidth: "98px" });
    expect(wrapper.get("textarea").attributes("rows")).toBe("1");
    expect(wrapper.findAllComponents(ElInput).find((input) => input.props("type") === "textarea")?.props("autosize")).toEqual({ minRows: 1, maxRows: 3 });
    expect(wrapper.findAll(".role-auth .permission-matrix")).toHaveLength(1);
    expect(button(wrapper, "取消").exists()).toBe(true);
    expect(button(wrapper).attributes("disabled")).toBeUndefined();
  });

  it("新增默认基础权限，按职责预览并仅发送一次组合请求", async () => {
    const wrapper = form();
    expect(button(wrapper).attributes("disabled")).toBeDefined();
    await flushPromises();
    const matrix = wrapper.getComponent(PermissionMatrix);
    expect(matrix.props("modelValue")).toEqual([1, 2]);
    expect(wrapper.get(".role-name-preview").text()).toBe("工作台查看员");
    expect(button(wrapper).attributes("disabled")).toBeUndefined();
    matrix.vm.$emit("update:modelValue", [1, 2, 3, 5]);
    await wrapper.get("textarea").setValue("  维护组织与人员  ");
    expect(wrapper.get(".role-name-preview").text()).toBe("系统配置员");
    const pending = deferred<ReturnType<typeof sysRole>>();
    roles.create.mockReturnValueOnce(pending.promise);
    await button(wrapper).trigger("click");
    await button(wrapper).trigger("click");
    expect(roles.create).toHaveBeenCalledTimes(1);
    expect(roles.create).toHaveBeenCalledWith({ desc: "维护组织与人员", api_ids: [1, 2, 3, 5] });
    pending.resolve(sysRole(9, "系统配置员"));
    await flushPromises();
    expect(wrapper.emitted("saved")).toEqual([[sysRole(9, "系统配置员"), true]]);
    expect(wrapper.props("modelValue")).toBe(false);
  });
  it("修改保持历史名称、半选与目录外权限；失败后可原样重试", async () => {
    const wrapper = form(sysRole());
    await flushPromises();
    await wrapper.get("textarea").setValue("新备注");
    roles.update.mockRejectedValueOnce(new Error("授权保存失败"));
    await button(wrapper).trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("授权保存失败");
    expect(wrapper.props("modelValue")).toBe(true);
    expect(wrapper.get(".role-name-preview").text()).toBe("历史角色");
    expect(wrapper.getComponent(PermissionMatrix).props("modelValue")).toEqual([3, 999]);
    expect(wrapper.get("textarea").element.value).toBe("新备注");
    await button(wrapper).trigger("click");
    await flushPromises();
    expect(roles.update).toHaveBeenNthCalledWith(2, 7, { desc: "新备注", api_ids: [3, 999] });
  });
  it("显式取消全部权限可保存，且不隐式恢复默认权限", async () => {
    const wrapper = form();
    await flushPromises();
    wrapper.getComponent(PermissionMatrix).vm.$emit("update:modelValue", []);
    await flushPromises();
    expect(wrapper.get(".role-name-preview").text()).toBe("未分配职责");
    expect(wrapper.text()).toContain("不能登录管理后台");
    await button(wrapper).trigger("click");
    expect(roles.create).toHaveBeenCalledWith({ desc: "", api_ids: [] });
  });
  it("加载失败禁用保存并可重试，切换角色不接收旧请求结果", async () => {
    roles.listApis.mockRejectedValueOnce(new Error("目录加载失败"));
    const wrapper = form();
    await flushPromises();
    expect(wrapper.text()).toContain("目录加载失败");
    expect(button(wrapper).attributes("disabled")).toBeDefined();
    await button(wrapper, "重新加载").trigger("click");
    await flushPromises();
    const pending = deferred<{ api_ids: number[] }>();
    roles.getPermissions.mockReturnValueOnce(pending.promise).mockResolvedValueOnce({ api_ids: [6] });
    await wrapper.setProps({ role: sysRole(7) });
    await wrapper.setProps({ role: sysRole(8, "另一角色") });
    await flushPromises();
    pending.resolve({ api_ids: [3] });
    await flushPromises();
    expect(wrapper.getComponent(PermissionMatrix).props("modelValue")).toEqual([6]);
    expect(wrapper.get(".role-name-preview").text()).toBe("另一角色");
  });
  it("旧后端缺少元数据时禁止组合保存，取消不产生角色", async () => {
    roles.listApis.mockResolvedValue(roleCatalog.map((api) => ({ ...api, duty: undefined })));
    const wrapper = form();
    await flushPromises();
    expect(wrapper.text()).toContain("角色配置服务尚未更新");
    expect(button(wrapper).attributes("disabled")).toBeDefined();
    await button(wrapper, "取消").trigger("click");
    expect(roles.create).not.toHaveBeenCalled();
    expect(wrapper.props("modelValue")).toBe(false);
  });
  it("关闭后迟到目录不覆盖下次打开的选择", async () => {
    const pending = deferred<SysApi[]>();
    roles.listApis.mockReturnValueOnce(pending.promise);
    const wrapper = form();
    await wrapper.setProps({ modelValue: false });
    await wrapper.setProps({ modelValue: true, role: sysRole() });
    await flushPromises();
    pending.resolve(roleCatalog);
    await flushPromises();
    expect(wrapper.getComponent(PermissionMatrix).props("modelValue")).toEqual([3, 999]);
  });

  it("旧服务缺少职责或标识能力时禁止保存", async () => {
    roles.listApis.mockResolvedValue(roleCatalog.map((api) => ({ ...api, role_code_supported: undefined })));
    const wrapper = form();
    await flushPromises();
    expect(wrapper.text()).toContain("角色配置服务尚未更新");
    expect(button(wrapper).attributes("disabled")).toBeDefined();
  });
});

describe("角色正式API契约", () => {
  it("人员选择同名角色时仅显示名称，选项仍使用数字role_id", () => {
    const wrapper = mount(UserFormDialog, {
      props: { modelValue: true, orgs: [], roles: [sysRole(7, "系统配置员"), sysRole(8, "系统配置员")], optionsReady: true, optionsLoading: false, optionsError: "" },
      global: { stubs: { ElDialog: DialogStub, OrgTreeSelect: true } },
    });
    wrappers.push(wrapper);
    expect(wrapper.findAllComponents(ElOption).map((option) => [option.props("label"), option.props("value")])).toEqual([["系统配置员", 7], ["系统配置员", 8]]);
  });

  it("组合创建、修改、状态更新及旧独立授权保持准确URL和请求体", async () => {
    const request = vi.fn<(path: string, options?: ApiRequestOptions) => Promise<unknown>>().mockResolvedValue(sysRole());
    const api = createRolesApi({ request: request as ApiClient["request"], raw: vi.fn() });
    await api.create({ desc: "备注", api_ids: [3] });
    await api.update(7, { desc: "新备注", api_ids: [] });
    await api.update(7, { status: 0 });
    await api.updatePermissions(7, { api_ids: [3] });
    expect(request.mock.calls).toEqual([
      ["/api/sys/roles", { method: "POST", body: { desc: "备注", api_ids: [3] } }],
      ["/api/sys/roles/7", { method: "PUT", body: { desc: "新备注", api_ids: [] } }],
      ["/api/sys/roles/7", { method: "PUT", body: { status: 0 } }],
      ["/api/sys/roles/7/apis", { method: "PUT", body: { api_ids: [3] } }],
    ]);
  });
});
