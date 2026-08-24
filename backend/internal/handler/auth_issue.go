package handler

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"gbnt/backend/internal/database"
	"gbnt/backend/internal/model"
	"gbnt/backend/internal/perm"
	"gbnt/backend/internal/service"
	"gbnt/backend/pkg/response"
)

// LoginReq 管理端登录请求（图形验证码）。
type LoginReq struct {
	Username  string `json:"username" binding:"required"`
	Password  string `json:"password" binding:"required"`
	CaptchaID string `json:"captcha_id"`
	Captcha   string `json:"captcha"`
}

// GetCaptcha 获取图形验证码。
func (d *Deps) GetCaptcha(c *gin.Context) {
	if d.Captcha == nil {
		response.Fail(c, 500, response.CodeServer, "验证码服务未初始化")
		return
	}
	out, err := d.Captcha.CreateImage()
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, out)
}

// Login 账号密码 + 图形验证码登录，返回 JWT。
func (d *Deps) Login(c *gin.Context) {
	var req LoginReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	if d.Cfg != nil && d.Cfg.Captcha.Enabled {
		if err := d.Captcha.VerifyImage(req.CaptchaID, req.Captcha); err != nil {
			response.Fail(c, 400, response.CodeBadReq, err.Error())
			return
		}
	}
	user, token, exp, err := d.Auth.Login(req.Username, req.Password)
	if err != nil {
		response.Fail(c, 401, response.CodeUnauth, err.Error())
		return
	}
	c.Request = c.Request.WithContext(database.WithUser(c.Request.Context(), service.UserInfoFromModel(user)))
	d.OpLog.Mark(c, "登录", user.Username)
	response.OK(c, gin.H{
		"token":      token,
		"expires_at": exp,
		"user":       d.userPayload(user),
	})
}

func (d *Deps) userPayload(u *model.SysUser) gin.H {
	if u == nil {
		return nil
	}
	out := gin.H{
		"id":       u.ID,
		"username": u.Username,
		"name":     u.Name,
		"phone":    u.Phone,
		"org_id":   u.OrgID,
		"role_id":  u.RoleID,
	}
	d.fillAPIs(out, u.RoleID)
	return out
}

func (d *Deps) userInfoPayload(info *database.UserInfo) gin.H {
	if info == nil {
		return nil
	}
	out := gin.H{
		"id":       info.ID,
		"username": info.Username,
		"name":     info.Name,
		"phone":    info.Phone,
		"org_id":   info.OrgID,
		"role_id":  info.RoleID,
	}
	d.fillAPIs(out, info.RoleID)
	return out
}

func (d *Deps) fillAPIs(out gin.H, roleID uint64) {
	if d.Perm == nil {
		return
	}
	if roleID == perm.SuperAdminRoleID {
		out["apis"] = "*"
		return
	}
	ids, err := d.Perm.ListAPIIDsForRole(roleID)
	if err != nil {
		out["apis"] = []uint64{}
		return
	}
	out["apis"] = ids
}

// Me 当前登录用户。
func (d *Deps) Me(c *gin.Context) {
	info, err := database.UserFromContext(c.Request.Context())
	if err != nil {
		response.Fail(c, 401, response.CodeUnauth, err.Error())
		return
	}
	response.OK(c, d.userInfoPayload(info))
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
	user, err := userFromCtx(c)
	if err != nil {
		response.Fail(c, 401, response.CodeUnauth, err.Error())
		return
	}
	item, err := d.Issue.Create(c.Request.Context(), req, user.ID, user.Name)
	if err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	d.OpLog.Mark(c, "上报问题", item.Type+" · "+item.Code)
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
	item, err := d.Issue.Update(c.Request.Context(), id, req)
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
	if err := d.Issue.Delete(c.Request.Context(), id); err != nil {
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
	var req service.RectifyInput
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	item, err := d.Issue.Rectify(c.Request.Context(), id, req)
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
	user, err := userFromCtx(c)
	if err != nil {
		response.Fail(c, 401, response.CodeUnauth, err.Error())
		return
	}
	n, err := d.Issue.Import(c.Request.Context(), req.Rows, user.ID, user.Name)
	if err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	d.OpLog.Mark(c, "批量导入", "导入 "+itoa(n)+" 条")
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
