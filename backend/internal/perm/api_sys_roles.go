package perm

// web.sys-roles
var apisSysRoles = []Entry{
	{Method: "GET", Path: "/api/sys/roles", Name: "角色列表", Module: "web.sys-roles", Action: "view", Sort: 24},
	{Method: "POST", Path: "/api/sys/roles", Name: "新增角色", Module: "web.sys-roles", Action: "create", Sort: 25},
	{Method: "PUT", Path: "/api/sys/roles/:id", Name: "更新角色", Module: "web.sys-roles", Action: "edit", Sort: 26},
	{Method: "DELETE", Path: "/api/sys/roles/:id", Name: "删除角色", Module: "web.sys-roles", Action: "delete", Sort: 27},
	{Method: "GET", Path: "/api/sys/roles/:id/apis", Name: "角色API权限", Module: "web.sys-roles", Action: "view", Sort: 28},
	{Method: "PUT", Path: "/api/sys/roles/:id/apis", Name: "设置角色API权限", Module: "web.sys-roles", Action: "edit", Sort: 29},
	{Method: "GET", Path: "/api/sys/apis", Name: "API目录列表", Module: "web.sys-roles", Action: "view", Sort: 30},
}
