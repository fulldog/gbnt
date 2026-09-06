package migrate

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"reflect"
	"strings"
	"sync"
	"testing"

	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/testutil"
	"gorm.io/driver/mysql"
	"gorm.io/gorm/schema"
)

func roundTestDB(t *testing.T, steps ...testutil.QueryStep) *sql.DB {
	t.Helper()
	db, err := testutil.NewTransactionDB(t, steps...).DB()
	if err != nil {
		t.Fatal(err)
	}
	return db
}

func roundNameStep(name driver.Value) testutil.QueryStep {
	return testutil.QueryStep{Contains: "SELECT DATABASE()", Columns: []string{"database"}, Rows: [][]driver.Value{{name}}}
}

func roundColumnRow(index int) []driver.Value {
	target := roundTargets[index]
	return []driver.Value{target.table, target.column, "bigint unsigned", "NO", "0", ""}
}

func roundInspectionSteps(columnRows ...[]driver.Value) []testutil.QueryStep {
	steps := []testutil.QueryStep{}
	for _, target := range roundTargets {
		table := target.table
		steps = append(steps, testutil.QueryStep{Contains: "information_schema.TABLES", Columns: []string{"count"}, Rows: [][]driver.Value{{int64(1)}}, Check: func(query string, args []driver.NamedValue) {
			if len(args) != 1 || args[0].Value != table || !strings.Contains(query, "TABLE_SCHEMA = DATABASE()") || !strings.Contains(query, "'BASE TABLE'") {
				panic("表检查必须限制当前库及固定目标表")
			}
		}})
	}
	steps = append(steps, testutil.QueryStep{Contains: "information_schema.COLUMNS", Columns: []string{"table", "column", "type", "nullable", "default", "extra"}, Rows: columnRows})
	return steps
}

func roundTrendStep() testutil.QueryStep {
	return testutil.QueryStep{Contains: "WHERE 1 = 0", Columns: []string{"id", "completed_at"}, Check: func(query string, _ []driver.NamedValue) {
		if !strings.Contains(query, "r.round = issues.rectify_round") || !strings.Contains(query, "r.is_delete = 0") {
			panic("不得删除当前轮次或软删除条件来掩盖字段缺失")
		}
	}}
}

func roundLockStep(release bool, value driver.Value) testutil.QueryStep {
	query := "SELECT GET_LOCK(?, 0)"
	if release {
		query = "SELECT RELEASE_LOCK(?)"
	}
	return testutil.QueryStep{Contains: query, Columns: []string{"lock"}, Rows: [][]driver.Value{{value}}, Check: func(_ string, args []driver.NamedValue) {
		if len(args) != 1 {
			panic("迁移锁必须参数化")
		}
		name, ok := args[0].Value.(string)
		if !ok || !strings.HasPrefix(name, "gbnt:rectify-rounds:") || len(name) > 64 {
			panic("迁移锁名不合规")
		}
	}}
}

func roundCountSteps(issues, records int64) []testutil.QueryStep {
	return []testutil.QueryStep{
		{Contains: "SELECT COUNT(*) FROM `issues`", Columns: []string{"count"}, Rows: [][]driver.Value{{issues}}},
		{Contains: "SELECT COUNT(*) FROM `issue_rectify_records`", Columns: []string{"count"}, Rows: [][]driver.Value{{records}}},
	}
}

func roundAddStep(index int) testutil.QueryStep {
	return testutil.QueryStep{Kind: "exec", Contains: roundTargets[index].ddl, Check: func(query string, args []driver.NamedValue) {
		if len(args) != 0 || query != roundTargets[index].ddl {
			panic("只允许固定的补列 SQL，不允许修改业务数据或权限目录")
		}
	}}
}

func requireRoundSafety(t *testing.T, err error, text string) {
	t.Helper()
	var safety *RectifyRoundSafetyError
	if !errors.As(err, &safety) || !strings.Contains(safety.Reason, text) {
		t.Fatalf("应返回安全拒绝 %q，实际 %v", text, err)
	}
}

func TestRoundCheckPlansMissingColumnsWithoutWrites(t *testing.T) {
	steps := append([]testutil.QueryStep{roundNameStep("gbnt_test")}, roundInspectionSteps()...)
	report, err := CheckRectifyRounds(context.Background(), roundTestDB(t, steps...))
	if err != nil || report.Verified || len(report.PendingSQL) != 2 || len(report.AppliedSQL) != 0 {
		t.Fatalf("默认检查不得修复：%+v %v", report, err)
	}
	if report.Database != "gbnt_test" || len(report.Columns) != 2 || report.Columns[0].Exists || report.Columns[1].Exists {
		t.Fatalf("缺列报告错误：%+v", report)
	}
}

