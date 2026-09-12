package handler

import (
	"errors"
	"time"

	"github.com/gin-gonic/gin"

	"gbnt/apps/server/internal/database"
	"gbnt/apps/server/internal/service"
	"gbnt/apps/server/pkg/response"
	"gorm.io/gorm"
)

// RegisterApp 注册小程序端独立 API（前缀 /api/app，与管理端 /api 分离）。
// 附件仍复用现有 /api/attachments/*；排查图走 type_ext.files，整改走 rectify_list[].file_uuids。
func RegisterApp(r *gin.Engine, d *Deps) {
	app := r.Group("/api/app")
	{
		auth := app.Group("/auth")
		{
			// POST /api/app/auth/slider/start — 开始滑动验证（is_jwt=0）
			auth.POST("/slider/start", d.AppSliderStart)
			// POST /api/app/auth/slider/finish — 完成滑动，换取 pass_token（is_jwt=0）
			auth.POST("/slider/finish", d.AppSliderFinish)
			// POST /api/app/auth/login — 小程序登录（账密 + pass_token，is_jwt=0）
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
		// GET /api/app/regions/:id — 组织存在则返回完整树（含上级与全部下级）
		app.GET("/regions/:id", d.AppRegionSubtree)

		issues := app.Group("/issues")
		{
			// POST /api/app/issues — 上报问题（按 quiz 推导 new/done）
			issues.POST("", d.AppCreateIssue)
			// GET /api/app/issues/:id — 问题详情（含 lat/lng，地图页可复用）
			issues.GET("/:id", d.AppGetIssue)
			// DELETE /api/app/issues/:id — 仅上报人本人软删除
			issues.DELETE("/:id", d.AppDeleteIssue)
			// POST /api/app/issues/:id/feedback — 一份反馈完成本轮剩余整改项
			issues.POST("/:id/feedback", d.AppSubmitFeedback)
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

// AppDeleteIssue 小程序本人删除上报；禁止通过姓名匹配或管理权限代替归属校验。
func (d *Deps) AppDeleteIssue(c *gin.Context) {
	d.OpLog.Mark(c, "小程序删除上报", c.Param("id"))
	id, ok := parseID(c)
	if !ok {
		return
	}
	if err := d.Issue.DeleteReported(c.Request.Context(), id); err != nil {
		if errors.Is(err, database.ErrUnauth) {
			response.Fail(c, 401, response.CodeUnauth, err.Error())
		} else if errors.Is(err, service.ErrIssueReporterOnly) {
			response.Fail(c, 403, response.CodeForbid, err.Error())
		} else {
			response.Fail(c, 400, response.CodeBadReq, err.Error())
		}
		return
	}
	response.OK(c, nil)
}

// AppSubmitFeedback 小程序整单整改；仅 assignee_user 为 0 或当前用户时可改；必传说明、照片和当前轮次。
func (d *Deps) AppSubmitFeedback(c *gin.Context) {
	d.OpLog.Mark(c, "小程序整改反馈", c.Param("id"))
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req service.IssueFeedbackInput
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	item, err := d.Issue.SubmitFeedback(c.Request.Context(), id, req)
	if err != nil {
		if errors.Is(err, database.ErrUnauth) {
			response.Fail(c, 401, response.CodeUnauth, err.Error())
		} else {
			response.Fail(c, 400, response.CodeBadReq, err.Error())
		}
		return
	}
	d.OpLog.Mark(c, "小程序整改反馈", item.Type+" · "+item.Code)
	d.appIssuePayload(c, item)
}

// AppSliderStart 开始滑动验证。
func (d *Deps) AppSliderStart(c *gin.Context) {
	d.OpLog.Mark(c, "小程序滑动验证开始", "")
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
	d.OpLog.Mark(c, "小程序滑动验证完成", "")
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
	Agreed    bool   `json:"agreed"`                      // 必须主动同意用户协议与隐私政策；缺失或 false 拒绝登录
	Username  string `json:"username" binding:"required"` // 登录账号
	Password  string `json:"password" binding:"required"` // 登录密码
	PassToken string `json:"pass_token"`                  // 滑动验证一次性令牌；captcha.enabled=false 时可省略
}

// AppLogin 小程序登录：账密 + pass_token。[PRD] 超级管理员禁止登录小程序。
func (d *Deps) AppLogin(c *gin.Context) {
	d.OpLog.Mark(c, "登录", "")
	var req AppLoginReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	d.OpLog.Mark(c, "登录", req.Username)
	// 协议校验先于一次性滑动令牌消费，未同意时不得创建登录会话。
	if !req.Agreed {
		response.Fail(c, 400, response.CodeBadReq, "请先阅读并同意用户协议与隐私政策")
		return
	}
	if d.Cfg != nil && d.Cfg.Captcha.Enabled {
		if err := d.Captcha.VerifyPassToken(req.PassToken); err != nil {
			response.Fail(c, 400, response.CodeBadReq, err.Error())
			return
		}
	}
	user, token, exp, err := d.Auth.LoginMiniapp(req.Username, req.Password)
	if err != nil {
		if errors.Is(err, service.ErrMiniappSuperAdmin) {
			response.Fail(c, 403, response.CodeForbid, err.Error())
			return
		}
		response.Fail(c, 401, response.CodeUnauth, err.Error())
		return
	}
	info := service.UserInfoFromModel(user)
	c.Request = c.Request.WithContext(database.WithUser(c.Request.Context(), info))
	payload, err := d.appUserPayload(c, info)
	if err != nil {
		response.Fail(c, 500, response.CodeServer, "用户资料加载失败")
		return
	}
	response.OK(c, gin.H{
		"token":      token,
		"expires_at": exp,
		"user":       payload,
	})
}

// AppMe 小程序当前用户，含本人组织和角色名称；关联查询故障不伪装成空名称。
func (d *Deps) AppMe(c *gin.Context) {
	info, err := database.UserFromContext(c.Request.Context())
	if err != nil {
		response.Fail(c, 401, response.CodeUnauth, err.Error())
		return
	}
	payload, err := d.appUserPayload(c, info)
	if err != nil {
		response.Fail(c, 500, response.CodeServer, "用户资料加载失败")
		return
	}
	response.OK(c, payload)
}

func (d *Deps) appUserPayload(c *gin.Context, info *database.UserInfo) (gin.H, error) {
	names, err := d.Auth.MiniappUserNames(c.Request.Context(), info)
	if err != nil {
		return nil, err
	}
	payload := d.userInfoPayload(info)
	payload["org_name"], payload["org_path"], payload["role_name"] = names.OrgName, names.OrgPath, names.RoleName
	return payload, nil
}

func (d *Deps) appIssuePayload(c *gin.Context, item *service.IssueVO) {
	list, err := d.Issue.MiniappIssueViews(c.Request.Context(), []service.IssueVO{*item})
	if err != nil {
		// 写入已成功；明确提示刷新，不把关联查询失败误报为写入失败导致重复提交。
		fallback := service.MiniappIssueVO{
			AdminIssueVO:   service.AdminIssueVO{IssueVO: *item},
			DisplayWarning: "操作已成功，关联资料暂时无法读取，请刷新",
		}
		response.OK(c, fallback)
		return
	}
	response.OK(c, list[0])
}

// AppListTodos 小程序待办：筛选 type/status/org_id/project_year/keyword/page/size；仅未指派或指派给当前用户的工单。
// status 空或 all 表示不限状态；分页前按逾期、即将逾期、正常排序，同组剩余时间倒序。
// org_id>0 时含该组织及下级，并与登录用户组织子树取交集。
func (d *Deps) AppListTodos(c *gin.Context) {
	q := service.IssueQuery{
		AsOf:        time.Now(),
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
	items, err := d.Issue.MiniappIssueViews(c.Request.Context(), list)
	if err != nil {
		response.Fail(c, 500, response.CodeServer, "关联资料加载失败")
		return
	}
	q.Page, q.Size = service.NormalizePagination(q.Page, q.Size, 0)
	// server_time 为本次排序基准时刻（RFC3339），供小程序校准倒计时。
	response.OK(c, gin.H{"list": items, "total": total, "page": q.Page, "size": q.Size, "server_time": q.AsOf.UTC().Format(time.RFC3339Nano)})
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

// AppRegionSubtree 校验组织存在后返回完整组织树（含该节点上级与全部下级）。
func (d *Deps) AppRegionSubtree(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	if id == 0 {
		response.Fail(c, 400, response.CodeBadReq, "无效的 id")
		return
	}
	tree, err := d.Sys.ListOrgSubtree(id)
	if err != nil {
		if errors.Is(err, service.ErrOrgNotFound) {
			response.Fail(c, 404, response.CodeNotFound, err.Error())
			return
		}
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, gin.H{"list": tree})
}

// AppGetIssue 小程序问题详情。
func (d *Deps) AppGetIssue(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	item, err := d.Issue.GetMiniapp(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.Fail(c, 404, response.CodeNotFound, "资源不存在")
		} else {
			response.Fail(c, 500, response.CodeServer, "问题资料加载失败")
		}
		return
	}
	response.OK(c, item)
}

// AppCreateIssue 小程序上报（按 quiz 推导 new/done）。
func (d *Deps) AppCreateIssue(c *gin.Context) {
	d.OpLog.Mark(c, "小程序上报", "")
	var req service.IssueInput
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	d.OpLog.Mark(c, "小程序上报", req.Type)
	user, err := userFromCtx(c)
	if err != nil {
		response.Fail(c, 401, response.CodeUnauth, err.Error())
		return
	}
	// [PRD] App 上报人固定为当前登录用户；整改人不自动填充，忽略外部传入的 assignee_user。
	req.ReportUserID = user.ID
	req.AssigneeUser = 0
	req.AllowUnassignedAssignee = true
	item, err := d.Issue.Create(c.Request.Context(), req)
	if err != nil {
		if issueWriteConflict(c, err) {
			return
		}
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	d.OpLog.Mark(c, "小程序上报", item.Type+" · "+item.Code)
	d.appIssuePayload(c, item)
}

// AppRectifyIssue 小程序页内提交整改。
func (d *Deps) AppRectifyIssue(c *gin.Context) {
	d.OpLog.Mark(c, "小程序整改", c.Param("id"))
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
	d.appIssuePayload(c, item)
}

// AppReRectifyIssue 小程序重新整改（done → pending）。
func (d *Deps) AppReRectifyIssue(c *gin.Context) {
	d.OpLog.Mark(c, "小程序重新整改", c.Param("id"))
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
	d.appIssuePayload(c, item)
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
	items, err := d.Issue.MiniappIssueViews(c.Request.Context(), list)
	if err != nil {
		response.Fail(c, 500, response.CodeServer, "关联资料加载失败")
		return
	}
	page, size = service.NormalizePagination(page, size, 0)
	response.OK(c, gin.H{"list": items, "total": total, "page": page, "size": size, "scope": scope})
}
