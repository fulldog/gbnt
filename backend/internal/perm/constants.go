package perm

// SuperAdminRoleID 超管角色固定 ID，拥有全部 API 权限且不可删改。
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
