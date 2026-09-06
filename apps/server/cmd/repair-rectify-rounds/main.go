// repair-rectify-rounds 仅检查或增量补齐整改轮次字段，不启动 HTTP 服务、不同步权限目录。
package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"flag"
	"io"
	"os"
	"strings"
	"time"

	"gbnt/apps/server/internal/config"
	"gbnt/apps/server/internal/migrate"
	"github.com/go-sql-driver/mysql"
)

const commandUsage = `用法：repair-rectify-rounds [--config 配置路径] [--timeout 60s]
默认仅检查两个整改轮次字段；缺列时输出计划并以非零状态退出。
执行补列必须同时提供：--apply --database 准确库名 --backup-confirmed
执行前必须备份并暂停所有业务写入；命名锁仅防止本工具并发，不阻止业务更新。
只补缺列，不启动业务服务、不调用全量迁移或权限目录同步。
`

type commandOptions struct {
	configPath      string        // 配置路径，默认 GBNT_CONFIG 或后端工作目录下 configs/config.yaml
	apply           bool          // 默认 false；只有显式开启才允许增量补列
	database        string        // 执行时必填，与 DSN 库名及服务端实际库名一致
	backupConfirmed bool          // 执行者已确认备份，未确认不得连接后执行修改
	timeout         time.Duration // 全部检查/迁移的超时，默认 60 秒
}

type commandDependencies struct {
	loadConfig func(string) (*config.Config, error)                                       // 保留应用原配置及环境覆盖语义
	openDB     func(*mysql.Config) (*sql.DB, error)                                       // 可注入的连接创建入口，单测不连接真实数据库
	check      func(context.Context, *sql.DB) (migrate.RectifyRoundReport, error)         // 默认只读检查
	repair     func(context.Context, *sql.DB, string) (migrate.RectifyRoundReport, error) // 有保护参数才执行
}

// commandError 是命令行安全错误信息，不含原始 DSN、SQL、配置内容或驱动错误文本。
type commandError struct {
	Error     string `json:"error"`                // 面向执行者的脱敏错误分类
	MySQLCode uint16 `json:"mysql_code,omitempty"` // MySQL 数字错误码，不包含原始错误正文
}

func parseCommandOptions(args []string, defaultConfig string) (commandOptions, bool, error) {
	options := commandOptions{}
	flags := flag.NewFlagSet("repair-rectify-rounds", flag.ContinueOnError)
	// flag 包错误可能回显用户参数，统一屏蔽，避免误传凭据时泄漏。
	flags.SetOutput(io.Discard)
	flags.StringVar(&options.configPath, "config", defaultConfig, "配置路径")
	flags.BoolVar(&options.apply, "apply", false, "执行补列")
	flags.StringVar(&options.database, "database", "", "准确数据库名")
	flags.BoolVar(&options.backupConfirmed, "backup-confirmed", false, "确认已有备份")
	flags.DurationVar(&options.timeout, "timeout", 60*time.Second, "总超时")
	if err := flags.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return options, true, nil
		}
		return options, false, errors.New("命令参数无效，请使用 --help 查看用法")
	}
	if flags.NArg() != 0 {
		return options, false, errors.New("不接受位置参数，请使用 --help 查看用法")
	}
	if strings.TrimSpace(options.configPath) == "" {
		return options, false, errors.New("必须指定有效配置路径")
	}
	if options.timeout < time.Second || options.timeout > 15*time.Minute {
		return options, false, errors.New("--timeout 必须在 1s 至 15m 之间")
	}
	if options.apply {
		if strings.TrimSpace(options.database) == "" || !options.backupConfirmed {
			return options, false, errors.New("执行补列必须同时指定 --apply、--database 和 --backup-confirmed")
		}
	} else if options.database != "" || options.backupConfirmed {
		return options, false, errors.New("--database 和 --backup-confirmed 只能与 --apply 一起使用")
	}
	return options, false, nil
}

func realCommandDependencies() commandDependencies {
	return commandDependencies{
		loadConfig: config.Load,
		openDB: func(configuration *mysql.Config) (*sql.DB, error) {
			connector, err := mysql.NewConnector(configuration)
			if err != nil {
				return nil, err
			}
			db := sql.OpenDB(connector)
			db.SetMaxOpenConns(1)
			db.SetMaxIdleConns(1)
			db.SetConnMaxLifetime(5 * time.Minute)
			return db, nil
		},
		check:  migrate.CheckRectifyRounds,
		repair: migrate.RepairRectifyRounds,
	}
}

