package perm

// web.sys-org
var apisSysOrg = []Entry{
	{Method: "GET", Path: "/api/sys/orgs", Name: "组织列表", Module: "web.sys-org", Action: "view", Sort: 13},
	{Method: "POST", Path: "/api/sys/orgs", Name: "新增组织", Module: "web.sys-org", Action: "create", Sort: 14},
	{Method: "PUT", Path: "/api/sys/orgs/:id", Name: "更新组织", Module: "web.sys-org", Action: "edit", Sort: 15},
	{Method: "DELETE", Path: "/api/sys/orgs/:id", Name: "删除组织", Module: "web.sys-org", Action: "delete", Sort: 16},
}
