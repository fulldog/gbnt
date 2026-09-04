package perm

// web.sys-staff
var apisSysStaff = []Entry{
	{Method: "GET", Path: "/api/sys/users/by-org", Name: "按行政区划查询用户", Module: "web.sys-staff", Action: "view", Sort: 17},
	{Method: "GET", Path: "/api/sys/users", Name: "用户列表", Module: "web.sys-staff", Action: "view", Sort: 17},
	{Method: "GET", Path: "/api/sys/users/export", Name: "导出用户", Module: "web.sys-staff", Action: "export", Sort: 18},
	{Method: "POST", Path: "/api/sys/users/import", Name: "导入用户", Module: "web.sys-staff", Action: "import", Sort: 19},
	{Method: "POST", Path: "/api/sys/users", Name: "新增用户", Module: "web.sys-staff", Action: "create", Sort: 20},
	{Method: "PUT", Path: "/api/sys/users/:id", Name: "更新用户", Module: "web.sys-staff", Action: "edit", Sort: 21},
	{Method: "POST", Path: "/api/sys/users/:id/reset-password", Name: "重置密码", Module: "web.sys-staff", Action: "edit", Sort: 22},
	{Method: "DELETE", Path: "/api/sys/users/:id", Name: "删除用户", Module: "web.sys-staff", Action: "delete", Sort: 23},
}
