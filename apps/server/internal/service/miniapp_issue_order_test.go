package service

import (
	"context"
	"database/sql/driver"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"

	"gbnt/apps/server/internal/database"
	"gbnt/apps/server/internal/testutil"
)

func TestMiniappDeadlineOrderBeforePagination(t *testing.T) {
	for _, test := range []struct{ now, overdueBefore, normalFrom string }{
		{"2026-09-09T14:00:00Z", "2026-09-10", "2026-09-13"},
		{"2026-09-09T16:00:00Z", "2026-09-10", "2026-09-13"},
		{"2026-09-09T16:00:00.001Z", "2026-09-11", "2026-09-14"},
		{"2026-12-31T15:59:59Z", "2027-01-01", "2027-01-04"},
		{"2028-02-28T17:00:00Z", "2028-03-01", "2028-03-04"},
	} {
		t.Run(test.now, func(t *testing.T) {
			now, _ := time.Parse(time.RFC3339Nano, test.now)
			db := testutil.NewQueryDB(t,
				testutil.QueryStep{Contains: "count(*)", Columns: []string{"count"}, Rows: [][]driver.Value{{int64(0)}}},
				testutil.QueryStep{Contains: "SELECT * FROM `issues`", Columns: []string{"id"}, Check: func(query string, args []driver.NamedValue) {
					if order, limit := strings.Index(query, "ORDER BY CASE"), strings.Index(query, "LIMIT"); order < 0 || limit <= order {
						t.Fatalf("必须在分页前排序：%s", query)
					}
					if !strings.Contains(query, "END DESC, id DESC") || !strings.Contains(query, "LAST_DAY") {
						t.Fatalf("缺少剩余时间倒序或日期有效性检查：%s", query)
					}
					if !strings.Contains(query, "assignee_user IN") {
						t.Fatalf("待办必须按未指派或当前用户筛选：%s", query)
					}
					values := make([]any, len(args))
					for i, arg := range args {
						values[i] = arg.Value
					}
					want := []any{int64(0), int64(0), int64(1), test.overdueBefore, test.normalFrom, int64(3), int64(3)}
					if !reflect.DeepEqual(values, want) {
						t.Fatalf("时间边界/分页参数 %v；期望 %v", values, want)
					}
				}},
			)
			db.NowFunc = func() time.Time { return now }
			ctx := database.WithUser(context.Background(), &database.UserInfo{ID: 1})
			if _, _, err := (&IssueService{DB: db}).ListTodos(ctx, IssueQuery{Page: 2, Size: 3}); err != nil {
				t.Fatal(err)
			}
		})
	}
}

// TestMiniappIssueMySQLOrdering 仅使用连接级临时表，验证真实数据库跨页排序及无效日期处理。
func TestMiniappIssueMySQLOrdering(t *testing.T) {
	dsn := os.Getenv("GBNT_TEST_MYSQL_DSN")
	if dsn == "" {
		t.Skip("未配置隔离 MySQL")
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	t.Cleanup(func() { _ = sqlDB.Close() })
	for _, query := range []string{
		"CREATE TEMPORARY TABLE issues (id BIGINT UNSIGNED PRIMARY KEY, type VARCHAR(32), type_ext JSON, status VARCHAR(16), plan_date VARCHAR(32), created_at DATETIME, is_delete INT NOT NULL DEFAULT 0, assignee_user BIGINT UNSIGNED NOT NULL DEFAULT 0)",
		"CREATE TEMPORARY TABLE issue_rectify_records (id BIGINT UNSIGNED PRIMARY KEY, issue_id BIGINT UNSIGNED, is_delete INT NOT NULL DEFAULT 0)",
	} {
		if err := db.Exec(query).Error; err != nil {
			t.Fatal(err)
		}
	}
	for _, row := range []struct {
		id           int
		status, plan string
		deleted      int
	}{
		{1, "new", "2026-09-08", 0}, {2, "pending", "2026-09-09", 0}, {3, "pending", "2026-09-10", 0},
		{4, "new", "2026-09-12", 0}, {5, "new", "2026-09-13", 0}, {6, "pending", "2026-09-18", 0},
		{7, "new", "", 0}, {8, "pending", "2026-02-30", 0}, {9, "done", "2020-01-01", 0}, {10, "done", "", 0},
		{99, "new", "2026-09-09", 1},
	} {
		if err := db.Exec("INSERT INTO issues VALUES (?, 'well', '{}', ?, ?, '2026-09-01 10:00:00', ?, 0)", row.id, row.status, row.plan, row.deleted).Error; err != nil {
			t.Fatal(err)
		}
	}
	ctx := database.WithUser(context.Background(), &database.UserInfo{ID: 1})
	service := &IssueService{DB: db}
	now, _ := time.Parse(time.RFC3339, "2026-09-09T14:00:00Z")
	for page, want := range [][]uint64{{2, 1, 4}, {3, 6, 5}, {8, 7, 10}, {9}} {
		rows, total, err := service.ListTodos(ctx, IssueQuery{Page: page + 1, Size: 3, AsOf: now})
		if err != nil {
			t.Fatal(err)
		}
		ids := make([]uint64, len(rows))
		for i, row := range rows {
			ids[i] = row.ID
		}
		if total != 10 || !reflect.DeepEqual(ids, want) {
			t.Fatalf("page %d: ids=%v total=%d want=%v", page+1, ids, total, want)
		}
	}
	// 进入下一天后，今天到期记录提升到逾期组，四天边界同步进入橙色组。
	next, _ := time.Parse(time.RFC3339Nano, "2026-09-09T16:00:00.001Z")
	rows, _, err := service.ListTodos(ctx, IssueQuery{Page: 1, Size: 6, AsOf: next})
	if err != nil {
		t.Fatal(err)
	}
	ids := make([]uint64, len(rows))
	for i, row := range rows {
		ids[i] = row.ID
	}
	if !reflect.DeepEqual(ids, []uint64{3, 2, 1, 5, 4, 6}) {
		t.Fatalf("跨日排序: %v", ids)
	}
	for _, invalid := range []string{"2026-02-29", "2026-04-31", "2026-00-01", "2026-13-01", "0000-00-00", "bad-date"} {
		if err := db.Exec("UPDATE issues SET plan_date=? WHERE id=8", invalid).Error; err != nil {
			t.Fatal(err)
		}
		if _, _, err := service.ListTodos(ctx, IssueQuery{Page: 1, Size: 20, AsOf: now}); err != nil {
			t.Fatalf("无效日期 %s 触发数据库错误: %v", invalid, err)
		}
	}
}
