// Package database MySQL 连接与 GORM SQL 日志桥接。
package database

import (
	"context"
	"errors"
	"time"

	"go.uber.org/zap"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"

	"gbnt/apps/server/internal/config"
	"gbnt/apps/server/internal/logger"
)

type ctxKey string

const TraceKey ctxKey = "trace_id"

// Open 打开 MySQL 并挂载 SQL 日志。
func Open(cfg config.MySQLConfig, slowMs int) (*gorm.DB, error) {
	db, err := gorm.Open(mysql.Open(cfg.DSN), &gorm.Config{
		Logger: newGormLogger(slowMs),
	})
	if err != nil {
		return nil, err
	}
	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}
	if cfg.MaxIdle > 0 {
		sqlDB.SetMaxIdleConns(cfg.MaxIdle)
	}
	if cfg.MaxOpen > 0 {
		sqlDB.SetMaxOpenConns(cfg.MaxOpen)
	}
	RegisterAuditCallbacks(db)
	return db, nil
}

// WithTrace 将 trace_id 放入 context，供 SQL 日志关联。
func WithTrace(ctx context.Context, traceID string) context.Context {
	return context.WithValue(ctx, TraceKey, traceID)
}

type gormLog struct {
	slow time.Duration
}

func newGormLogger(slowMs int) gormlogger.Interface {
	if slowMs <= 0 {
		slowMs = 200
	}
	return &gormLog{slow: time.Duration(slowMs) * time.Millisecond}
}

func (l *gormLog) LogMode(gormlogger.LogLevel) gormlogger.Interface { return l }
func (l *gormLog) Info(ctx context.Context, s string, args ...interface{}) {
	if logger.L() != nil {
		logger.L().SQL.Sugar().Infof(s, args...)
	}
}
func (l *gormLog) Warn(ctx context.Context, s string, args ...interface{}) {
	if logger.L() != nil {
		logger.L().SQL.Sugar().Warnf(s, args...)
	}
}
func (l *gormLog) Error(ctx context.Context, s string, args ...interface{}) {
	if logger.L() != nil {
		logger.L().Error.Sugar().Errorf(s, args...)
	}
}

// Trace 记录每条 SQL；超时写入 slow。
func (l *gormLog) Trace(ctx context.Context, begin time.Time, fc func() (string, int64), err error) {
	elapsed := time.Since(begin)
	sql, rows := fc()
	tid, _ := ctx.Value(TraceKey).(string)
	if tid == "" {
		if v := ctx.Value("trace_id"); v != nil {
			tid, _ = v.(string)
		}
	}

	fields := []zap.Field{
		zap.String("trace_id", tid),
		zap.Duration("elapsed", elapsed),
		zap.Int64("elapsed_ms", elapsed.Milliseconds()),
		zap.Int64("rows", rows),
		zap.String("sql", sql),
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		fields = append(fields, zap.Error(err))
		if logger.L() != nil {
			logger.L().SQL.Error("sql_error", fields...)
			logger.L().Error.Error("sql_error", fields...)
		}
		return
	}
	if logger.L() != nil {
		logger.L().SQL.Info("sql", fields...)
		if elapsed >= l.slow {
			logger.L().Slow.Warn("slow_sql", fields...)
		}
	}
}
