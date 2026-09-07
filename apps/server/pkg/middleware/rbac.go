package middleware

import (
	"github.com/gin-gonic/gin"

	"gbnt/apps/server/internal/database"
	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/perm"
	"gbnt/apps/server/pkg/response"
)

// lookupSysAPI 按 method + Gin FullPath 查目录；未匹配或服务为空则未命中。
func lookupSysAPI(svc *perm.Service, c *gin.Context) (*model.SysAPI, bool) {
	if svc == nil {
		return nil, false
	}
	path := c.FullPath()
	if path == "" {
		return nil, false
	}
	return svc.FindAPI(c.Request.Method, path)
}

// RBAC 按 sys_apis.is_rbac 校验接口权限；enabled=false 时跳过。
// is_jwt=0 或 is_rbac=0 时不校验（公开接口无登录用户；JWT-only 已由 JWT 中间件完成）。
// 未入目录：超管放行，普通用户 403。fullPath 为 Gin 路由模板（如 /api/issues/:id）。
func RBAC(svc *perm.Service, enabled bool) gin.HandlerFunc {
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
		api, ok := svc.FindAPI(c.Request.Method, path)
		if ok && (!api.IsJWT || !api.IsRBAC) {
			c.Next()
			return
		}
		info, err := database.UserFromContext(c.Request.Context())
		if err != nil {
			response.Fail(c, 401, response.CodeUnauth, "未登录或凭证无效")
			c.Abort()
			return
		}
		// 超管在目录命中前放行：新接口尚未 SyncSysAPIs 进 sys_apis 时，FindAPI 失败也会 403。
		if info.IsSuperAdmin {
			c.Next()
			return
		}
		if !ok {
			response.Fail(c, 403, response.CodeForbid, "无权限访问该接口")
			c.Abort()
			return
		}
		allowed, err := svc.Allow(info.RoleID, info.IsSuperAdmin, api)
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
