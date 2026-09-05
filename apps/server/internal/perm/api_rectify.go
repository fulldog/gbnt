package perm

// web.rectify
var apisRectify = []Entry{
	{Method: "GET", Path: "/api/issues", Name: "问题列表", Module: "web.rectify", Action: "view", Sort: 2},
	{Method: "POST", Path: "/api/issues", Name: "新增问题", Module: "web.rectify", Action: "create", Sort: 3},
	{Method: "POST", Path: "/api/issues/import", Name: "批量导入", Module: "web.rectify", Action: "import", Sort: 4},
	{Method: "GET", Path: "/api/issues/:id", Name: "问题详情", Module: "web.rectify", Action: "view", Sort: 5},
	{Method: "PUT", Path: "/api/issues/:id", Name: "更新问题", Module: "web.rectify", Action: "edit", Sort: 6},
	{Method: "DELETE", Path: "/api/issues/:id", Name: "删除问题", Module: "web.rectify", Action: "delete", Sort: 7},
	{Method: "POST", Path: "/api/issues/:id/rectify", Name: "提交整改", Module: "web.rectify", Action: "edit", Sort: 8},
	{Method: "POST", Path: "/api/issues/:id/re-rectify", Name: "重新整改", Module: "web.rectify", Action: "edit", Sort: 9},
	{Method: "POST", Path: "/api/issues/:id/reassign", Name: "重新指派整改人", Module: "web.rectify", Action: "edit", Sort: 10},
	// 业务候选复用既有模块/action 授权，不需要额外开放系统管理，也不重置现有角色授权。
	{Method: "GET", Path: "/api/issues/options/orgs", Name: "专项整改组织候选", Module: "web.rectify", Action: "view", Sort: 10},
	{Method: "GET", Path: "/api/issues/options/reporters", Name: "上报人候选", Module: "web.rectify", Action: "create", Sort: 10},
	{Method: "GET", Path: "/api/issues/:id/assignee-options", Name: "责任人候选", Module: "web.rectify", Action: "edit", Sort: 10},
}
