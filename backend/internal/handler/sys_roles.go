package handler

import (
	"github.com/gin-gonic/gin"

	"gbnt/backend/internal/perm"
	"gbnt/backend/internal/service"
	"gbnt/backend/pkg/response"
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

// ListRoles GET /api/sys/roles — 角色列表（含 status）。
func (d *Deps) ListRoles(c *gin.Context) {
	list, err := d.Sys.ListRoles()
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, list)
}

// CreateRole POST /api/sys/roles — 新增角色。
func (d *Deps) CreateRole(c *gin.Context) {
	var req service.RoleInput
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	r := req.ToModel(0)
	if err := d.Sys.CreateRole(c.Request.Context(), r); err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, r)
}

// UpdateRole PUT /api/sys/roles/:id — 更新角色（id=1 超管不可编辑）。
func (d *Deps) UpdateRole(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req service.RoleInput
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	r := req.ToModel(id)
	if err := d.Sys.UpdateRole(c.Request.Context(), r); err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, r)
}

// DeleteRole DELETE /api/sys/roles/:id — 删除角色（超管不可删；仍有用户绑定时拒绝）。
func (d *Deps) DeleteRole(c *gin.Context) {
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
	response.OK(c, gin.H{"api_ids": ids})
}

// SetRoleAPIs PUT /api/sys/roles/:id/apis — 覆盖授权 {api_ids:[...]}（超管不可编辑）。
func (d *Deps) SetRoleAPIs(c *gin.Context) {
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
	d.Sys.InvalidateRoleCache(id)
	response.OK(c, nil)
}

// ListAPIs GET /api/sys/apis — 全量 API 目录（供授权 UI）。
func (d *Deps) ListAPIs(c *gin.Context) {
	list, err := d.Sys.ListAPIs()
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, list)
}
