package perm

// 公开接口：不校验 JWT，也不走 RBAC 中间件。
var apisPublic = []Entry{
	{Method: "GET", Path: "/api/health", Name: "健康检查", Module: "public", Action: "view", Sort: 1, IsJWT: false, IsRBAC: false},
	{Method: "GET", Path: "/api/auth/captcha", Name: "图形验证码", Module: "public", Action: "view", Sort: 2, IsJWT: false, IsRBAC: false},
	{Method: "POST", Path: "/api/app/auth/slider/start", Name: "小程序滑动验证开始", Module: "app.auth", Action: "login", Sort: 1, IsJWT: false, IsRBAC: false},
	{Method: "POST", Path: "/api/app/auth/slider/finish", Name: "小程序滑动验证完成", Module: "app.auth", Action: "login", Sort: 2, IsJWT: false, IsRBAC: false},
	{Method: "POST", Path: "/api/app/auth/login", Name: "小程序登录", Module: "app.auth", Action: "login", Sort: 3, IsJWT: false, IsRBAC: false},
	{Method: "GET", Path: "/uploads/*filepath", Name: "静态附件读取", Module: "public", Action: "view", Sort: 3, IsJWT: false, IsRBAC: false},
}