func TestRoundCheckAcceptsExistingColumnsAndDisplayWidth(t *testing.T) {
	for _, dataType := range []string{"bigint unsigned", "bigint(20) unsigned"} {
		t.Run(dataType, func(t *testing.T) {
			issue, record := roundColumnRow(0), roundColumnRow(1)
			issue[2] = dataType
			steps := append([]testutil.QueryStep{roundNameStep("gbnt_test")}, roundInspectionSteps(issue, record)...)
			steps = append(steps, roundTrendStep())
			report, err := CheckRectifyRounds(context.Background(), roundTestDB(t, steps...))
			if err != nil || !report.Verified || len(report.PendingSQL) != 0 || len(report.AppliedSQL) != 0 {
				t.Fatalf("合规列无需再修改：%+v %v", report, err)
			}
		})
	}
}

func TestRoundCheckRejectsWrongColumnDefinitions(t *testing.T) {
	cases := []struct {
		name  string
		index int
		value driver.Value
	}{
		{"有符号", 2, "bigint"}, {"范围不足", 2, "int unsigned"}, {"允许空", 3, "YES"},
		{"无默认值", 4, nil}, {"错误默认值", 4, "1"}, {"生成列", 5, "STORED GENERATED"}, {"自动递增", 5, "auto_increment"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			row := roundColumnRow(0)
			row[tc.index] = tc.value
			steps := append([]testutil.QueryStep{roundNameStep("gbnt_test")}, roundInspectionSteps(row, roundColumnRow(1))...)
			report, err := CheckRectifyRounds(context.Background(), roundTestDB(t, steps...))
			requireRoundSafety(t, err, "字段定义异常")
			if report.Verified || len(report.AppliedSQL) != 0 {
				t.Fatal("异常定义不得自动覆盖")
			}
		})
	}
}

func TestRoundCheckPartialSchemaProtectsNonzeroHistory(t *testing.T) {
	for _, index := range []int{0, 1} {
		for _, nonzero := range []bool{false, true} {
			t.Run(roundTargets[index].column+map[bool]string{false: "_零", true: "_非零"}[nonzero], func(t *testing.T) {
				steps := append([]testutil.QueryStep{roundNameStep("gbnt_test")}, roundInspectionSteps(roundColumnRow(index))...)
				steps = append(steps, testutil.QueryStep{Contains: "SELECT EXISTS(SELECT 1 FROM `" + roundTargets[index].table + "` WHERE `" + roundTargets[index].column + "` <> 0)", Columns: []string{"exists"}, Rows: [][]driver.Value{{nonzero}}, Check: func(query string, _ []driver.NamedValue) {
					if strings.Contains(query, "is_delete") {
						panic("历史保护必须包含软删除记录")
					}
				}})
				report, err := CheckRectifyRounds(context.Background(), roundTestDB(t, steps...))
				if nonzero {
					requireRoundSafety(t, err, "非零轮次")
				} else if err != nil || len(report.PendingSQL) != 1 {
					t.Fatalf("安全的半迁移状态应支持重跑：%+v %v", report, err)
				}
			})
		}
	}
}

func TestRoundRepairAddsOnlyTwoColumnsAndIsIdempotent(t *testing.T) {
	steps := []testutil.QueryStep{roundNameStep("gbnt_test"), roundLockStep(false, int64(1))}
	steps = append(steps, roundInspectionSteps()...)
	steps = append(steps, roundCountSteps(3, 7)...)
	steps = append(steps, roundAddStep(0), roundAddStep(1))
	steps = append(steps, roundInspectionSteps(roundColumnRow(0), roundColumnRow(1))...)
	steps = append(steps, roundTrendStep())
	steps = append(steps, roundCountSteps(3, 7)...)
	steps = append(steps, roundLockStep(true, int64(1)))
	// 第二次修复只能查结构、校验查询，不得 UPDATE、重复补列或初始化种子。
	steps = append(steps, roundNameStep("gbnt_test"), roundLockStep(false, int64(1)))
	steps = append(steps, roundInspectionSteps(roundColumnRow(0), roundColumnRow(1))...)
	steps = append(steps, roundTrendStep(), roundLockStep(true, int64(1)))
	db := roundTestDB(t, steps...)
	first, err := RepairRectifyRounds(context.Background(), db, "gbnt_test")
	if err != nil || !first.Verified || len(first.AppliedSQL) != 2 || len(first.PendingSQL) != 0 {
		t.Fatalf("首次修复失败：%+v %v", first, err)
	}
	second, err := RepairRectifyRounds(context.Background(), db, "gbnt_test")
	if err != nil || !second.Verified || len(second.AppliedSQL) != 0 {
		t.Fatalf("重复执行不应改动：%+v %v", second, err)
	}
}

