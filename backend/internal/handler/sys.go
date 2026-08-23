package handler

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"gbnt/backend/internal/model"
	"gbnt/backend/internal/service"
	"gbnt/backend/pkg/response"
)

// —— 组织 ——

func (d *Deps) ListOrgs(c *gin.Context) {
	list, err := d.Sys.ListOrgs()
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, list)
}

func (d *Deps) CreateOrg(c *gin.Context) {
	var req model.SysOrg
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	if err := d.Sys.CreateOrg(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, req)
}

func (d *Deps) UpdateOrg(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req model.SysOrg
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	req.ID = id
	if err := d.Sys.UpdateOrg(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, req)
}

func (d *Deps) DeleteOrg(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	if err := d.Sys.DeleteOrg(id); err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, nil)
}

// —— 用户 ——

func (d *Deps) ListUsers(c *gin.Context) {
	list, total, err := d.Sys.ListUsers(c.Query("org_id"), c.Query("keyword"), atoiDefault(c.Query("page"), 1), atoiDefault(c.Query("size"), 20))
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, gin.H{"list": list, "total": total})
}

func (d *Deps) CreateUser(c *gin.Context) {
	var req service.UserInput
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	u, err := d.Sys.CreateUser(req)
	if err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, u)
}

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
	u, err := d.Sys.UpdateUser(id, req)
	if err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, u)
}

func (d *Deps) DeleteUser(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	if err := d.Sys.DeleteUser(id); err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, nil)
}

// —— 角色 ——

func (d *Deps) ListRoles(c *gin.Context) {
	list, err := d.Sys.ListRoles()
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, list)
}

func (d *Deps) CreateRole(c *gin.Context) {
	var req model.SysRole
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	if err := d.Sys.CreateRole(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, req)
}

func (d *Deps) UpdateRole(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req model.SysRole
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	req.ID = id
	if err := d.Sys.UpdateRole(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, req)
}

func (d *Deps) DeleteRole(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	if err := d.Sys.DeleteRole(id); err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, nil)
}

func (d *Deps) GetRolePerms(c *gin.Context) {
	// 路径参数名须为 id（与 CRUD 路由一致）；取值是角色 code，如 admin
	list, err := d.Sys.GetRolePerms(c.Param("id"))
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, list)
}

func (d *Deps) SetRolePerms(c *gin.Context) {
	var req struct {
		Perms []model.SysRolePerm `json:"perms" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	if err := d.Sys.SetRolePerms(c.Param("id"), req.Perms); err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, nil)
}

// —— 字典 ——

func (d *Deps) ListDictTypes(c *gin.Context) {
	list, err := d.Sys.ListDictTypes()
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, list)
}

func (d *Deps) ListDictFields(c *gin.Context) {
	list, err := d.Sys.ListDictFields(c.Query("type_code"))
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, list)
}

func (d *Deps) ListDictItems(c *gin.Context) {
	fid, _ := strconv.ParseUint(c.Query("field_id"), 10, 64)
	list, err := d.Sys.ListDictItems(fid)
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, list)
}

func (d *Deps) CreateDictItem(c *gin.Context) {
	var req model.SysDictItem
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	if err := d.Sys.CreateDictItem(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, req)
}

func (d *Deps) UpdateDictItem(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req model.SysDictItem
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	req.ID = id
	if err := d.Sys.UpdateDictItem(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, req)
}

func (d *Deps) DeleteDictItem(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	if err := d.Sys.DeleteDictItem(id); err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, nil)
}

// —— 操作日志 ——

func (d *Deps) ListOpLogs(c *gin.Context) {
	list, total, err := d.OpLog.List(c.Query("keyword"), atoiDefault(c.Query("page"), 1), atoiDefault(c.Query("size"), 20))
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, gin.H{"list": list, "total": total})
}
