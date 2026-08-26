package handler

import (
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"gbnt/backend/internal/config"
	"gbnt/backend/internal/perm"
	"gbnt/backend/internal/service"
	"gbnt/backend/pkg/jwtutil"
)

// Deps 处理器依赖。
type Deps struct {
	DB      *gorm.DB
	JWT     *jwtutil.Manager
	Cfg     *config.Config
	Auth    *service.AuthService
	Captcha *service.CaptchaService
	Sys     *service.SysService
	Issue   *service.IssueService
	Attach  *service.AttachService
	OpLog   *service.OpLogService
	Perm    *perm.Service
}

// Register 注册全部路由（管理端 /api + 小程序 /api/app），按模块分文件注册。
func Register(r *gin.Engine, d *Deps) {
	RegisterApp(r, d)

	api := r.Group("/api")
	d.registerHealth(api)
	d.registerAuth(api)
	d.registerWorkbench(api)
	d.registerRectify(api)
	d.registerLedgerStreet(api)
	d.registerLedgerSurvey(api)
	d.registerSysOrg(api)
	d.registerSysStaff(api)
	d.registerSysRoles(api)
	d.registerSysLogs(api)
	d.registerAttach(api)
}
