package perm

// web.auth 管理端登录；JWT 仍公开（无 token），账密通过后在 Login handler 内校验本条目。
var apisAuth = []Entry{
	{Method: "POST", Path: "/api/auth/login", Name: "管理后台登录", Module: "web.auth", Action: "login", Sort: 1},
}
