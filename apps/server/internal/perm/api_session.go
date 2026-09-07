package perm

// 登录即可：校验 JWT，不做 RBAC。
var apisSession = []Entry{
	{Method: "GET", Path: "/api/auth/me", Name: "当前登录用户", Module: "web.session", Action: "view", Sort: 1, IsJWT: true, IsRBAC: false},
	{Method: "PUT", Path: "/api/auth/password", Name: "本人修改密码", Module: "web.session", Action: "edit", Sort: 2, IsJWT: true, IsRBAC: false},
	{Method: "POST", Path: "/api/auth/logout", Name: "退出登录", Module: "web.session", Action: "edit", Sort: 3, IsJWT: true, IsRBAC: false},
	{Method: "POST", Path: "/api/attachments/images", Name: "批量上传图片", Module: "web.session", Action: "create", Sort: 4, IsJWT: true, IsRBAC: false},
}
