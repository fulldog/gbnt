// Package handler HTTP 处理器集合。
package handler

import (
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"gbnt/backend/internal/config"
	"gbnt/backend/internal/database"
	"gbnt/backend/internal/service"
	"gbnt/backend/pkg/jwtutil"
	"gbnt/backend/pkg/response"
)

// Deps 处理器依赖。
type Deps struct {
	DB     *gorm.DB
	JWT    *jwtutil.Manager
	Cfg    *config.Config
	Auth   *service.AuthService
	Sys    *service.SysService
	Issue  *service.IssueService
	Attach *service.AttachService
	OpLog  *service.OpLogService
}

// Register 注册全部路由（管理端 /api + 小程序 /api/app）。
func Register(r *gin.Engine, d *Deps) {
	RegisterApp(r, d)

	api := r.Group("/api")
	{
		// GET /api/health — 健康检查（无需登录）
		api.GET("/health", d.Health)

		auth := api.Group("/auth")
		{
			// POST /api/auth/login — 账号密码登录，返回 JWT
			auth.POST("/login", d.Login)
			// GET /api/auth/me — 当前登录用户信息
			auth.GET("/me", d.Me)
		}

		// GET /api/workbench/stats — 工作台统计（上报/待整改/已整改/完成率）
		api.GET("/workbench/stats", d.WorkbenchStats)

		issues := api.Group("/issues")
		{
			// GET /api/issues — 专项整改列表（筛选/分页）
			issues.GET("", d.ListIssues)
			// POST /api/issues — 新增排查问题（提交即待整改）
			issues.POST("", d.CreateIssue)
			// POST /api/issues/import — 批量导入（须在 /:id 之前注册）
			issues.POST("/import", d.ImportIssues)
			// GET /api/issues/:id — 问题详情
			issues.GET("/:id", d.GetIssue)
			// PUT /api/issues/:id — 更新问题
			issues.PUT("/:id", d.UpdateIssue)
			// DELETE /api/issues/:id — 删除问题
			issues.DELETE("/:id", d.DeleteIssue)
			// POST /api/issues/:id/rectify — 提交整改结果（照片 UUID 闭环）
			issues.POST("/:id/rectify", d.RectifyIssue)
		}

		// GET /api/ledger/street — 街道台账聚合
		api.GET("/ledger/street", d.LedgerStreet)
		// GET /api/ledger/survey — 街道排查汇总
		api.GET("/ledger/survey", d.LedgerSurvey)

		sys := api.Group("/sys")
		{
			// GET /api/sys/orgs — 组织架构列表
			sys.GET("/orgs", d.ListOrgs)
			// POST /api/sys/orgs — 新增组织
			sys.POST("/orgs", d.CreateOrg)
			// PUT /api/sys/orgs/:id — 更新组织
			sys.PUT("/orgs/:id", d.UpdateOrg)
			// DELETE /api/sys/orgs/:id — 删除组织（根节点不可删）
			sys.DELETE("/orgs/:id", d.DeleteOrg)

			// GET /api/sys/users — 工作人员列表
			sys.GET("/users", d.ListUsers)
			// POST /api/sys/users — 新增工作人员
			sys.POST("/users", d.CreateUser)
			// PUT /api/sys/users/:id — 更新工作人员
			sys.PUT("/users/:id", d.UpdateUser)
			// DELETE /api/sys/users/:id — 删除工作人员
			sys.DELETE("/users/:id", d.DeleteUser)

			// GET /api/sys/roles — 角色列表
			sys.GET("/roles", d.ListRoles)
			// POST /api/sys/roles — 新增角色
			sys.POST("/roles", d.CreateRole)
			// GET /api/sys/roles/:id/perms — 查询角色权限（:id 为角色 code；须与下方 :id 同名，Gin 禁止 :code/:id 混用）
			sys.GET("/roles/:id/perms", d.GetRolePerms)
			// PUT /api/sys/roles/:id/perms — 覆盖设置角色权限（:id 为角色 code）
			sys.PUT("/roles/:id/perms", d.SetRolePerms)
			// PUT /api/sys/roles/:id — 更新角色（数字主键）
			sys.PUT("/roles/:id", d.UpdateRole)
			// DELETE /api/sys/roles/:id — 删除角色（数字主键）
			sys.DELETE("/roles/:id", d.DeleteRole)

			// GET /api/sys/dict/types — 数据字典类型（排查类型）
			sys.GET("/dict/types", d.ListDictTypes)
			// GET /api/sys/dict/fields — 字典字段列表
			sys.GET("/dict/fields", d.ListDictFields)
			// GET /api/sys/dict/items — 字典选项列表
			sys.GET("/dict/items", d.ListDictItems)
			// POST /api/sys/dict/items — 新增字典选项
			sys.POST("/dict/items", d.CreateDictItem)
			// PUT /api/sys/dict/items/:id — 更新字典选项
			sys.PUT("/dict/items/:id", d.UpdateDictItem)
			// DELETE /api/sys/dict/items/:id — 删除字典选项
			sys.DELETE("/dict/items/:id", d.DeleteDictItem)

			// GET /api/sys/op-logs — 操作日志列表
			sys.GET("/op-logs", d.ListOpLogs)
		}

		att := api.Group("/attachments")
		{
			// POST /api/attachments/images — 批量直传图片（multipart，逐张打水印）
			att.POST("/images", d.AttachUploadImages)
		}
	}
}

// Health 健康检查。
func (d *Deps) Health(c *gin.Context) {
	response.OK(c, gin.H{"status": "up"})
}

func parseID(c *gin.Context) (uint64, bool) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		response.Fail(c, 400, response.CodeBadReq, "无效的 id")
		return 0, false
	}
	return id, true
}

func userFromCtx(c *gin.Context) (*database.UserInfo, error) {
	return database.UserFromContext(c.Request.Context())
}

func splitCSV(s string) []string {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}
