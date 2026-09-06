package main

import (
	"bytes"
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"gbnt/apps/server/internal/config"
	"gbnt/apps/server/internal/migrate"
	"github.com/go-sql-driver/mysql"
)

type testConnector struct{ pingErr error }
type testDriver struct{}
type testConnection struct{ pingErr error }

func (c testConnector) Connect(context.Context) (driver.Conn, error) {
	return testConnection{pingErr: c.pingErr}, nil
}
func (testConnector) Driver() driver.Driver { return testDriver{} }
func (testDriver) Open(string) (driver.Conn, error) {
	return nil, errors.New("测试不允许连接真实数据库")
}
func (testConnection) Prepare(string) (driver.Stmt, error) {
	return nil, errors.New("测试不执行 SQL")
}
func (testConnection) Close() error                 { return nil }
func (testConnection) Begin() (driver.Tx, error)    { return nil, errors.New("测试不执行事务") }
func (c testConnection) Ping(context.Context) error { return c.pingErr }

type commandFixture struct {
	dependencies     commandDependencies
	configCalls      int
	openCalls        int
	checkCalls       int
	repairCalls      int
	loadedPath       string
	connectionConfig *mysql.Config
	repairDatabase   string
	checkReport      migrate.RectifyRoundReport
	repairReport     migrate.RectifyRoundReport
	checkError       error
	repairError      error
	pingError        error
}

func newCommandFixture(t *testing.T) *commandFixture {
	t.Helper()
	t.Setenv("GBNT_CONFIG", "")
	f := &commandFixture{
		checkReport:  migrate.RectifyRoundReport{Database: "ledger_test", Verified: true},
		repairReport: migrate.RectifyRoundReport{Database: "ledger_test", Verified: true},
	}
	f.dependencies = commandDependencies{
		loadConfig: func(path string) (*config.Config, error) {
			f.configCalls++
			f.loadedPath = path
			return &config.Config{Server: config.ServerConfig{Mode: "debug"}, Migrate: config.MigrateConfig{Enabled: true, Seed: true}, MySQL: config.MySQLConfig{DSN: "test_user:private-test-secret@tcp(local.invalid:3306)/ledger_test?multiStatements=true"}}, nil
		},
		openDB: func(configuration *mysql.Config) (*sql.DB, error) {
			f.openCalls++
			f.connectionConfig = configuration
			return sql.OpenDB(testConnector{pingErr: f.pingError}), nil
		},
		check: func(ctx context.Context, _ *sql.DB) (migrate.RectifyRoundReport, error) {
			f.checkCalls++
			if _, ok := ctx.Deadline(); !ok {
				t.Error("检查必须有总超时")
			}
			return f.checkReport, f.checkError
		},
		repair: func(ctx context.Context, _ *sql.DB, database string) (migrate.RectifyRoundReport, error) {
			f.repairCalls++
			f.repairDatabase = database
			if _, ok := ctx.Deadline(); !ok {
				t.Error("修复必须有总超时")
			}
			return f.repairReport, f.repairError
		},
	}
	return f
}

func runFixture(f *commandFixture, args ...string) (int, string, string) {
	var out, errOut bytes.Buffer
	code := runCommand(args, &out, &errOut, f.dependencies)
	return code, out.String(), errOut.String()
}

func TestCommandDefaultsToReadOnlyEvenIfApplicationEnablesDevMigration(t *testing.T) {
	f := newCommandFixture(t)
	code, out, errOut := runFixture(f)
	if code != 0 || errOut != "" || f.checkCalls != 1 || f.repairCalls != 0 || f.openCalls != 1 || f.loadedPath != "configs/config.yaml" {
		t.Fatalf("默认检查流程错误：code=%d checks=%d repairs=%d stderr=%s", code, f.checkCalls, f.repairCalls, errOut)
	}
	var report migrate.RectifyRoundReport
	if err := json.Unmarshal([]byte(out), &report); err != nil || !report.Verified {
		t.Fatalf("JSON 报告错误：%s", out)
	}
	if f.connectionConfig.MultiStatements || f.connectionConfig.Timeout != 10*time.Second || f.connectionConfig.ReadTimeout != 60*time.Second || f.connectionConfig.WriteTimeout != 60*time.Second {
		t.Fatal("连接超时或多语句保护不正确")
	}
	if _, ok := f.connectionConfig.Logger.(*mysql.NopLogger); !ok {
		t.Fatal("驱动原始日志必须关闭，避免绕过脱敏错误输出")
	}
	if strings.Contains(out+errOut, "private-test-secret") {
		t.Fatal("报告泄漏密码")
	}
}

