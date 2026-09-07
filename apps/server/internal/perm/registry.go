package perm

// Entry API 注册项（单一事实来源）。
type Entry struct {
	Method string
	Path   string
	Name   string
	Module string
	Action string
	Sort   int
}

func joinEntries(groups ...[]Entry) []Entry {
	n := 0
	for _, g := range groups {
		n += len(g)
	}
	out := make([]Entry, 0, n)
	for _, g := range groups {
		out = append(out, g...)
	}
	return out
}

// Registry 需 RBAC 的受保护 API（不含 JWT 白名单中的健康检查/验证码/小程序登录，以及 /auth/me 等 skip）。
// POST /api/auth/login 入目录：JWT 仍公开，权限在 Login handler 校验。
var Registry = joinEntries(
	apisAuth,
	apisWorkbench,
	apisRectify,
	apisLedgerStreet,
	apisLedgerSurvey,
	apisSysOrg,
	apisSysStaff,
	apisSysRoles,
	apisSysLogs,
)

// RBACSkipPaths 登录即可、不做 RBAC 的路径。
var RBACSkipPaths = map[string]struct{}{
	"/api/auth/me":            {},
	"/api/auth/password":      {},
	"/api/auth/logout":        {},
	"/api/attachments/images": {},
}

// AppRoutePrefix 小程序 API 前缀；该前缀下仅 JWT，不做 RBAC。
const AppRoutePrefix = "/api/app/"