func TestRoundRepairResumesPartialDDLWithoutReset(t *testing.T) {
	failure := errors.New("DDL failed")
	steps := []testutil.QueryStep{roundNameStep("gbnt_test"), roundLockStep(false, int64(1))}
	steps = append(steps, roundInspectionSteps()...)
	steps = append(steps, roundCountSteps(3, 7)...)
	failedDDL := roundAddStep(1)
	failedDDL.Err = failure
	steps = append(steps, roundAddStep(0), failedDDL, roundLockStep(true, int64(1)))
	steps = append(steps, roundNameStep("gbnt_test"), roundLockStep(false, int64(1)))
	steps = append(steps, roundInspectionSteps(roundColumnRow(0))...)
	steps = append(steps, testutil.QueryStep{Contains: "SELECT EXISTS", Columns: []string{"exists"}, Rows: [][]driver.Value{{false}}})
	steps = append(steps, roundCountSteps(3, 7)...)
	steps = append(steps, roundAddStep(1))
	steps = append(steps, roundInspectionSteps(roundColumnRow(0), roundColumnRow(1))...)
	steps = append(steps, roundTrendStep())
	steps = append(steps, roundCountSteps(3, 7)...)
	steps = append(steps, roundLockStep(true, int64(1)))
	db := roundTestDB(t, steps...)
	partial, err := RepairRectifyRounds(context.Background(), db, "gbnt_test")
	if !errors.Is(err, failure) || partial.Verified || len(partial.AppliedSQL) != 1 || len(partial.PendingSQL) != 1 {
		t.Fatalf("必须准确报告非原子迁移的部分成功：%+v %v", partial, err)
	}
	complete, err := RepairRectifyRounds(context.Background(), db, "gbnt_test")
	if err != nil || !complete.Verified || len(complete.AppliedSQL) != 1 || complete.AppliedSQL[0] != roundTargets[1].ddl {
		t.Fatalf("重跑应只补剩余列：%+v %v", complete, err)
	}
}

func TestRoundRepairRejectsWrongDatabaseAndUnavailableLocks(t *testing.T) {
	t.Run("未确认库名不建连接", func(t *testing.T) {
		_, err := RepairRectifyRounds(context.Background(), roundTestDB(t), "")
		requireRoundSafety(t, err, "明确指定")
	})
	t.Run("库名不匹配", func(t *testing.T) {
		_, err := RepairRectifyRounds(context.Background(), roundTestDB(t, roundNameStep("other_db")), "gbnt_test")
		requireRoundSafety(t, err, "目标库不一致")
	})
	for _, lock := range []driver.Value{int64(0), nil} {
		t.Run("锁不可用", func(t *testing.T) {
			_, err := RepairRectifyRounds(context.Background(), roundTestDB(t, roundNameStep("gbnt_test"), roundLockStep(false, lock)), "gbnt_test")
			requireRoundSafety(t, err, "迁移锁不可用")
		})
	}
}

func TestRoundCheckRejectsMissingDatabaseOrTable(t *testing.T) {
	for _, name := range []driver.Value{nil, ""} {
		_, err := CheckRectifyRounds(context.Background(), roundTestDB(t, roundNameStep(name)))
		requireRoundSafety(t, err, "未选择数据库")
	}
	_, err := CheckRectifyRounds(context.Background(), roundTestDB(t,
		roundNameStep("gbnt_test"),
		testutil.QueryStep{Contains: "information_schema.TABLES", Columns: []string{"count"}, Rows: [][]driver.Value{{int64(0)}}},
	))
	requireRoundSafety(t, err, "不初始化数据库")
}

func TestRoundRepairDetectsRowCountChanges(t *testing.T) {
	steps := []testutil.QueryStep{roundNameStep("gbnt_test"), roundLockStep(false, int64(1))}
	steps = append(steps, roundInspectionSteps()...)
	steps = append(steps, roundCountSteps(3, 7)...)
	steps = append(steps, roundAddStep(0), roundAddStep(1))
	steps = append(steps, roundInspectionSteps(roundColumnRow(0), roundColumnRow(1))...)
	steps = append(steps, roundTrendStep())
	steps = append(steps, roundCountSteps(4, 7)...)
	steps = append(steps, roundLockStep(true, int64(1)))
	report, err := RepairRectifyRounds(context.Background(), roundTestDB(t, steps...), "gbnt_test")
	requireRoundSafety(t, err, "记录数发生变化")
	if report.Verified || len(report.AppliedSQL) != 2 {
		t.Fatalf("写入竞态时不能报告完整验收通过：%+v", report)
	}
}

