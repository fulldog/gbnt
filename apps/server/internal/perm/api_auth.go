package perm

// web.auth 管理端登录：JWT 公开（无 token），账密通过后在 Login handler 内按 is_rbac 校验。
var apisAuth = []Entry{
	{Method: "POST", Path: "/api/auth/login", Name: "管理后台登录", Module: "web.auth", Action: "login", Sort: 1, IsJWT: false, IsRBAC: true},
}
