package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"

	"gbnt/backend/internal/database"
	"gbnt/backend/internal/perm"
	"gbnt/backend/pkg/response"
)

// RBAC 校验接口权限；enabled=false 时跳过。
// publicPaths 与 JWT 白名单一致；fullPath 为 Gin 路由模板（如 /api/issues/:id），非实际 URL。
// /api/app/* 整段跳过（小程序仅 JWT）。
func RBAC(svc *perm.Service, enabled bool, publicPaths []string) gin.HandlerFunc {
	pub := map[string]struct{}{}
	for _, p := range publicPaths {
		pub[p] = struct{}{}
	}
	return func(c *gin.Context) {
		if !enabled || svc == nil {
			c.Next()
			return
		}
		path := c.FullPath()
		if path == "" {
			c.Next()
			return
		}
		if _, ok := pub[path]; ok {
			c.Next()
			return
		}
		if strings.HasPrefix(c.Request.URL.Path, "/uploads/") {
			c.Next()
			return
		}
		if strings.HasPrefix(path, perm.AppRoutePrefix) {
			c.Next()
			return
		}
		if _, skip := perm.RBACSkipPaths[path]; skip {
			c.Next()
			return
		}
		info, err := database.UserFromContext(c.Request.Context())
		if err != nil {
			response.Fail(c, 401, response.CodeUnauth, "未登录或凭证无效")
			c.Abort()
			return
		}
		api, ok := svc.FindAPI(c.Request.Method, path)
		if !ok {
			response.Fail(c, 403, response.CodeForbid, "无权限访问该接口")
			c.Abort()
			return
		}
		allowed, err := svc.Allow(info.RoleID, api)
		if err != nil {
			response.Fail(c, 500, response.CodeServer, err.Error())
			c.Abort()
			return
		}
		if !allowed {
			response.Fail(c, 403, response.CodeForbid, "无权限访问该接口")
			c.Abort()
			return
		}
		c.Next()
	}
}