func TestRoundCheckDoesNotHideTrendQueryFailure(t *testing.T) {
	failure := errors.New("another missing column")
	steps := append([]testutil.QueryStep{roundNameStep("gbnt_test")}, roundInspectionSteps(roundColumnRow(0), roundColumnRow(1))...)
	trend := roundTrendStep()
	trend.Err = failure
	steps = append(steps, trend)
	report, err := CheckRectifyRounds(context.Background(), roundTestDB(t, steps...))
	if !errors.Is(err, failure) || report.Verified {
		t.Fatalf("其他缺列不得伪装为空数据或已修复：%+v %v", report, err)
	}
}

func TestRoundRepairReleasesLockOnInspectionFailure(t *testing.T) {
	failure := errors.New("metadata denied")
	steps := []testutil.QueryStep{roundNameStep("gbnt_test"), roundLockStep(false, int64(1)), {Contains: "information_schema.TABLES", Err: failure}, roundLockStep(true, int64(1))}
	_, err := RepairRectifyRounds(context.Background(), roundTestDB(t, steps...), "gbnt_test")
	if !errors.Is(err, failure) {
		t.Fatalf("查询失败应终止且释放锁：%v", err)
	}
}

func TestRoundRepairDiscardsConnectionWhenLockResponseIsUncertain(t *testing.T) {
	failure := errors.New("lock response interrupted")
	lock := roundLockStep(false, int64(1))
	lock.Err = failure
	db := roundTestDB(t, roundNameStep("gbnt_test"), lock)
	_, err := RepairRectifyRounds(context.Background(), db, "gbnt_test")
	if !errors.Is(err, failure) || db.Stats().OpenConnections != 0 {
		t.Fatalf("获取锁结果未知时必须丢弃连接：%v %+v", err, db.Stats())
	}
}

func TestRoundRepairDiscardsConnectionWhenUnlockFails(t *testing.T) {
	for _, scenario := range []string{"error", "zero", "null"} {
		t.Run(scenario, func(t *testing.T) {
			steps := []testutil.QueryStep{roundNameStep("gbnt_test"), roundLockStep(false, int64(1))}
			steps = append(steps, roundInspectionSteps(roundColumnRow(0), roundColumnRow(1))...)
			release := roundLockStep(true, int64(1))
			switch scenario {
			case "error":
				release.Err = errors.New("release interrupted")
			case "zero":
				release.Rows = [][]driver.Value{{int64(0)}}
			case "null":
				release.Rows = [][]driver.Value{{nil}}
			}
			steps = append(steps, roundTrendStep(), release)
			db := roundTestDB(t, steps...)
			report, err := RepairRectifyRounds(context.Background(), db, "gbnt_test")
			if err != nil || !report.Verified || db.Stats().OpenConnections != 0 {
				t.Fatalf("释放失败必须关闭会话而非带锁归还连接池：%+v %v %+v", report, err, db.Stats())
			}
		})
	}
}

func TestRoundRepairReleasesLockAfterOperationContextCanceled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	failure := testutil.QueryStep{Contains: "information_schema.TABLES", Err: context.Canceled, Check: func(string, []driver.NamedValue) { cancel() }}
	steps := []testutil.QueryStep{roundNameStep("gbnt_test"), roundLockStep(false, int64(1)), failure, roundLockStep(true, int64(1))}
	_, err := RepairRectifyRounds(ctx, roundTestDB(t, steps...), "gbnt_test")
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("取消后仍应以独立上下文清理锁：%v", err)
	}
}

func TestRoundColumnDDLMatchesCurrentModels(t *testing.T) {
	for index, entity := range []any{&model.Issue{}, &model.IssueRectifyRecord{}} {
		parsed, err := schema.Parse(entity, &sync.Map{}, schema.NamingStrategy{})
		if err != nil {
			t.Fatal(err)
		}
		target := roundTargets[index]
		field := parsed.LookUpField(target.column)
		if field == nil || field.FieldType.Kind() != reflect.Uint64 || !field.NotNull || field.DefaultValue != "0" {
			t.Fatalf("模型与补列默认值/可空性不一致：%s", target.column)
		}
		if got := mysql.New(mysql.Config{}).DataTypeOf(field); got != "bigint unsigned" || !strings.Contains(strings.ToLower(target.ddl), got+" not null default 0") {
			t.Fatalf("模型 MySQL 类型与迁移不一致：%s", got)
		}
	}
}
