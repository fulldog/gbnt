package handler

import (
	"github.com/gin-gonic/gin"

	"gbnt/apps/server/internal/service"
	"gbnt/apps/server/pkg/response"
)

func (d *Deps) registerSysOrg(api *gin.RouterGroup) {
	orgs := api.Group("/sys/orgs")
	{
		orgs.GET("", d.ListOrgs)
		orgs.POST("", d.CreateOrg)
		orgs.PUT("/:id", d.UpdateOrg)
		orgs.DELETE("/:id", d.DeleteOrg)
	}
}

// ListOrgs GET /api/sys/orgs — 组织扁平列表（含 type/parent_id/sort）。
func (d *Deps) ListOrgs(c *gin.Context) {
	list, err := d.Sys.ListOrgs()
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, list)
}

// CreateOrg POST /api/sys/orgs — 新增组织（parent_id=0 为根；否则按上级逐级推导类型）。
func (d *Deps) CreateOrg(c *gin.Context) {
	var req service.OrgCreateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	o, err := d.Sys.CreateOrg(c.Request.Context(), req)
	if err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, o)
}

// UpdateOrg PUT /api/sys/orgs/:id — 仅更新组织名称。
func (d *Deps) UpdateOrg(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req service.OrgUpdateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	o, err := d.Sys.UpdateOrg(c.Request.Context(), id, req)
	if err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, o)
}

// DeleteOrg DELETE /api/sys/orgs/:id — 删除组织（根不可删；有下级时拒绝）。
func (d *Deps) DeleteOrg(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	if err := d.Sys.DeleteOrg(c.Request.Context(), id); err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, nil)
}
