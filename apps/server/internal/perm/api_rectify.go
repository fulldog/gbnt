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
}
