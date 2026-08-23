// 高标农田专项整治后台入口。
package main

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"gbnt/backend/internal/config"
	"gbnt/backend/internal/database"
	"gbnt/backend/internal/handler"
	"gbnt/backend/internal/logger"
	"gbnt/backend/internal/migrate"
	"gbnt/backend/internal/service"
	"gbnt/backend/pkg/jwtutil"
	"gbnt/backend/pkg/middleware"
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
	if err := migrate.Auto(db); err != nil {
		logs.Error.Fatal("migrate", zap.Error(err))
	}
	logs.Info.Info("migrate ok")

	jm := jwtutil.New(cfg.JWT.Secret, cfg.JWT.ExpireHours)
	deps := &handler.Deps{
		DB:     db,
		JWT:    jm,
		Cfg:    cfg,
		Auth:   &service.AuthService{DB: db, JWT: jm},
		Sys:    &service.SysService{DB: db},
		Issue:  &service.IssueService{DB: db},
		Attach: &service.AttachService{DB: db, Cfg: cfg.Upload},
		OpLog:  &service.OpLogService{DB: db},
	}

	gin.SetMode(cfg.Server.Mode)
	r := gin.New()
	r.Use(middleware.Recovery())
	r.Use(middleware.TraceAndTiming())
	r.Use(middleware.AccessLog())
	r.Use(middleware.JWTAuth(jm, []string{
		"/api/health",
		"/api/auth/login",
	}))
	handler.Register(r, deps)

	logs.Info.Info("server listen", zap.String("addr", cfg.Server.Addr))
	if err := r.Run(cfg.Server.Addr); err != nil {
		logs.Error.Fatal("run", zap.Error(err))
	}
}
