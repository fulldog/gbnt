package handler

import (
	"errors"

	"github.com/gin-gonic/gin"

	"gbnt/apps/server/internal/database"
	"gbnt/apps/server/internal/service"
	"gbnt/apps/server/pkg/response"
)

// RegisterApp 注册小程序端独立 API（前缀 /api/app，与管理端 /api 分离）。
// 附件仍复用现有 /api/attachments/*；排查图走 type_ext.files，整改走 rectify_list[].file_uuids。
func RegisterApp(r *gin.Engine, d *Deps) {
	app := r.Group("/api/app")
	{
		auth := app.Group("/auth")
		{
			// POST /api/app/auth/slider/start — 开始滑动验证（白名单）
			auth.POST("/slider/start", d.AppSliderStart)
			// POST /api/app/auth/slider/finish — 完成滑动，换取 pass_token（白名单）
			auth.POST("/slider/finish", d.AppSliderFinish)
			// POST /api/app/auth/login — 小程序登录（账密 + pass_token）
			auth.POST("/login", d.AppLogin)
			// GET /api/app/auth/me — 当前登录用户
			auth.GET("/me", d.AppMe)
			// PUT /api/app/auth/password — 本人修改密码（JWT）
			auth.PUT("/password", d.ChangePassword)
			// POST /api/app/auth/logout — 退出登录
			auth.POST("/logout", d.Logout)
		}

		// GET /api/app/todos — 待办列表（status 空=全部，按 new>pending>done 排序）
		app.GET("/todos", d.AppListTodos)
		// GET /api/app/regions — 组织树（parent_id 嵌套 children）
		app.GET("/regions", d.AppRegions)

		issues := app.Group("/issues")
		{
			// POST /api/app/issues — 上报问题（按 quiz 推导 new/done）
			issues.POST("", d.AppCreateIssue)
			// GET /api/app/issues/:id — 问题详情（含 lat/lng，地图页可复用）
			issues.GET("/:id", d.AppGetIssue)
			// POST /api/app/issues/:id/rectify — 页内提交分项整改
			issues.POST("/:id/rectify", d.AppRectifyIssue)
			// POST /api/app/issues/:id/re-rectify — 重新整改（done → pending）
			issues.POST("/:id/re-rectify", d.AppReRectifyIssue)
		}

		mine := app.Group("/mine")
		{
			// GET /api/app/mine/stats — 我的概览：reported/pending/done 数量
			mine.GET("/stats", d.AppMineStats)
			// GET /api/app/mine/issues — 按 scope=reported|pending|done 列表
			mine.GET("/issues", d.AppMineIssues)
		}
	}
}

// AppSliderStart 开始滑动验证。
func (d *Deps) AppSliderStart(c *gin.Context) {
	if d.Captcha == nil {
		response.Fail(c, 500, response.CodeServer, "验证码服务未初始化")
		return
	}
	id, exp, err := d.Captcha.SliderStart()
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, gin.H{"slider_id": id, "expire_seconds": exp})
}

// AppSliderFinish 完成滑动，换取一次性 pass_token。
func (d *Deps) AppSliderFinish(c *gin.Context) {
	var req struct {
		SliderID   string `json:"slider_id" binding:"required"`   // 滑动会话 ID
		DurationMs int64  `json:"duration_ms" binding:"required"` // 滑动耗时毫秒，须在配置区间内
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	if d.Captcha == nil {
		response.Fail(c, 500, response.CodeServer, "验证码服务未初始化")
		return
	}
	token, exp, err := d.Captcha.SliderFinish(req.SliderID, req.DurationMs)
	if err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, gin.H{"pass_token": token, "expire_seconds": exp})
}

// AppLoginReq 小程序登录请求（滑动 pass_token）。
type AppLoginReq struct {
	Username  string `json:"username" binding:"required"` // 登录账号
	Password  string `json:"password" binding:"required"` // 登录密码
	PassToken string `json:"pass_token"`                  // 滑动验证一次性令牌；captcha.enabled=false 时可省略
}

