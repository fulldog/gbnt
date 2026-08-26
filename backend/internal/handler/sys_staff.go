package handler

import (
	"github.com/gin-gonic/gin"

	"gbnt/backend/internal/service"
	"gbnt/backend/pkg/response"
	"gbnt/backend/pkg/xlsxutil"
)

func (d *Deps) registerSysStaff(api *gin.RouterGroup) {
	users := api.Group("/sys/users")
	{
		users.GET("", d.ListUsers)
		users.GET("/export", d.ExportUsers)
		users.POST("/import", d.ImportUsers)
		users.POST("", d.CreateUser)
		users.PUT("/:id", d.UpdateUser)
		users.POST("/:id/reset-password", d.ResetUserPassword)
		users.DELETE("/:id", d.DeleteUser)
	}
}

// ListUsers GET /api/sys/users — 工作人员列表；query: org_id/keyword/page/size。
func (d *Deps) ListUsers(c *gin.Context) {
	orgID := parseUint64Query(c.Query("org_id"))
	list, total, err := d.Sys.ListUsers(orgID, c.Query("keyword"), atoiDefault(c.Query("page"), 1), atoiDefault(c.Query("size"), 20))
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, gin.H{"list": list, "total": total})
}

// ExportUsers GET /api/sys/users/export — 导出人员 xlsx；query 同列表、不分页。
func (d *Deps) ExportUsers(c *gin.Context) {
	orgID := parseUint64Query(c.Query("org_id"))
	data, err := d.Sys.ExportUsers(orgID, c.Query("keyword"))
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	xlsxutil.WriteDownload(c, "users.xlsx", data)
}

// ImportUsers POST /api/sys/users/import — 上传 xlsx 仅新增人员。
func (d *Deps) ImportUsers(c *gin.Context) {
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

// CreateUser POST /api/sys/users — 新增工作人员（password 空则=账户名）。
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

// ResetUserPassword POST /api/sys/users/:id/reset-password — 重置密码为账户名。
func (d *Deps) ResetUserPassword(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	if err := d.Sys.ResetPassword(c.Request.Context(), id); err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	d.OpLog.Mark(c, "重置密码", "user_id="+itoa(int(id)))
	response.OK(c, nil)
}
