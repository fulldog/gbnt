package handler

import (
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"gbnt/backend/internal/database"
	"gbnt/backend/internal/model"
	"gbnt/backend/internal/service"
	"gbnt/backend/pkg/response"
)

// LoginReq 管理端登录请求（图形验证码）。
type LoginReq struct {
	Username  string `json:"username" binding:"required"` // 登录账号
	Password  string `json:"password" binding:"required"` // 登录密码
	CaptchaID string `json:"captcha_id"`                  // 图形验证码会话 ID；captcha.enabled=false 时可省略
	Captcha   string `json:"captcha"`                     // 图形验证码答案；captcha.enabled=false 时可省略
}

// GetCaptcha GET /api/auth/captcha — 图形验证码（公开），返回 captcha_id / image_base64。
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

// Login POST /api/auth/login — 账密 + 图形验证码登录（公开），返回 token / expires_at / user。
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
		"id":             u.ID,
		"username":       u.Username,
		"name":           u.Name,
		"phone":          u.Phone,
		"org_id":         u.OrgID,
		"role_id":        u.RoleID,
		"is_super_admin": u.IsSuperAdmin,
	}
	d.fillAPIs(out, u.RoleID, u.IsSuperAdmin)
	return out
}

func (d *Deps) userInfoPayload(info *database.UserInfo) gin.H {
	if info == nil {
		return nil
	}
	out := gin.H{
		"id":             info.ID,
		"username":       info.Username,
		"name":           info.Name,
		"phone":          info.Phone,
		"org_id":         info.OrgID,
		"role_id":        info.RoleID,
		"is_super_admin": info.IsSuperAdmin,
	}
	d.fillAPIs(out, info.RoleID, info.IsSuperAdmin)
	return out
}

func (d *Deps) fillAPIs(out gin.H, roleID uint64, isSuperAdmin bool) {
	if d.Perm == nil {
		return
	}
	if isSuperAdmin {
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

// Me GET /api/auth/me — 当前用户（含 role_id、apis；超管 apis="*"）。
func (d *Deps) Me(c *gin.Context) {
	info, err := database.UserFromContext(c.Request.Context())
	if err != nil {
		response.Fail(c, 401, response.CodeUnauth, err.Error())
		return
	}
	response.OK(c, d.userInfoPayload(info))
}

// ChangePassword PUT /api/auth/password — 本人改密（JWT，不做 RBAC）。
func (d *Deps) ChangePassword(c *gin.Context) {
	user, err := userFromCtx(c)
	if err != nil {
		response.Fail(c, 401, response.CodeUnauth, err.Error())
		return
	}
	var req service.ChangePasswordReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	if err := d.Auth.ChangePassword(c.Request.Context(), user.ID, req.OldPassword, req.NewPassword, req.ConfirmPassword); err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	d.OpLog.Mark(c, "修改密码", user.Username)
	response.OK(c, nil)
}

// Logout POST /api/auth/logout — 退出登录：当前 token jti 入黑名单（JWT，不做 RBAC）。
func (d *Deps) Logout(c *gin.Context) {
	auth := c.GetHeader("Authorization")
	raw := strings.TrimPrefix(auth, "Bearer ")
	if err := d.Auth.Logout(raw); err != nil {
		response.Fail(c, 401, response.CodeUnauth, err.Error())
		return
	}
	if user, err := userFromCtx(c); err == nil {
		d.OpLog.Mark(c, "退出登录", user.Username)
	}
	response.OK(c, nil)
}

// WorkbenchStats GET /api/workbench/stats — 上报/待整改/已整改/完成率/分类型。
func (d *Deps) WorkbenchStats(c *gin.Context) {
	stats, err := d.Issue.Stats()
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, stats)
}

// ListIssues GET /api/issues — 专项整改列表；query: type/status/street/village/*_org_id/project_year/keyword/page/size。
func (d *Deps) ListIssues(c *gin.Context) {
	q := service.IssueQuery{
		Type:          c.Query("type"),
		Status:        c.Query("status"),
		Street:        c.Query("street"),
		Village:       c.Query("village"),
		RootOrgID:     parseUint64Query(c.Query("root_org_id")),
		DistrictOrgID: parseUint64Query(c.Query("district_org_id")),
		StreetOrgID:   parseUint64Query(c.Query("street_org_id")),
		VillageOrgID:  parseUint64Query(c.Query("village_org_id")),
		ProjectYear:   atoiDefault(c.Query("project_year"), 0),
		Keyword:       c.Query("keyword"),
		Page:          atoiDefault(c.Query("page"), 1),
		Size:          atoiDefault(c.Query("size"), 20),
	}
	list, total, err := d.Issue.List(q)
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
	item, err := d.Issue.Get(id)
	if err != nil {
		response.Fail(c, 404, response.CodeNotFound, "资源不存在")
		return
	}
	response.OK(c, item)
}

// CreateIssue POST /api/issues — 新增排查；区划 ID + QuizBool 推导 needs_rectify/status。
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
	item, err := d.Issue.Rectify(c.Request.Context(), id, req)
	if err != nil {
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
	item, err := d.Issue.ReRectify(c.Request.Context(), id)
	if err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	d.OpLog.Mark(c, "重新整改", item.Type+" · "+item.Code)
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

// LedgerStreet GET /api/ledger/street — 街道台账聚合；query: street/date_from/date_to。
func (d *Deps) LedgerStreet(c *gin.Context) {
	data, err := d.Issue.LedgerStreet(c.Query("street"), c.Query("date_from"), c.Query("date_to"))
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, data)
}

// LedgerSurvey GET /api/ledger/survey — 街道排查汇总；query: street/date_from/date_to。
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

func parseUint64Query(s string) uint64 {
	if s == "" {
		return 0
	}
	n, err := strconv.ParseUint(s, 10, 64)
	if err != nil {
		return 0
	}
	return n
}

func itoa(n int) string {
	return strconv.Itoa(n)
}
