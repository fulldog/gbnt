// Package logger 提供 info/access/error/slow/sql 五类 Zap 日志，按日期目录 + 大小切割。
package logger

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"gopkg.in/natefinch/lumberjack.v2"

	"gbnt/backend/internal/config"
)

// Loggers 五类日志句柄。
type Loggers struct {
	Info   *zap.Logger
	Access *zap.Logger
	Error  *zap.Logger
	Slow   *zap.Logger
	SQL    *zap.Logger
}

var global *Loggers

// Init 初始化全局日志；文件名含日期，单文件超过 MaxSizeMB 自动滚动。
func Init(cfg config.LogConfig) (*Loggers, error) {
	types := []string{"info", "access", "error", "slow", "sql"}
	for _, t := range types {
		dir := filepath.Join(cfg.Dir, t)
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, err
		}
	}

	level := zapcore.InfoLevel
	_ = level.UnmarshalText([]byte(cfg.Level))

	date := time.Now().Format("2006-01-02")
	l := &Loggers{
		Info:   newLogger(cfg, "info", date, level),
		Access: newLogger(cfg, "access", date, level),
		Error:  newLogger(cfg, "error", date, zapcore.ErrorLevel),
		Slow:   newLogger(cfg, "slow", date, level),
		SQL:    newLogger(cfg, "sql", date, level),
	}
	global = l
	return l, nil
}

func newLogger(cfg config.LogConfig, typ, date string, level zapcore.Level) *zap.Logger {
	filename := filepath.Join(cfg.Dir, typ, fmt.Sprintf("%s-%s.log", typ, date))
	w := zapcore.AddSync(&lumberjack.Logger{
		Filename:   filename,
		MaxSize:    cfg.MaxSizeMB, // >100MB 切割
		MaxBackups: cfg.MaxBackups,
		MaxAge:     cfg.MaxAgeDays,
		Compress:   false,
		LocalTime:  true,
	})

	encCfg := zap.NewProductionEncoderConfig()
	encCfg.TimeKey = "time"
	encCfg.EncodeTime = zapcore.ISO8601TimeEncoder
	core := zapcore.NewCore(zapcore.NewJSONEncoder(encCfg), w, level)

	// 同时输出到控制台，便于本地调试
	console := zapcore.NewCore(
		zapcore.NewConsoleEncoder(encCfg),
		zapcore.AddSync(os.Stdout),
		level,
	)
	return zap.New(zapcore.NewTee(core, console), zap.AddCaller())
}

// L 返回全局日志集合。
func L() *Loggers {
	return global
}

// Sync 刷盘。
func Sync() {
	if global == nil {
		return
	}
	_ = global.Info.Sync()
	_ = global.Access.Sync()
	_ = global.Error.Sync()
	_ = global.Slow.Sync()
	_ = global.SQL.Sync()
}
