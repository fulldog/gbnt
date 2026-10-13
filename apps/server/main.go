// 高标农田专项整治后台入口。
package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"gorm.io/gorm"

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

	logs, err := logger.Init(cfg.Log, cfg.Server.Mode)
	if err != nil {
		fmt.Fprintf(os.Stderr, "init logger: %v\n", err)
		os.Exit(1)
	}
	defer logger.Sync()

	db, err := database.Open(cfg.MySQL, cfg.Log.SlowSQLMs, config.IsDevMode(cfg.Server.Mode))
	if err != nil {
		logs.Error.Fatal("mysql", zap.Error(err))
	}
	if cfg.Migrate.Enabled {
		dev := migrate.IsDevMode(cfg.Server.Mode)
		if dev && !migrate.AllowDevReset() {
			logs.Error.Fatal("dev reset blocked", zap.String("hint", "debug/dev 会 DROP 业务表，须设置 GBNT_ALLOW_DEV_RESET=1"))
		}
		if err := migrate.Auto(db, migrate.Options{Seed: cfg.Migrate.Seed, Dev: dev}); err != nil {
			logs.Error.Fatal("migrate", zap.Error(err))
		}
		logs.Info.Info("migrate ok",
			zap.Bool("dev_reset", dev),
			zap.Bool("seed", cfg.Migrate.Seed || dev),
		)
	} else {
		// 关闭 AutoMigrate 时仍同步 sys_apis，否则新路由不在目录里，RBAC 对所有人 403。
		if err := migrate.SyncSysAPIs(db); err != nil {
			logs.Error.Fatal("sync sys_apis", zap.Error(err))
		}
		logs.Info.Info("migrate skipped", zap.String("reason", "migrate.enabled=false"), zap.String("sys_apis", "synced"))
	}
	// 编号比较键及约束未完成迁移时禁止启动写入服务。
	//if report, err := migrate.AuditFacilityCodes(context.Background(), db); err != nil || !report.Ready {
	//	logs.Error.Fatal("facility code migration required", zap.Error(migrate.ErrFacilityCodeSchema))
	//}
	jm := jwtutil.New(cfg.JWT.Secret, cfg.JWT.ExpireHours, cfg.JWT.RenewBeforeHours)
	memCache := cachex.New(5*time.Minute, 10*time.Minute)
	denyList := &jwtutil.DenyList{Store: memCache}
	authSvc := &service.AuthService{DB: db, JWT: jm, Deny: denyList, Cache: memCache}
	attachSvc := &service.AttachService{
		DB:  db,
		Cfg: cfg.Upload,
		WM:  watermark.NewRenderer(cfg.Upload.Font),
	}
	captchaSvc := &service.CaptchaService{Store: memCache, Cfg: cfg.Captcha}
	permSvc := perm.NewService(db, memCache)
	if err := permSvc.ReloadAPIIndex(); err != nil {
		logs.Error.Fatal("perm index", zap.Error(err))
	}
	sysSvc := &service.SysService{DB: db, Perm: permSvc, Cache: memCache}
	deps := &handler.Deps{
		DB:      db,
		JWT:     jm,
		Cfg:     cfg,
		Auth:    authSvc,
		Captcha: captchaSvc,
		Sys:     sysSvc,
		Issue:   &service.IssueService{DB: db, Attach: attachSvc, Cache: memCache},
		Attach:  attachSvc,
		OpLog:   &service.OpLogService{DB: db},
		Perm:    permSvc,
	}

	gin.SetMode(cfg.Server.Mode)
	if strings.EqualFold(strings.TrimSpace(cfg.Server.Mode), "release") {
		gin.DefaultWriter = io.Discard
		gin.DefaultErrorWriter = io.Discard
	}
	r := gin.New()
	r.Use(middleware.Recovery())
	r.Use(middleware.CORS(middleware.CORSOptions{
		Enabled:          cfg.CORS.Enabled,
		AllowOrigins:     cfg.CORS.AllowOrigins,
		AllowCredentials: cfg.CORS.AllowCredentials,
		MaxAge:           cfg.CORS.MaxAge,
	}))
	r.Use(middleware.TraceAndTiming())
	r.Use(func(c *gin.Context) {
		c.Request = c.Request.WithContext(service.WithOrgLookup(c.Request.Context(), memCache))
		c.Next()
	})
	r.Use(middleware.AccessLog())
	uploadRoot := cfg.Upload.Root
	if !filepath.IsAbs(uploadRoot) {
		if wd, err := os.Getwd(); err == nil {
			uploadRoot = filepath.Join(wd, uploadRoot)
		}
	}
	r.Static("/uploads", uploadRoot)
	r.Use(middleware.JWTAuth(jm, authSvc.LoadActiveUserInfo, denyList, permSvc))
	r.Use(middleware.ForbidAppSuperAdmin())
	r.Use(middleware.RBAC(permSvc, cfg.RBAC.Enabled))
	handler.Register(r, deps)
	// 未匹配 API 同样经过 JWT/RBAC，再由统一处理器保留 Trace ID 并返回标准 404。
	r.NoRoute(handler.APINotFound)
	middleware.OnBeforeAccess(deps.MarkOpFromCatalog)
	middleware.OnAfterAccess(deps.PersistOp)

	logs.Info.Info("server listen", zap.String("addr", cfg.Server.Addr))
	if err := serveHTTP(r, cfg.Server.Addr, db, logs); err != nil {
		logs.Error.Fatal("run", zap.Error(err))
	}
}

func serveHTTP(engine http.Handler, addr string, db *gorm.DB, logs *logger.Loggers) error {
	srv := &http.Server{Addr: addr, Handler: engine}
	errCh := make(chan error, 1)
	go func() {
		errCh <- srv.ListenAndServe()
	}()
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	select {
	case err := <-errCh:
		if err != nil && err != http.ErrServerClosed {
			return err
		}
		return nil
	case <-stop:
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		if err := srv.Shutdown(ctx); err != nil && logs != nil && logs.Error != nil {
			logs.Error.Error("shutdown", zap.Error(err))
		}
		if db != nil {
			if sqlDB, err := db.DB(); err == nil {
				_ = sqlDB.Close()
			}
		}
		return nil
	}
}