func writeCommandError(output io.Writer, message string, cause error) {
	entry := commandError{Error: message}
	var safetyError *migrate.RectifyRoundSafetyError
	if errors.As(cause, &safetyError) {
		entry.Error = safetyError.Reason
	}
	if errors.Is(cause, context.DeadlineExceeded) {
		entry.Error = "数据库检查或迁移超时；请重新只读检查当前字段状态，不要假定已自动回滚"
	} else if errors.Is(cause, context.Canceled) {
		entry.Error = "操作已取消；请重新只读检查当前字段状态"
	}
	var mysqlError *mysql.MySQLError
	if errors.As(cause, &mysqlError) {
		entry.MySQLCode = mysqlError.Number
	}
	_ = json.NewEncoder(output).Encode(entry)
}

func runCommand(args []string, stdout, stderr io.Writer, dependencies commandDependencies) int {
	defaultConfig := os.Getenv("GBNT_CONFIG")
	if defaultConfig == "" {
		defaultConfig = "configs/config.yaml"
	}
	options, help, err := parseCommandOptions(args, defaultConfig)
	if err != nil {
		writeCommandError(stderr, err.Error(), nil)
		return 2
	}
	if help {
		_, _ = io.WriteString(stdout, commandUsage)
		return 0
	}
	configuration, err := dependencies.loadConfig(options.configPath)
	if err != nil || configuration == nil {
		writeCommandError(stderr, "读取配置失败，请检查配置路径、格式及环境变量；为保护凭据不回显原始错误", nil)
		return 1
	}
	mysqlConfig, err := mysql.ParseDSN(configuration.MySQL.DSN)
	if err != nil || mysqlConfig == nil || strings.TrimSpace(mysqlConfig.DBName) == "" {
		writeCommandError(stderr, "数据库连接配置无效，DSN 必须包含明确的数据库名", nil)
		return 1
	}
	// 在建连接之前就核对执行目标，迁移函数还会再次核对 SELECT DATABASE()。
	if options.apply && options.database != mysqlConfig.DBName {
		writeCommandError(stderr, "--database 与配置中的数据库名不一致，未建立连接或执行修改", nil)
		return 2
	}
	// 不复用主服务入口；即使 YAML 开启 AutoMigrate 或 debug，也不会触发清表及种子逻辑。
	mysqlConfig.Timeout = min(10*time.Second, options.timeout)
	mysqlConfig.ReadTimeout = options.timeout
	mysqlConfig.WriteTimeout = options.timeout
	mysqlConfig.MultiStatements = false
	// 驱动内部日志可能带连接信息；本命令仅输出上面的统一脱敏错误分类。
	mysqlConfig.Logger = &mysql.NopLogger{}
	db, err := dependencies.openDB(mysqlConfig)
	if err != nil || db == nil {
		writeCommandError(stderr, "无法创建数据库连接，请检查网络、TLS 与账号配置", err)
		return 1
	}
	defer db.Close()
	ctx, cancel := context.WithTimeout(context.Background(), options.timeout)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		writeCommandError(stderr, "数据库连接失败，请检查网络、白名单及账号授权", err)
		return 1
	}
	var report migrate.RectifyRoundReport
	if options.apply {
		report, err = dependencies.repair(ctx, db, options.database)
	} else {
		report, err = dependencies.check(ctx, db)
	}
	// 错误也输出已有检查与执行进度，便于识别部分成功；不把失败伪装成 verified。
	if err != nil {
		report.Verified = false
	}
	if encodeErr := json.NewEncoder(stdout).Encode(report); encodeErr != nil {
		writeCommandError(stderr, "写入检查报告失败，请重新只读核验数据库状态", nil)
		return 1
	}
	if err != nil {
		writeCommandError(stderr, "整改轮次检查或迁移失败，请核对报告及数据库结构后处理", err)
		return 1
	}
	if !report.Verified {
		writeCommandError(stderr, "整改轮次字段尚未通过核验；如报告有补列计划，请先确认备份和目标库，并在维护窗口暂停所有业务写入", nil)
		return 2
	}
	return 0
}

func main() {
	// 状态 0 表示核验通过；1 表示配置/连接/执行失败；2 表示参数无效或仍有待处理结构。
	os.Exit(runCommand(os.Args[1:], os.Stdout, os.Stderr, realCommandDependencies()))
}