func TestCommandRejectsUnsafeArgumentsBeforeConfigOrConnection(t *testing.T) {
	for _, args := range [][]string{
		{"--apply"}, {"--apply", "--database", "ledger_test"}, {"--apply", "--backup-confirmed"},
		{"--apply", "--database", "ledger_test", "--backup-confirmed=false"},
		{"--database", "ledger_test"}, {"--backup-confirmed"}, {"--unknown=private-test-secret"}, {"private-test-secret"},
		{"--timeout", "0s"}, {"--timeout", "16m"}, {"--timeout", "private-test-secret"}, {"--config", ""},
	} {
		t.Run(strings.Join(args, " "), func(t *testing.T) {
			f := newCommandFixture(t)
			code, out, errOut := runFixture(f, args...)
			if code != 2 || f.configCalls != 0 || f.openCalls != 0 || f.checkCalls != 0 || f.repairCalls != 0 {
				t.Fatalf("非法参数发生读取/连接：%d %+v", code, f)
			}
			if strings.Contains(out+errOut, "private-test-secret") {
				t.Fatal("非法参数被回显")
			}
		})
	}
}

func TestCommandApplyRequiresExactConfiguredDatabase(t *testing.T) {
	f := newCommandFixture(t)
	code, _, _ := runFixture(f, "--apply", "--database", "other_database", "--backup-confirmed")
	if code != 2 || f.configCalls != 1 || f.openCalls != 0 || f.repairCalls != 0 {
		t.Fatal("目标库不一致时不得连接")
	}
	f = newCommandFixture(t)
	code, out, errOut := runFixture(f, "--apply", "--database", "ledger_test", "--backup-confirmed", "--timeout", "120s")
	if code != 0 || f.repairCalls != 1 || f.checkCalls != 0 || f.repairDatabase != "ledger_test" || errOut != "" {
		t.Fatalf("受控修复流程：%d %s %s", code, out, errOut)
	}
	if f.connectionConfig.ReadTimeout != 120*time.Second {
		t.Fatal("超时参数未应用")
	}
}

func TestCommandMissingColumnsOutputPlanAndExitNonzero(t *testing.T) {
	f := newCommandFixture(t)
	f.checkReport = migrate.RectifyRoundReport{Database: "ledger_test", PendingSQL: []string{"ALTER TABLE `issues` ADD COLUMN `rectify_round` BIGINT UNSIGNED NOT NULL DEFAULT 0"}, Verified: false}
	code, out, errOut := runFixture(f)
	if code != 2 || f.repairCalls != 0 || !strings.Contains(out, "pending_sql") || !strings.Contains(out, "ALTER TABLE") || !strings.Contains(out, `"verified":false`) || errOut == "" {
		t.Fatalf("缺列不能报告成功或直接迁移：%d %s %s", code, out, errOut)
	}
}

