/** ID 为 0 表示未设置，正数但名称不可用时保留可排查的关联 ID。 */
function displayReference(id: number, name: string | null | undefined, kind: string): string {
  if (!id) return "—";
  return name?.trim() || `${kind} #${id}（信息不可用）`;
}

export function displayOrg(id: number, name: string | null | undefined): string {
  return displayReference(id, name, "组织");
}

export function displayUser(id: number, name: string | null | undefined): string {
  return displayReference(id, name, "用户");
}

export function displayRole(user: { is_super_admin: boolean; role_id: number; role_name?: string | null }): string {
  if (user.is_super_admin) return "超级管理员";
  return displayReference(user.role_id, user.role_name, "角色");
}
