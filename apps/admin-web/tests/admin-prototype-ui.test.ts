import type { SysApi } from "@gbnt/api-client";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { ElCheckbox } from "element-plus";
import { afterEach, describe, expect, it } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";
import PermissionMatrix from "@/components/PermissionMatrix.vue";
import RouteTabs from "@/layouts/RouteTabs.vue";

const wrappers: VueWrapper[] = [];
afterEach(() => { for (const wrapper of wrappers.splice(0)) wrapper.unmount(); });

function permission(id: number, module: string, action: string): SysApi {
  return { id, module, action, sort: id, name: `权限 ${id}`, method: "GET", path: `/test/${id}`, enabled: true, created_at: "", updated_at: "", created_id: 0, updated_id: 0, is_delete: 0 };
}
const apis = [
  permission(1, "web.rectify", "view"), permission(2, "web.rectify", "view"),
  permission(3, "web.rectify", "edit"), permission(4, "web.sys-staff", "view"),
];

function matrix(selected: number[], disabled = false) {
  const wrapper = mount(PermissionMatrix, {
    props: { apis, modelValue: selected, disabled, "onUpdate:modelValue": (value) => wrapper.setProps({ modelValue: value }) },
  });
  wrappers.push(wrapper);
  return wrapper;
}

describe("模块权限分组", () => {
  it("已有部分授权显示半选，打开不会补全或删除目录外权限", () => {
    const wrapper = matrix([1, 99]);
    const checkboxes = wrapper.findAllComponents(ElCheckbox);
    expect(checkboxes.find((item) => item.text() === "专项整改")?.props("indeterminate")).toBe(true);
    expect(checkboxes.find((item) => item.attributes("aria-label") === "专项整改：查")?.props("indeterminate")).toBe(true);
    expect(wrapper.props("modelValue")).toEqual([1, 99]);
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });

  it("勾选只影响所选模块或操作，保留其他模块和目录外授权", async () => {
    const wrapper = matrix([1, 4, 99]);
    const operation = wrapper.findAllComponents(ElCheckbox).find((item) => item.attributes("aria-label") === "专项整改：查")!;
    await operation.get("input").setValue(true);
    expect(wrapper.props("modelValue")).toEqual([1, 4, 99, 2]);
    expect(wrapper.props("modelValue")).not.toContain(3);
    const module = wrapper.findAllComponents(ElCheckbox).find((item) => item.text() === "专项整改")!;
    await module.get("input").setValue(true);
    expect(wrapper.props("modelValue")).toEqual([1, 4, 99, 2, 3]);
    await module.get("input").setValue(false);
    expect(wrapper.props("modelValue")).toEqual([4, 99]);
  });

  it("只读权限不可修改，接口刷新也不重写既有授权", async () => {
    const wrapper = matrix([1, 99], true);
    expect(wrapper.findAll("input").every((input) => input.attributes("disabled") !== undefined)).toBe(true);
    wrapper.findAllComponents(ElCheckbox)[0]!.vm.$emit("change", true);
    await wrapper.setProps({ apis: [...apis, permission(5, "web.rectify", "delete")] });
    expect(wrapper.props("modelValue")).toEqual([1, 99]);
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });
});

const pages = [
  { title: "工作台", path: "/workbench" }, { title: "专项整改", path: "/issues" },
  { title: "工作人员", path: "/system/users" },
];
async function tabs(initialItems = pages) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: pages.map((item) => ({ path: item.path, component: { template: "<div />" } })),
  });
  await router.push(initialItems[0]!.path);
  const wrapper = mount(RouteTabs, { props: { items: initialItems }, global: { plugins: [router] } });
  wrappers.push(wrapper);
  return { wrapper, router };
}

describe("后台页面页签", () => {
  it("关闭当前页签回到前一页，关闭后台页签不切换当前页面", async () => {
    const { wrapper, router } = await tabs();
    await router.push("/issues");
    await router.push("/system/users");
    await wrapper.get('[aria-label="关闭工作人员页签"]').trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/issues");
    expect(wrapper.find('a[href="/system/users"]').exists()).toBe(false);
    await router.push("/system/users");
    await wrapper.get('[aria-label="关闭专项整改页签"]').trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/system/users");
    expect(wrapper.find('a[href="/issues"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="关闭工作台页签"]').exists()).toBe(false);
  });

  it("只显示可访问页面，权限变更后清理失效页签且保留最后一个页签", async () => {
    const { wrapper, router } = await tabs(pages.slice(1));
    expect(wrapper.find('a[href="/workbench"]').exists()).toBe(false);
    expect(wrapper.findAll("button")).toHaveLength(0);
    await router.push("/system/users");
    await wrapper.setProps({ items: [pages[2]!] });
    expect(wrapper.findAll("a").map((link) => link.text())).toEqual(["工作人员"]);
    expect(wrapper.findAll("button")).toHaveLength(0);
  });
});