// AppLogin 小程序登录：账密 + pass_token。
func (d *Deps) AppLogin(c *gin.Context) {
	var req AppLoginReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	if d.Cfg != nil && d.Cfg.Captcha.Enabled {
		if err := d.Captcha.VerifyPassToken(req.PassToken); err != nil {
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

// AppMe 小程序当前用户。
func (d *Deps) AppMe(c *gin.Context) {
	d.Me(c)
}

// AppListTodos 小程序待办：筛选 type/status/org_id/project_year/keyword/page/size。
// status 空或 all 表示不限状态；结果按 new > pending > done，同状态 id 降序。
// org_id>0 时含该组织及下级，并与登录用户组织子树取交集。
func (d *Deps) AppListTodos(c *gin.Context) {
	q := service.IssueQuery{
		Type:        c.Query("type"),
		Status:      c.Query("status"),
		OrgID:       parseUint64Query(c.Query("org_id")),
		ProjectYear: atoiDefault(c.Query("project_year"), 0),
		Keyword:     c.Query("keyword"),
		Page:        atoiDefault(c.Query("page"), 1),
		Size:        atoiDefault(c.Query("size"), 20),
	}
	list, total, err := d.Issue.ListTodos(c.Request.Context(), q)
	if err != nil {
		if errors.Is(err, database.ErrUnauth) {
			response.Fail(c, 401, response.CodeUnauth, err.Error())
			return
		}
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, gin.H{"list": list, "total": total, "page": q.Page, "size": q.Size})
}

// AppRegions 小程序组织树：按 sys_orgs.parent_id 返回嵌套 children。
func (d *Deps) AppRegions(c *gin.Context) {
	tree, err := d.Sys.ListOrgTree()
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, gin.H{"list": tree})
}

// AppGetIssue 小程序问题详情。
func (d *Deps) AppGetIssue(c *gin.Context) {
	d.GetIssue(c)
}

// AppCreateIssue 小程序上报（按 quiz 推导 new/done）。
func (d *Deps) AppCreateIssue(c *gin.Context) {
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
	// [PRD] App 端上报人固定为当前登录用户，忽略外部传入值。
	req.ReportUserID = user.ID
	item, err := d.Issue.Create(c.Request.Context(), req)
	if err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	d.OpLog.Mark(c, "小程序上报", item.Type+" · "+item.Code)
	response.OK(c, item)
}

// AppRectifyIssue 小程序页内提交整改。
func (d *Deps) AppRectifyIssue(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req service.RectifyInput
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	item, err := d.Issue.Rectify(c.Request.Context(), id, req, true)
	if err != nil {
		if errors.Is(err, database.ErrUnauth) {
			response.Fail(c, 401, response.CodeUnauth, err.Error())
			return
		}
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	d.OpLog.Mark(c, "小程序整改", item.Type+" · "+item.Code)
	response.OK(c, item)
}

// AppReRectifyIssue 小程序重新整改（done → pending）。
func (d *Deps) AppReRectifyIssue(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	item, err := d.Issue.ReRectify(c.Request.Context(), id, true)
	if err != nil {
		if errors.Is(err, database.ErrUnauth) {
			response.Fail(c, 401, response.CodeUnauth, err.Error())
			return
		}
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	d.OpLog.Mark(c, "小程序重新整改", item.Type+" · "+item.Code)
	response.OK(c, item)
}

// AppMineStats 我的概览数量。
func (d *Deps) AppMineStats(c *gin.Context) {
	user, err := userFromCtx(c)
	if err != nil {
		response.Fail(c, 401, response.CodeUnauth, err.Error())
		return
	}
	stats, err := d.Issue.MineStats(user.ID)
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, stats)
}

// AppMineIssues 我的清单：scope=reported|pending|done。
func (d *Deps) AppMineIssues(c *gin.Context) {
	scope := c.DefaultQuery("scope", "reported")
	page := atoiDefault(c.Query("page"), 1)
	size := atoiDefault(c.Query("size"), 20)
	user, err := userFromCtx(c)
	if err != nil {
		response.Fail(c, 401, response.CodeUnauth, err.Error())
		return
	}
	list, total, err := d.Issue.ListMine(scope, user.ID, page, size)
	if err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, gin.H{"list": list, "total": total, "page": page, "size": size, "scope": scope})
}
