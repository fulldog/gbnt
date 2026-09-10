// migrate-facility-codes 默认只读审计；显式指定目标库、暂停写入及备份后才允许安装设施编号约束。
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"time"

	"gbnt/apps/server/internal/config"
	"gbnt/apps/server/internal/migrate"
	driver "github.com/go-sql-driver/mysql"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func run(args []string, output, errorOutput io.Writer) int {
	flags := flag.NewFlagSet("migrate-facility-codes", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	configPath := os.Getenv("GBNT_CONFIG")
	if configPath == "" {
		configPath = "configs/config.yaml"
	}
	var apply, backup, paused bool
	var databaseName string
	var timeout time.Duration
	flags.StringVar(&configPath, "config", configPath, "配置路径")
	flags.BoolVar(&apply, "apply", false, "增量安装约束；默认只读")
	flags.BoolVar(&backup, "backup-confirmed", false, "已确认备份")
	flags.BoolVar(&paused, "writes-paused", false, "已暂停全部业务写入")
	flags.StringVar(&databaseName, "database", "", "执行时必须指定准确库名")
	flags.DurationVar(&timeout, "timeout", time.Minute, "检查或迁移超时")
	if err := flags.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			fmt.Fprintln(output, "默认只读审计：--config 配置路径；执行迁移须同时提供 --apply --database 准确库名 --backup-confirmed --writes-paused。历史重复必须先人工核对，本工具不修改原 code。")
			return 0
		}
		fmt.Fprintln(errorOutput, "参数无效，请使用 --help")
		return 2
	}
	if flags.NArg() > 0 || timeout < time.Second || timeout > 15*time.Minute || configPath == "" || (apply && (databaseName == "" || !backup || !paused)) || (!apply && (databaseName != "" || backup || paused)) {
		fmt.Fprintln(errorOutput, "执行条件不完整，请使用 --help；未连接数据库")
		return 2
	}
	cfg, err := config.Load(configPath)
	if err != nil {
		fmt.Fprintln(errorOutput, "读取数据库配置失败")
		return 1
	}
	dsn, err := driver.ParseDSN(cfg.MySQL.DSN)
	if err != nil || dsn.DBName == "" || (apply && databaseName != dsn.DBName) {
		fmt.Fprintln(errorOutput, "数据库目标不匹配或配置无效")
		return 1
	}
	dsn.Timeout, dsn.ReadTimeout, dsn.WriteTimeout = min(timeout, 10*time.Second), timeout, timeout
	dsn.MultiStatements = false
	dsn.Logger = &driver.NopLogger{}
	db, err := gorm.Open(mysql.Open(dsn.FormatDSN()), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		fmt.Fprintln(errorOutput, "连接数据库失败")
		return 1
	}
	sqlDB, err := db.DB()
	if err != nil {
		fmt.Fprintln(errorOutput, "获取连接失败")
		return 1
	}
	defer sqlDB.Close()
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	var report migrate.FacilityCodeReport
	if apply {
		report, err = migrate.ApplyFacilityCodes(ctx, db, databaseName)
	} else {
		report, err = migrate.AuditFacilityCodes(ctx, db)
	}
	if err != nil {
		report.Ready = false
	}
	if encodeErr := json.NewEncoder(output).Encode(report); encodeErr != nil {
		return 1
	}
	if err != nil {
		message := "检查或迁移未完成，请重跑只读审计；不回显数据库原始错误"
		if errors.Is(err, migrate.ErrFacilityCodeHistory) {
			message = migrate.ErrFacilityCodeHistory.Error()
		}
		fmt.Fprintln(errorOutput, message)
		return 1
	}
	if !report.Ready {
		fmt.Fprintln(errorOutput, "审计无历史冲突，约束尚未就绪；未自动执行修改")
		return 1
	}
	return 0
}

func main() { os.Exit(run(os.Args[1:], os.Stdout, os.Stderr)) }
