package handler

import (
	"github.com/gin-gonic/gin"

	"gbnt/backend/internal/service"
	"gbnt/backend/pkg/response"
)

// RegisterApp 注册小程序端独立 API（前缀 /api/app，与管理端 /api 分离）。
// 附件仍复用现有 /api/attachments/*，小程序上传后业务侧传 file_uuids。
func RegisterApp(r *gin.Engine, d *Deps) {
	app := r.Group("/api/app")
	{
		auth := app.Group("/auth")
		{
			// POST /api/app/auth/login — 小程序登录（账密），签发同一套 JWT
			auth.POST("/login", d.AppLogin)
			// GET /api/app/auth/me — 当前登录用户
			auth.GET("/me", d.AppMe)
		}

		// GET /api/app/todos — 待办列表（默认 status=pending）
		app.GET("/todos", d.AppListTodos)
		// GET /api/app/regions — 行政区划树（街道→村/社区，上报/待办筛选）
		app.GET("/regions", d.AppRegions)

		issues := app.Group("/issues")
		{
			// POST /api/app/issues — 上报问题（提交即待整改；file_uuids → photo_ref_uuid）
			issues.POST("", d.AppCreateIssue)
			// GET /api/app/issues/:id — 问题详情（含 lat/lng，地图页可复用）
			issues.GET("/:id", d.AppGetIssue)
			// POST /api/app/issues/:id/rectify — 页内提交整改（照片闭环）
			issues.POST("/:id/rectify", d.AppRectifyIssue)
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

// AppLogin 小程序登录，复用 AuthService 签发 JWT。
func (d *Deps) AppLogin(c *gin.Context) {
	d.Login(c)
}

// AppMe 小程序当前用户。
func (d *Deps) AppMe(c *gin.Context) {
	d.Me(c)
}

// AppListTodos 小程序待办：筛选 type/status/street/village/keyword/page/size。
// 未传 status 时默认 pending；传 status=all 表示不限状态。
func (d *Deps) AppListTodos(c *gin.Context) {
	rawStatus := c.Query("status")
	q := service.IssueQuery{
		Type:    c.Query("type"),
		Status:  rawStatus,
		Street:  c.Query("street"),
		Village: c.Query("village"),
		Keyword: c.Query("keyword"),
		Page:    atoiDefault(c.Query("page"), 1),
		Size:    atoiDefault(c.Query("size"), 20),
	}
	list, total, err := d.Issue.ListTodos(q)
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	status := rawStatus
	if status == "" {
		status = "pending"
	}
	response.OK(c, gin.H{"list": list, "total": total, "page": q.Page, "size": q.Size, "status": status})
}

// AppRegions 小程序行政区划：返回街道及下属村/社区（对齐 miniapp 双列滚筒数据源）。
func (d *Deps) AppRegions(c *gin.Context) {
	orgs, err := d.Sys.ListOrgs()
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	type child struct {
		ID   uint64 `json:"id"`
		Name string `json:"name"`
		Type string `json:"type"`
	}
	type street struct {
		ID       uint64  `json:"id"`
		Name     string  `json:"name"`
		Children []child `json:"children"`
	}
	out := make([]street, 0)
	for _, o := range orgs {
		if o.Type != "street" {
			continue
		}
		s := street{ID: o.ID, Name: o.Name, Children: []child{}}
		for _, cld := range orgs {
			if cld.ParentID == o.ID && (cld.Type == "village" || cld.Type == "community" || cld.Remark == "village" || cld.Remark == "community") {
				s.Children = append(s.Children, child{ID: cld.ID, Name: cld.Name, Type: cld.Type})
			}
		}
		out = append(out, s)
	}
	response.OK(c, gin.H{"list": out})
}

// AppGetIssue 小程序问题详情。
func (d *Deps) AppGetIssue(c *gin.Context) {
	d.GetIssue(c)
}

// AppCreateIssue 小程序上报（提交即待整改）。
func (d *Deps) AppCreateIssue(c *gin.Context) {
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
	_ = d.OpLog.Push(userID(c), c.GetString("username"), "小程序上报", item.Type+" · "+item.Code, c.Request.URL.Path, c.GetString(response.CtxTraceID), c.ClientIP())
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
	item, err := d.Issue.Rectify(id, req)
	if err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	_ = d.OpLog.Push(userID(c), c.GetString("username"), "小程序整改", item.Type+" · "+item.Code, c.Request.URL.Path, c.GetString(response.CtxTraceID), c.ClientIP())
	response.OK(c, item)
}

// AppMineStats 我的概览数量。
func (d *Deps) AppMineStats(c *gin.Context) {
	stats, err := d.Issue.MineStats(userID(c), c.GetString("user_name"))
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
	list, total, err := d.Issue.ListMine(scope, userID(c), c.GetString("user_name"), page, size)
	if err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, gin.H{"list": list, "total": total, "page": page, "size": size, "scope": scope})
}
