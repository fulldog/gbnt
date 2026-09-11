package handler

import (
	"github.com/gin-gonic/gin"

	"gbnt/apps/server/internal/service"
	"gbnt/apps/server/pkg/response"
	"gbnt/apps/server/pkg/xlsxutil"
)

func (d *Deps) registerSysStaff(api *gin.RouterGroup) {
	users := api.Group("/sys/users")
	{
		users.GET("", d.ListUsers)
		users.GET("/by-org", d.ListUsersByOrgID)
		users.GET("/export", d.ExportUsers)
		users.POST("/import", d.ImportUsers)
		users.POST("", d.CreateUser)
		users.PUT("/:id", d.UpdateUser)
		users.PUT("/:id/status", d.UpdateUserStatus)
		users.POST("/:id/reset-password", d.ResetUserPassword)
		users.DELETE("/:id", d.DeleteUser)
	}
}

// ListUsers GET /api/sys/users — 工作人员列表；query: org_id/keyword/page/size；按 sort 升序、id 倒序分页，sort_supported 表示支持人员排序。
func (d *Deps) ListUsers(c *gin.Context) {
	orgID := parseUint64Query(c.Query("org_id"))
	page, size := service.NormalizePagination(atoiDefault(c.Query("page"), 1), atoiDefault(c.Query("size"), 20), 0)
	list, total, err := d.Sys.ListAdminUsers(c.Request.Context(), orgID, c.Query("keyword"), page, size)
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, gin.H{"list": list, "total": total, "page": page, "size": size, "sort_supported": true})
}

// ListUsersByOrgID GET /api/sys/users/by-org — 按行政区划 ID 获取用户列表；按 sort 升序、id 倒序。
func (d *Deps) ListUsersByOrgID(c *gin.Context) {
	orgID := parseUint64Query(c.Query("org_id"))
	list, err := d.Sys.ListUsersByOrgID(orgID)
	if err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, gin.H{"list": list, "total": len(list)})
}

// ExportUsers GET /api/sys/users/export — 导出人员 xlsx；query 同列表、不分页，包含排序列并沿用列表排序。
func (d *Deps) ExportUsers(c *gin.Context) {
	orgID := parseUint64Query(c.Query("org_id"))
	data, err := d.Sys.ExportUsers(orgID, c.Query("keyword"))
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	xlsxutil.WriteDownload(c, "users.xlsx", data)
}

// ImportUsers POST /api/sys/users/import — 上传 xlsx 仅新增人员；排序列可选，缺失或空值默认 100。
func (d *Deps) ImportUsers(c *gin.Context) {
	d.OpLog.Mark(c, "导入人员", "")
	fh, err := c.FormFile("file")
	if err != nil {
		response.Fail(c, 400, response.CodeBadReq, "请上传 file")
		return
	}
	f, err := fh.Open()
	if err != nil {
		response.Fail(c, 400, response.CodeBadReq, "无法读取文件")
		return
	}
	defer f.Close()
	n, err := d.Sys.ImportUsers(c.Request.Context(), f)
	if err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	d.OpLog.Mark(c, "导入人员", "导入 "+itoa(n)+" 条")
	response.OK(c, gin.H{"imported": n})
}

// CreateUser POST /api/sys/users — 新增工作人员；password 空则=账户名；sort 为可选整数，默认 100，越小越靠前。
func (d *Deps) CreateUser(c *gin.Context) {
	d.OpLog.Mark(c, "新增用户", "")
	var req service.UserInput
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	d.OpLog.Mark(c, "新增用户", req.Username)
	u, err := d.Sys.CreateUser(c.Request.Context(), req)
	if err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, u)
}

// UpdateUser PUT /api/sys/users/:id — 更新工作人员；password 空则不改，sort/status 未传则保留原值。
func (d *Deps) UpdateUser(c *gin.Context) {
	d.OpLog.Mark(c, "更新用户", c.Param("id"))
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

// UpdateUserStatus PUT /api/sys/users/:id/status — 仅更新工作人员状态；body: status（0/1，必填）；需工作人员修改权限，禁止修改超级管理员，成功返回 data:null。
func (d *Deps) UpdateUserStatus(c *gin.Context) {
	d.OpLog.Mark(c, "更新用户状态", c.Param("id"))
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req service.UserStatusInput
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "状态必须为0（停用）或1（启用）")
		return
	}
	if err := d.Sys.UpdateUserStatus(c.Request.Context(), id, req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, nil)
}

// DeleteUser DELETE /api/sys/users/:id — 删除工作人员（软删）。
func (d *Deps) DeleteUser(c *gin.Context) {
	d.OpLog.Mark(c, "删除用户", c.Param("id"))
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

// ResetUserPassword POST /api/sys/users/:id/reset-password — 重置密码为账户名。
func (d *Deps) ResetUserPassword(c *gin.Context) {
	d.OpLog.Mark(c, "重置密码", "user_id="+c.Param("id"))
	id, ok := parseID(c)
	if !ok {
		return
	}
	if err := d.Sys.ResetPassword(c.Request.Context(), id); err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, nil)
}
