import type { RoleDuty, SysApi } from "@gbnt/api-client";

const moduleLabels: Record<string, string> = {
  "web.auth": "允许登录管理后台", "web.workbench": "工作台", "web.rectify": "专项整改",
  "web.ledger-street": "街道台账", "web.ledger-survey": "街道排查汇总",
  "web.sys-org": "组织架构", "web.sys-staff": "工作人员", "web.sys-roles": "角色权限", "web.sys-logs": "操作日志",
};
const actionLabels: Record<string, string> = { view: "查", create: "增", edit: "改", delete: "删", import: "导入", export: "导出", login: "登录" };
const actionOrder = ["view", "create", "edit", "delete", "import", "export", "login"];

export function grantableRoleApis(apis: readonly SysApi[]): SysApi[] {
  return apis.filter((api) => api.enabled !== false && (api.is_rbac === true || api.is_rbac === 1));
}

/** 每次新建仅从当前目录选取基础权限，不硬编码数字ID。 */
export function defaultRolePermissions(apis: readonly SysApi[]): number[] {
  return grantableRoleApis(apis).filter((api) =>
    (api.module === "web.auth" && api.action === "login") || (api.module === "web.workbench" && api.action === "view"),
  ).map((api) => api.id);
}

/** 预览采用后端职责元数据，最终名称由创建接口返回。 */
export function previewRoleName(apis: readonly SysApi[], selected: readonly number[]): { name: string; error: string } {
  const ids = new Set(selected);
  const entries = grantableRoleApis(apis).filter((api) => ids.has(api.id));
  const missing = entries.find((api) => !api.duty);
  if (missing) return { name: "", error: `${moduleLabels[missing.module] ?? missing.module}尚未配置职责，请联系管理员` };
  const duties = new Map<string, RoleDuty>();
  for (const api of entries) if (api.duty?.role_name) duties.set(api.duty.key, api.duty);
  const names = [...duties.values()].sort((a, b) => a.sort - b.sort || a.key.localeCompare(b.key)).map((duty) => duty.role_name);
  return {
    name: names.length ? names.join("、") : entries.some((api) => api.module === "web.workbench") ? "工作台查看员" : "未分配职责",
    error: "",
  };
}

export function rolePermissionGroups(apis: readonly SysApi[]) {
  const modules = new Map<string, SysApi[]>();
  for (const api of grantableRoleApis(apis).sort((a, b) => a.sort - b.sort || a.id - b.id)) {
    const items = modules.get(api.module) ?? [];
    items.push(api);
    modules.set(api.module, items);
  }
  const pages = [...modules].map(([module, entries]) => ({
    module,
    label: moduleLabels[module] ?? module,
    duty: entries[0]?.duty,
    ids: entries.map((api) => api.id),
    actions: [...new Set(entries.map((api) => api.action))]
      .sort((a, b) => actionOrder.indexOf(a) - actionOrder.indexOf(b))
      .map((action) => ({ action, label: actionLabels[action] ?? action, ids: entries.filter((api) => api.action === action).map((api) => api.id) })),
  }));
  const groups = new Map<string, { key: string; label: string; sort: number; pages: typeof pages }>();
  for (const page of pages) {
    const key = page.duty?.key ?? page.module;
    const group = groups.get(key) ?? { key, label: page.duty?.label ?? page.label, sort: page.duty?.sort ?? 99, pages: [] };
    group.pages.push(page);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.sort - b.sort).map((group) => ({
    ...group,
    ids: group.pages.flatMap((page) => page.ids),
    nested: group.pages.length !== 1 || group.label !== group.pages[0]?.label,
  }));
}
