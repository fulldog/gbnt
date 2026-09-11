import type { RoleDuty, SysApi, SysRole } from "@gbnt/api-client";

const duties: Record<string, RoleDuty> = {
  "web.auth": { key: "basic", label: "基础权限", role_name: "", sort: 0 },
  "web.workbench": { key: "workbench", label: "工作台", role_name: "", sort: 1 },
  "web.rectify": { key: "rectify", label: "专项整改", role_name: "专项整改员", sort: 2 },
  "web.ledger-street": { key: "ledger", label: "汇总管理", role_name: "汇总管理员", sort: 3 },
  "web.ledger-survey": { key: "ledger", label: "汇总管理", role_name: "汇总管理员", sort: 3 },
  "web.sys-org": { key: "system", label: "系统配置", role_name: "系统配置员", sort: 4 },
  "web.sys-staff": { key: "system", label: "系统配置", role_name: "系统配置员", sort: 4 },
  "web.sys-roles": { key: "system", label: "系统配置", role_name: "系统配置员", sort: 4 },
  "web.sys-logs": { key: "system", label: "系统配置", role_name: "系统配置员", sort: 4 },
};
export function roleApi(id: number, module: string, action = "view"): SysApi {
  return { id, module, action, duty: duties[module], role_code_supported: true, sort: id, name: `权限${id}`, method: "GET", path: `/test/${id}`,
    enabled: true, is_jwt: true, is_rbac: true, created_at: "", updated_at: "", created_id: 0, updated_id: 0, is_delete: 0 };
}
export const roleCatalog = [roleApi(1, "web.auth", "login"), roleApi(2, "web.workbench"),
  roleApi(3, "web.sys-org"), roleApi(4, "web.sys-org"), roleApi(5, "web.sys-staff"),
  roleApi(6, "web.ledger-street"), roleApi(7, "web.rectify"), roleApi(8, "web.sys-roles", "edit")];
export function sysRole(id = 7, name = "历史角色"): SysRole {
  return { id, code: id === 1 ? "admin" : `test-${id}`, name, desc: "历史备注", status: 1, created_at: "2026-09-11T10:00:00+08:00", updated_at: "2026-09-11T10:00:00+08:00", created_id: 0, updated_id: 0, is_delete: 0 };
}
