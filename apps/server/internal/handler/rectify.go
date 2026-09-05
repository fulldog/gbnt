package handler

import (
	"errors"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"gbnt/apps/server/internal/database"
	"gbnt/apps/server/internal/service"
	"gbnt/apps/server/pkg/response"
)

func (d *Deps) registerRectify(api *gin.RouterGroup) {
	issues := api.Group("/issues")
	{
		issues.GET("", d.ListIssues)
		issues.POST("", d.CreateIssue)
		issues.POST("/import", d.ImportIssues)
		issues.GET("/options/orgs", d.IssueOrgOptions)
		issues.GET("/options/reporters", d.IssueReporterOptions)
		issues.GET("/:id/assignee-options", d.IssueAssigneeOptions)
		issues.GET("/:id", d.GetIssue)
		issues.PUT("/:id", d.UpdateIssue)
		issues.DELETE("/:id", d.DeleteIssue)
		issues.POST("/:id/rectify", d.RectifyIssue)
		issues.POST("/:id/re-rectify", d.ReRectifyIssue)
		issues.POST("/:id/reassign", d.ReassignIssue)
	}
}

// ListIssues GET /api/issues — 专项整改列表；query: type/status/org_id/project_year/keyword/page/size。
func (d *Deps) ListIssues(c *gin.Context) {
	q := service.IssueQuery{
		Type:        c.Query("type"),
		Status:      c.Query("status"),
		OrgID:       parseUint64Query(c.Query("org_id")),
		ProjectYear: atoiDefault(c.Query("project_year"), 0),
		Keyword:     c.Query("keyword"),
		Page:        atoiDefault(c.Query("page"), 1),
		Size:        atoiDefault(c.Query("size"), 20),
	}
	q.Page, q.Size = service.NormalizePagination(q.Page, q.Size, 0)
	list, total, err := d.Issue.ListAdmin(c.Request.Context(), q)
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, gin.H{"list": list, "total": total, "page": q.Page, "size": q.Size})
}

// GetIssue GET /api/issues/:id — 问题详情（type_ext.photos、整改 records.photos）。
func (d *Deps) GetIssue(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	item, err := d.Issue.GetAdmin(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Fail(c, 404, response.CodeNotFound, "资源不存在")
			return
		}
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, item)
}

// CreateIssue POST /api/issues — 新增排查；org_id + QuizBool 推导 needs_rectify/status。
func (d *Deps) CreateIssue(c *gin.Context) {
	var req service.IssueInput
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	item, err := d.Issue.Create(c.Request.Context(), req)
	if err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	d.OpLog.Mark(c, "上报问题", item.Type+" · "+item.Code)
	response.OK(c, item)
}

// UpdateIssue PUT /api/issues/:id — 更新问题；传 type_ext 时按 type 校验。
func (d *Deps) UpdateIssue(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req service.IssueInput
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	item, err := d.Issue.Update(c.Request.Context(), id, req)
	if err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, item)
}

// DeleteIssue DELETE /api/issues/:id — 删除问题（软删）。
func (d *Deps) DeleteIssue(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	if err := d.Issue.Delete(c.Request.Context(), id); err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, nil)
}

// RectifyIssue POST /api/issues/:id/rectify — 整改闭环；body 见 RectifyInput。
func (d *Deps) RectifyIssue(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req service.RectifyInput
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	item, err := d.Issue.Rectify(c.Request.Context(), id, req, false)
	if err != nil {
		if errors.Is(err, database.ErrUnauth) {
			response.Fail(c, 401, response.CodeUnauth, err.Error())
			return
		}
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, item)
}

// ReRectifyIssue POST /api/issues/:id/re-rectify — 重新整改（done → pending）。
func (d *Deps) ReRectifyIssue(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	item, err := d.Issue.ReRectify(c.Request.Context(), id, false)
	if err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	d.OpLog.Mark(c, "重新整改", item.Type+" · "+item.Code)
	response.OK(c, item)
}

// ReassignIssue POST /api/issues/:id/reassign — 重新指派整改人；body: {assignee_user}。
func (d *Deps) ReassignIssue(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req service.ReassignInput
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	item, err := d.Issue.Reassign(c.Request.Context(), id, req)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Fail(c, 404, response.CodeNotFound, "资源不存在")
			return
		}
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	d.OpLog.Mark(c, "重新指派整改人", item.Type+" · "+item.Code)
	response.OK(c, item)
}

// ImportIssues POST /api/issues/import — 批量导入 {rows:IssueInput[]}。
func (d *Deps) ImportIssues(c *gin.Context) {
	var req service.ImportIssuesReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}

	n, err := d.Issue.Import(c.Request.Context(), req.Rows)
	if err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	d.OpLog.Mark(c, "批量导入", "导入 "+itoa(n)+" 条")
	response.OK(c, gin.H{"imported": n})
}
