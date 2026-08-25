package handler

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"gbnt/backend/internal/perm"
	"gbnt/backend/internal/service"
	"gbnt/backend/pkg/response"
)

// ListOrgs GET /api/sys/orgs — 组织扁平列表（含 parent_id/sort）。
func (d *Deps) ListOrgs(c *gin.Context) {
	list, err := d.Sys.ListOrgs()
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, list)
}

// CreateOrg POST /api/sys/orgs — 新增组织。
func (d *Deps) CreateOrg(c *gin.Context) {
	var req service.OrgInput
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	o := req.ToModel(0)
	if err := d.Sys.CreateOrg(c.Request.Context(), o); err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, o)
}

// UpdateOrg PUT /api/sys/orgs/:id — 更新组织名称/上级/排序。
func (d *Deps) UpdateOrg(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req service.OrgInput
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	o := req.ToModel(id)
	if err := d.Sys.UpdateOrg(c.Request.Context(), o); err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, o)
}

// DeleteOrg DELETE /api/sys/orgs/:id — 删除组织（parent_id=0 的根节点不可删）。
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

// ListUsers GET /api/sys/users — 工作人员列表；query: org_id/keyword/page/size。
func (d *Deps) ListUsers(c *gin.Context) {
	var orgID uint64
	if v := c.Query("org_id"); v != "" {
		orgID, _ = strconv.ParseUint(v, 10, 64)
	}
	list, total, err := d.Sys.ListUsers(orgID, c.Query("keyword"), atoiDefault(c.Query("page"), 1), atoiDefault(c.Query("size"), 20))
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, gin.H{"list": list, "total": total})
}

// CreateUser POST /api/sys/users — 新增工作人员（username/password 必填）。
func (d *Deps) CreateUser(c *gin.Context) {
	var req service.UserInput
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	u, err := d.Sys.CreateUser(c.Request.Context(), req)
	if err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, u)
}

// UpdateUser PUT /api/sys/users/:id — 更新工作人员（password 空则不改）。
func (d *Deps) UpdateUser(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req service.UserInput
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	u, err := d.Sys.UpdateUser(c.Request.Context(), id, req)
	if err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, u)
}

// DeleteUser DELETE /api/sys/users/:id — 删除工作人员（软删）。
func (d *Deps) DeleteUser(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	if err := d.Sys.DeleteUser(c.Request.Context(), id); err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, nil)
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

// ListDictTypes GET /api/sys/dict/types — 字典类型（排查类型 well/road/...）。
func (d *Deps) ListDictTypes(c *gin.Context) {
	list, err := d.Sys.ListDictTypes()
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, list)
}

// ListDictFields GET /api/sys/dict/fields — 字典字段；query: type_code。
func (d *Deps) ListDictFields(c *gin.Context) {
	list, err := d.Sys.ListDictFields(c.Query("type_code"))
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, list)
}

// ListDictItems GET /api/sys/dict/items — 字典选项；query: field_id。
func (d *Deps) ListDictItems(c *gin.Context) {
	fid, _ := strconv.ParseUint(c.Query("field_id"), 10, 64)
	list, err := d.Sys.ListDictItems(fid)
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, list)
}

// CreateDictItem POST /api/sys/dict/items — 新增字典选项。
func (d *Deps) CreateDictItem(c *gin.Context) {
	var req service.DictItemInput
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	item := req.ToModel(0)
	if err := d.Sys.CreateDictItem(c.Request.Context(), item); err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, item)
}

// UpdateDictItem PUT /api/sys/dict/items/:id — 更新字典选项。
func (d *Deps) UpdateDictItem(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req service.DictItemInput
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	item := req.ToModel(id)
	if err := d.Sys.UpdateDictItem(c.Request.Context(), item); err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, item)
}

// DeleteDictItem DELETE /api/sys/dict/items/:id — 删除字典选项（软删）。
func (d *Deps) DeleteDictItem(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	if err := d.Sys.DeleteDictItem(c.Request.Context(), id); err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, nil)
}

// ListOpLogs GET /api/sys/op-logs — 操作日志；query: keyword/page/size。
func (d *Deps) ListOpLogs(c *gin.Context) {
	list, total, err := d.OpLog.List(c.Query("keyword"), atoiDefault(c.Query("page"), 1), atoiDefault(c.Query("size"), 20))
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, gin.H{"list": list, "total": total})
}
