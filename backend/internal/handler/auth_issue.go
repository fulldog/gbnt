package handler

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"gbnt/backend/internal/service"
	"gbnt/backend/pkg/response"
)

// LoginReq 登录请求。
type LoginReq struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// Login 账号密码登录，返回 JWT。
func (d *Deps) Login(c *gin.Context) {
	var req LoginReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	user, token, exp, err := d.Auth.Login(req.Username, req.Password)
	if err != nil {
		response.Fail(c, 401, response.CodeUnauth, err.Error())
		return
	}
	_ = d.OpLog.Push(user.ID, user.Username, "登录", user.Username, c.Request.URL.Path, c.GetString(response.CtxTraceID), c.ClientIP())
	response.OK(c, gin.H{
		"token":      token,
		"expires_at": exp,
		"user": gin.H{
			"id":       user.ID,
			"username": user.Username,
			"name":     user.Name,
			"phone":    user.Phone,
			"org_id":   user.OrgKey,
			"role":     user.Role,
		},
	})
}

// Me 当前登录用户。
func (d *Deps) Me(c *gin.Context) {
	uid := userID(c)
	user, err := d.Auth.GetByID(uid)
	if err != nil {
		response.Fail(c, 401, response.CodeUnauth, "未登录或凭证无效")
		return
	}
	response.OK(c, gin.H{
		"id":       user.ID,
		"username": user.Username,
		"name":     user.Name,
		"phone":    user.Phone,
		"org_id":   user.OrgKey,
		"role":     user.Role,
	})
}

// WorkbenchStats 工作台统计。
func (d *Deps) WorkbenchStats(c *gin.Context) {
	stats, err := d.Issue.Stats()
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, stats)
}

// ListIssues 问题列表。
func (d *Deps) ListIssues(c *gin.Context) {
	q := service.IssueQuery{
		Type:    c.Query("type"),
		Status:  c.Query("status"),
		Street:  c.Query("street"),
		Village: c.Query("village"),
		Keyword: c.Query("keyword"),
		Page:    atoiDefault(c.Query("page"), 1),
		Size:    atoiDefault(c.Query("size"), 20),
	}
	list, total, err := d.Issue.List(q)
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, gin.H{"list": list, "total": total, "page": q.Page, "size": q.Size})
}

// GetIssue 问题详情。
func (d *Deps) GetIssue(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	item, err := d.Issue.Get(id)
	if err != nil {
		response.Fail(c, 404, response.CodeNotFound, "资源不存在")
		return
	}
	response.OK(c, item)
}

// CreateIssue 新增排查问题（提交即待整改）。
func (d *Deps) CreateIssue(c *gin.Context) {
	var req service.IssueInput
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	item, err := d.Issue.Create(req, userID(c), c.GetString("user_name"))
	if err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	_ = d.OpLog.Push(userID(c), c.GetString("username"), "上报问题", item.Type+" · "+item.Code, c.Request.URL.Path, c.GetString(response.CtxTraceID), c.ClientIP())
	response.OK(c, item)
}

// UpdateIssue 更新问题。
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
	item, err := d.Issue.Update(id, req)
	if err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, item)
}

// DeleteIssue 删除问题。
func (d *Deps) DeleteIssue(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	if err := d.Issue.Delete(id); err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, nil)
}

// RectifyIssue 提交整改结果。
func (d *Deps) RectifyIssue(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req struct {
		Note       string   `json:"note"`
		PhotoUUIDs []string `json:"photo_uuids" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误：需 photo_uuids")
		return
	}
	item, err := d.Issue.Rectify(id, req.Note, req.PhotoUUIDs)
	if err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, item)
}

// ImportIssues 批量导入。
func (d *Deps) ImportIssues(c *gin.Context) {
	var req struct {
		Rows []service.IssueInput `json:"rows" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	n, err := d.Issue.Import(req.Rows, userID(c), c.GetString("user_name"))
	if err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	_ = d.OpLog.Push(userID(c), c.GetString("username"), "批量导入", "导入 "+itoa(n)+" 条", c.Request.URL.Path, c.GetString(response.CtxTraceID), c.ClientIP())
	response.OK(c, gin.H{"imported": n})
}

// LedgerStreet 街道台账聚合。
func (d *Deps) LedgerStreet(c *gin.Context) {
	data, err := d.Issue.LedgerStreet(c.Query("street"), c.Query("date_from"), c.Query("date_to"))
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, data)
}

// LedgerSurvey 街道排查汇总。
func (d *Deps) LedgerSurvey(c *gin.Context) {
	data, err := d.Issue.LedgerSurvey(c.Query("street"), c.Query("date_from"), c.Query("date_to"))
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, data)
}

func atoiDefault(s string, def int) int {
	if s == "" {
		return def
	}
	n, err := strconv.Atoi(s)
	if err != nil || n <= 0 {
		return def
	}
	return n
}

func itoa(n int) string {
	return strconv.Itoa(n)
}
