package perm

// SuperAdminRoleID 系统角色表中「超管角色」固定 ID，该角色记录不可删改。
// 用户级超管以 sys_users.is_super_admin 为准（全库仅一名），与角色 ID 无关。
const SuperAdminRoleID uint64 = 1

// PublicPaths JWT / RBAC 均跳过的公开路径（不入 sys_apis）。
var PublicPaths = []string{
	"/api/health",
	"/api/auth/captcha",
	"/api/auth/login",
	"/api/app/auth/slider/start",
	"/api/app/auth/slider/finish",
	"/api/app/auth/login",
}
