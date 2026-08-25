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

// Registry 需 RBAC 的受保护 API（不含白名单与 /auth/me）。
var Registry = []Entry{
	{Method: "GET", Path: "/api/workbench/stats", Name: "工作台统计", Module: "web.workbench", Action: "view", Sort: 1},
	{Method: "GET", Path: "/api/issues", Name: "问题列表", Module: "web.rectify", Action: "view", Sort: 2},
	{Method: "POST", Path: "/api/issues", Name: "新增问题", Module: "web.rectify", Action: "create", Sort: 3},
	{Method: "POST", Path: "/api/issues/import", Name: "批量导入", Module: "web.rectify", Action: "import", Sort: 4},
	{Method: "GET", Path: "/api/issues/:id", Name: "问题详情", Module: "web.rectify", Action: "view", Sort: 5},
	{Method: "PUT", Path: "/api/issues/:id", Name: "更新问题", Module: "web.rectify", Action: "edit", Sort: 6},
	{Method: "DELETE", Path: "/api/issues/:id", Name: "删除问题", Module: "web.rectify", Action: "delete", Sort: 7},
	{Method: "POST", Path: "/api/issues/:id/rectify", Name: "提交整改", Module: "web.rectify", Action: "edit", Sort: 8},
	{Method: "GET", Path: "/api/ledger/street", Name: "街道台账", Module: "web.ledger-street", Action: "view", Sort: 9},
	{Method: "GET", Path: "/api/ledger/survey", Name: "排查汇总", Module: "web.ledger-survey", Action: "view", Sort: 10},
	{Method: "GET", Path: "/api/sys/orgs", Name: "组织列表", Module: "web.sys-org", Action: "view", Sort: 11},
	{Method: "POST", Path: "/api/sys/orgs", Name: "新增组织", Module: "web.sys-org", Action: "create", Sort: 12},
	{Method: "PUT", Path: "/api/sys/orgs/:id", Name: "更新组织", Module: "web.sys-org", Action: "edit", Sort: 13},
	{Method: "DELETE", Path: "/api/sys/orgs/:id", Name: "删除组织", Module: "web.sys-org", Action: "delete", Sort: 14},
	{Method: "GET", Path: "/api/sys/users", Name: "用户列表", Module: "web.sys-staff", Action: "view", Sort: 15},
	{Method: "POST", Path: "/api/sys/users", Name: "新增用户", Module: "web.sys-staff", Action: "create", Sort: 16},
	{Method: "PUT", Path: "/api/sys/users/:id", Name: "更新用户", Module: "web.sys-staff", Action: "edit", Sort: 17},
	{Method: "DELETE", Path: "/api/sys/users/:id", Name: "删除用户", Module: "web.sys-staff", Action: "delete", Sort: 18},
	{Method: "GET", Path: "/api/sys/roles", Name: "角色列表", Module: "web.sys-roles", Action: "view", Sort: 19},
	{Method: "POST", Path: "/api/sys/roles", Name: "新增角色", Module: "web.sys-roles", Action: "create", Sort: 20},
	{Method: "PUT", Path: "/api/sys/roles/:id", Name: "更新角色", Module: "web.sys-roles", Action: "edit", Sort: 21},
	{Method: "DELETE", Path: "/api/sys/roles/:id", Name: "删除角色", Module: "web.sys-roles", Action: "delete", Sort: 22},
	{Method: "GET", Path: "/api/sys/roles/:id/apis", Name: "角色API权限", Module: "web.sys-roles", Action: "view", Sort: 23},
	{Method: "PUT", Path: "/api/sys/roles/:id/apis", Name: "设置角色API权限", Module: "web.sys-roles", Action: "edit", Sort: 24},
	{Method: "GET", Path: "/api/sys/apis", Name: "API目录列表", Module: "web.sys-roles", Action: "view", Sort: 25},
	{Method: "GET", Path: "/api/sys/op-logs", Name: "操作日志", Module: "web.sys-logs", Action: "view", Sort: 26},
}

// RBACSkipPaths 登录即可、不做 RBAC 的路径。
var RBACSkipPaths = map[string]struct{}{
	"/api/auth/me":            {},
	"/api/attachments/images": {},
}

// AppRoutePrefix 小程序 API 前缀；该前缀下仅 JWT，不做 RBAC。
const AppRoutePrefix = "/api/app/"
