package perm

// 小程序已登录接口：仅 JWT，不做 RBAC。公开登录/滑块见 apisPublic。
var apisApp = []Entry{
	{Method: "GET", Path: "/api/app/auth/me", Name: "小程序当前用户", Module: "app.session", Action: "view", Sort: 1, IsJWT: true, IsRBAC: false},
	{Method: "PUT", Path: "/api/app/auth/password", Name: "小程序修改密码", Module: "app.session", Action: "edit", Sort: 2, IsJWT: true, IsRBAC: false},
	{Method: "POST", Path: "/api/app/auth/logout", Name: "小程序退出登录", Module: "app.session", Action: "edit", Sort: 3, IsJWT: true, IsRBAC: false},
	{Method: "GET", Path: "/api/app/todos", Name: "小程序待办列表", Module: "app.todo", Action: "view", Sort: 1, IsJWT: true, IsRBAC: false},
	{Method: "GET", Path: "/api/app/regions", Name: "小程序组织树", Module: "app.region", Action: "view", Sort: 1, IsJWT: true, IsRBAC: false},
	{Method: "GET", Path: "/api/app/regions/:id", Name: "小程序组织整树", Module: "app.region", Action: "view", Sort: 2, IsJWT: true, IsRBAC: false},
	{Method: "POST", Path: "/api/app/issues", Name: "小程序上报问题", Module: "app.issue", Action: "create", Sort: 1, IsJWT: true, IsRBAC: false},
	{Method: "GET", Path: "/api/app/issues/:id", Name: "小程序问题详情", Module: "app.issue", Action: "view", Sort: 2, IsJWT: true, IsRBAC: false},
	{Method: "POST", Path: "/api/app/issues/:id/rectify", Name: "小程序提交整改", Module: "app.issue", Action: "edit", Sort: 3, IsJWT: true, IsRBAC: false},
	{Method: "POST", Path: "/api/app/issues/:id/re-rectify", Name: "小程序重新整改", Module: "app.issue", Action: "edit", Sort: 4, IsJWT: true, IsRBAC: false},
	{Method: "GET", Path: "/api/app/mine/stats", Name: "小程序我的概览", Module: "app.mine", Action: "view", Sort: 1, IsJWT: true, IsRBAC: false},
	{Method: "GET", Path: "/api/app/mine/issues", Name: "小程序我的问题列表", Module: "app.mine", Action: "view", Sort: 2, IsJWT: true, IsRBAC: false},
}
