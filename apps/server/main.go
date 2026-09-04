// 高标农田专项整治后台入口。
package main

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"gbnt/apps/server/internal/cachex"
	"gbnt/apps/server/internal/config"
	"gbnt/apps/server/internal/database"
	"gbnt/apps/server/internal/handler"
	"gbnt/apps/server/internal/logger"
	"gbnt/apps/server/internal/migrate"
	"gbnt/apps/server/internal/perm"
	"gbnt/apps/server/internal/service"
	"gbnt/apps/server/internal/watermark"
	"gbnt/apps/server/pkg/jwtutil"
	"gbnt/apps/server/pkg/middleware"
)

func main() {
	cfgPath := os.Getenv("GBNT_CONFIG")
	if cfgPath == "" {
		cfgPath = filepath.Join("configs", "config.yaml")
	}
	cfg, err := config.Load(cfgPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "load config: %v\n", err)
		os.Exit(1)
	}

	logs, err := logger.Init(cfg.Log)
	if err != nil {
		fmt.Fprintf(os.Stderr, "init logger: %v\n", err)
		os.Exit(1)
	}
	defer logger.Sync()

	db, err := database.Open(cfg.MySQL, cfg.Log.SlowSQLMs)
	if err != nil {
		logs.Error.Fatal("mysql", zap.Error(err))
	}
	if cfg.Migrate.Enabled {
		dev := migrate.IsDevMode(cfg.Server.Mode)
		if err := migrate.Auto(db, migrate.Options{Seed: cfg.Migrate.Seed, Dev: dev}); err != nil {
			logs.Error.Fatal("migrate", zap.Error(err))
		}
		logs.Info.Info("migrate ok",
			zap.Bool("dev_reset", dev),
			zap.Bool("seed", cfg.Migrate.Seed || dev),
		)
	} else {
		logs.Info.Info("migrate skipped", zap.String("reason", "migrate.enabled=false"))
	}
	jm := jwtutil.New(cfg.JWT.Secret, cfg.JWT.ExpireHours, cfg.JWT.RenewBeforeHours)
	memCache := cachex.New(5*time.Minute, 10*time.Minute)
	denyList := &jwtutil.DenyList{Store: memCache}
	authSvc := &service.AuthService{DB: db, JWT: jm, Deny: denyList}
	attachSvc := &service.AttachService{
		DB:  db,
		Cfg: cfg.Upload,
		WM:  watermark.NewRenderer(cfg.Upload.Font),
	}
	captchaSvc := &service.CaptchaService{Store: memCache, Cfg: cfg.Captcha}
	permSvc := perm.NewService(db, memCache)
	if cfg.Migrate.Enabled {
		if err := permSvc.ReloadAPIIndex(); err != nil {
			logs.Error.Fatal("perm index", zap.Error(err))
		}
	}
	sysSvc := &service.SysService{DB: db, Perm: permSvc}
	deps := &handler.Deps{
		DB:      db,
		JWT:     jm,
		Cfg:     cfg,
		Auth:    authSvc,
		Captcha: captchaSvc,
		Sys:     sysSvc,
		Issue:   &service.IssueService{DB: db, Attach: attachSvc},
		Attach:  attachSvc,
		OpLog:   &service.OpLogService{DB: db},
		Perm:    permSvc,
	}

	gin.SetMode(cfg.Server.Mode)
	r := gin.New()
	r.Use(middleware.Recovery())
	r.Use(middleware.CORS(middleware.CORSOptions{
		Enabled:          cfg.CORS.Enabled,
		AllowOrigins:     cfg.CORS.AllowOrigins,
		AllowCredentials: cfg.CORS.AllowCredentials,
		MaxAge:           cfg.CORS.MaxAge,
	}))
	r.Use(middleware.TraceAndTiming())
	r.Use(middleware.AccessLog())
	uploadRoot := cfg.Upload.Root
	if !filepath.IsAbs(uploadRoot) {
		if wd, err := os.Getwd(); err == nil {
			uploadRoot = filepath.Join(wd, uploadRoot)
		}
	}
	r.Static("/uploads", uploadRoot)
	r.Use(middleware.JWTAuth(jm, authSvc.LoadActiveUserInfo, denyList, perm.PublicPaths))
	r.Use(middleware.RBAC(permSvc, cfg.RBAC.Enabled, perm.PublicPaths))
	handler.Register(r, deps)
	middleware.OnAfterAccess(func(c *gin.Context, req, resp string) {
		_ = deps.OpLog.Persist(c, req, resp)
	})

	logs.Info.Info("server listen", zap.String("addr", cfg.Server.Addr))
	if err := r.Run(cfg.Server.Addr); err != nil {
		logs.Error.Fatal("run", zap.Error(err))
	}
}
