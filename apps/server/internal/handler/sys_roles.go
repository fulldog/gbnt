package handler

import (
	"github.com/gin-gonic/gin"

	"gbnt/apps/server/internal/database"
	"gbnt/apps/server/internal/perm"
	"gbnt/apps/server/internal/service"
	"gbnt/apps/server/pkg/response"
)

func (d *Deps) registerSysRoles(api *gin.RouterGroup) {
	sys := api.Group("/sys")
	{
		sys.GET("/roles", d.ListRoles)
		sys.POST("/roles", d.CreateRole)
		sys.GET("/roles/:id/apis", d.GetRoleAPIs)
		sys.PUT("/roles/:id/apis", d.SetRoleAPIs)
		sys.PUT("/roles/:id", d.UpdateRole)
		sys.DELETE("/roles/:id", d.DeleteRole)
		sys.GET("/apis", d.ListAPIs)
	}
}

// ListRoles GET /api/sys/roles — 角色列表，code为英文角色ID，id为内部关联主键。
func (d *Deps) ListRoles(c *gin.Context) {
	list, err := d.Sys.ListRoles()
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, list)
}

// CreateRole POST /api/sys/roles — 新增英文code角色ID，传api_ids时自动命名并原子保存权限。
func (d *Deps) CreateRole(c *gin.Context) {
	d.OpLog.Mark(c, "新增角色", "")
	var req service.CreateRoleInput
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	if req.APIIDs != nil && !d.allowRoleGrant(c) {
		return
	}
	r, err := d.Sys.CreateRole(c.Request.Context(), req)
	if err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, r)
}

// UpdateRole PUT /api/sys/roles/:id — 数字id定位，部分更新英文code及原子保存权限；超管不可编辑。
func (d *Deps) UpdateRole(c *gin.Context) {
	d.OpLog.Mark(c, "更新角色", c.Param("id"))
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req service.UpdateRoleInput
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	r, err := d.Sys.UpdateRole(c.Request.Context(), id, req)
	if err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, r)
}

// DeleteRole DELETE /api/sys/roles/:id — 删除角色（超管不可删；仍有用户绑定时拒绝）。
func (d *Deps) DeleteRole(c *gin.Context) {
	d.OpLog.Mark(c, "删除角色", c.Param("id"))
	id, ok := parseID(c)
	if !ok {
		return
	}
	if err := d.Sys.DeleteRole(c.Request.Context(), id); err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, nil)
}

// GetRoleAPIs GET /api/sys/roles/:id/apis — 角色已授权 API id；超管返回 api_ids="*"。
func (d *Deps) GetRoleAPIs(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	ids, err := d.Sys.GetRoleAPIs(id)
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	if id == perm.SuperAdminRoleID {
		response.OK(c, gin.H{"api_ids": "*"})
		return
	}
	if ids == nil {
		ids = []uint64{}
	}
	response.OK(c, gin.H{"api_ids": ids})
}

// SetRoleAPIs PUT /api/sys/roles/:id/apis — 覆盖授权 {api_ids:[...]}（超管不可编辑）。
func (d *Deps) SetRoleAPIs(c *gin.Context) {
	d.OpLog.Mark(c, "设置角色API权限", c.Param("id"))
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req service.RoleAPIsInput
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	if err := d.Sys.SetRoleAPIs(c.Request.Context(), id, req.APIIDs); err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, nil)
}

// ListAPIs GET /api/sys/apis — 启用API目录及顶级职责元数据，保持数组响应。
func (d *Deps) ListAPIs(c *gin.Context) {
	list, err := d.Sys.ListRoleCatalog()
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, list)
}

// allowRoleGrant 组合创建仍须拥有原设置角色权限能力，避免仅新增权限绕过授权限制。
func (d *Deps) allowRoleGrant(c *gin.Context) bool {
	if d.Cfg != nil && !d.Cfg.RBAC.Enabled {
		return true
	}
	user, err := database.UserFromContext(c.Request.Context())
	if err != nil {
		response.Fail(c, 401, response.CodeUnauth, "未登录或凭证无效")
		return false
	}
	if user.IsSuperAdmin {
		return true
	}
	svc := d.Perm
	if svc == nil {
		svc = d.Sys.Perm
	}
	if svc != nil {
		if target, ok := svc.FindAPI("PUT", "/api/sys/roles/:id/apis"); ok {
			if !target.IsRBAC {
				return true
			}
			allowed, err := svc.Allow(user.RoleID, false, target)
			if err != nil {
				response.Fail(c, 500, response.CodeServer, "角色授权校验失败")
				return false
			}
			if allowed {
				return true
			}
		}
	}
	response.Fail(c, 403, response.CodeForbid, "新增并授权角色需要角色修改权限")
	return false
}
