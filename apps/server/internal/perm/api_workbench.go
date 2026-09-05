package perm

// web.workbench
var apisWorkbench = []Entry{
	{Method: "GET", Path: "/api/workbench/stats", Name: "工作台统计", Module: "web.workbench", Action: "view", Sort: 1},
	{Method: "GET", Path: "/api/workbench/trend", Name: "工作台整改趋势", Module: "web.workbench", Action: "view", Sort: 2},
	{Method: "GET", Path: "/api/workbench/todos", Name: "工作台待办列表", Module: "web.workbench", Action: "view", Sort: 3},
}