func TestCommandFailuresNeverPrintSecrets(t *testing.T) {
	secret := "private-test-secret"
	for _, stage := range []string{"配置", "DSN", "无库名", "建连接", "Ping", "检查", "修复"} {
		t.Run(stage, func(t *testing.T) {
			f := newCommandFixture(t)
			args := []string{}
			leaky := errors.New("test_user:" + secret + "@tcp(private.invalid)/ledger_test")
			switch stage {
			case "配置":
				f.dependencies.loadConfig = func(string) (*config.Config, error) { return nil, leaky }
			case "DSN":
				f.dependencies.loadConfig = func(string) (*config.Config, error) {
					return &config.Config{MySQL: config.MySQLConfig{DSN: secret}}, nil
				}
			case "无库名":
				f.dependencies.loadConfig = func(string) (*config.Config, error) {
					return &config.Config{MySQL: config.MySQLConfig{DSN: "test_user:" + secret + "@tcp(local.invalid)/"}}, nil
				}
			case "建连接":
				f.dependencies.openDB = func(*mysql.Config) (*sql.DB, error) { return nil, leaky }
			case "Ping":
				f.pingError = &mysql.MySQLError{Number: 1045, Message: secret}
			case "检查":
				f.checkError = &mysql.MySQLError{Number: 1054, Message: secret}
			case "修复":
				f.repairError = leaky
				args = []string{"--apply", "--database", "ledger_test", "--backup-confirmed"}
			}
			code, out, errOut := runFixture(f, args...)
			if code != 1 || strings.Contains(out+errOut, secret) || strings.Contains(out+errOut, "test_user") {
				t.Fatalf("错误信息未脱敏或状态错误：%d %s %s", code, out, errOut)
			}
			if stage == "Ping" && !strings.Contains(errOut, `"mysql_code":1045`) {
				t.Fatal("认证错误需保留数字错误码")
			}
			if stage == "检查" && !strings.Contains(errOut, `"mysql_code":1054`) {
				t.Fatal("SQL 错误需保留数字错误码")
			}
			if stage == "检查" || stage == "修复" {
				if !strings.Contains(out, `"verified":false`) {
					t.Fatal("失败报告不能保留成功状态")
				}
			}
		})
	}
}

func TestCommandConfigPathAndDSNEnvironmentOverrides(t *testing.T) {
	f := newCommandFixture(t)
	path := filepath.Join(t.TempDir(), "connection.yaml")
	// 仅创建测试临时文件；不读取或改动仓库 configs 中的真实凭据。
	if err := os.WriteFile(path, []byte("server:\n  mode: release\nmysql:\n  dsn: 'test_user:file-secret@tcp(file.invalid:3306)/from_file'\nmigrate:\n  enabled: true\n  seed: true\n"), 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("GBNT_CONFIG", path)
	t.Setenv("GBNT_MYSQL_DSN", "env_user:env-test-secret@tcp(env.invalid:3307)/from_env?parseTime=true")
	f.dependencies.loadConfig = config.Load
	f.checkReport.Database = "from_env"
	code, out, errOut := runFixture(f)
	if code != 0 || f.connectionConfig.DBName != "from_env" || f.connectionConfig.Passwd != "env-test-secret" || f.connectionConfig.User != "env_user" {
		t.Fatalf("环境覆盖未保留，状态=%d", code)
	}
	if strings.Contains(out+errOut, "env-test-secret") || strings.Contains(out+errOut, "file-secret") {
		t.Fatal("环境凭据被回显")
	}
	f = newCommandFixture(t)
	t.Setenv("GBNT_CONFIG", "from-environment.yaml")
	code, _, _ = runFixture(f, "--config", "from-flag.yaml")
	if code != 0 || f.loadedPath != "from-flag.yaml" {
		t.Fatal("显式配置路径优先于 GBNT_CONFIG")
	}
}

func TestCommandHelpAndSafeSafetyError(t *testing.T) {
	f := newCommandFixture(t)
	code, out, errOut := runFixture(f, "--help")
	if code != 0 || !strings.Contains(out, "默认仅检查") || !strings.Contains(out, "暂停所有业务写入") || errOut != "" || f.configCalls != 0 || f.openCalls != 0 {
		t.Fatal("帮助不应读取配置或建连接")
	}
	f.checkError = &migrate.RectifyRoundSafetyError{Reason: "检测到部分迁移且已有非零轮次，请核对历史归属"}
	code, _, errOut = runFixture(f)
	if code != 1 || !strings.Contains(errOut, "已有非零轮次") {
		t.Fatal("应保留固定安全运维原因")
	}
	f.checkError = context.DeadlineExceeded
	code, _, errOut = runFixture(f)
	if code != 1 || !strings.Contains(errOut, "不要假定已自动回滚") {
		t.Fatal("超时需提示复核部分执行状态")
	}
}

type failWriter struct{}

func (failWriter) Write([]byte) (int, error) { return 0, io.ErrClosedPipe }

func TestCommandOutputFailureCannotReportSuccess(t *testing.T) {
	f := newCommandFixture(t)
	var errOut bytes.Buffer
	if code := runCommand(nil, failWriter{}, &errOut, f.dependencies); code != 1 || !strings.Contains(errOut.String(), "写入检查报告失败") {
		t.Fatal("报告写出失败必须非零退出")
	}
}
