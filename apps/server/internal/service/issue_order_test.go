package service

import (
	"context"
	"database/sql/driver"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"gbnt/apps/server/internal/testutil"
)

func TestAdminIssueListOrdersBeforePaginationUsingShanghaiDates(t *testing.T) {
	for _, test := range []struct{ now, today, dueSoon string }{
		{"2026-09-07T15:59:59Z", "2026-09-07", "2026-09-10"},
		{"2026-09-07T16:00:00Z", "2026-09-08", "2026-09-11"},
		{"2026-12-31T16:00:00Z", "2027-01-01", "2027-01-04"},
		{"2028-02-27T16:00:00Z", "2028-02-28", "2028-03-02"},
	} {
		t.Run(test.now, func(t *testing.T) {
			now, err := time.Parse(time.RFC3339, test.now)
			if err != nil {
				t.Fatal(err)
			}
			db := testutil.NewQueryDB(t,
				testutil.QueryStep{Contains: "count(*)", Columns: []string{"count"}, Rows: [][]driver.Value{{int64(0)}}},
				testutil.QueryStep{Contains: "SELECT * FROM `issues`", Columns: []string{"id"}, Check: func(query string, args []driver.NamedValue) {
					order, limit := strings.Index(query, "ORDER BY CASE"), strings.Index(query, "LIMIT")
					if order < 0 || limit <= order || !strings.Contains(query, "created_at DESC, id DESC") {
						t.Errorf("必须先稳定排序再分页：%s", query)
					}
					values := make([]any, len(args))
					for i, arg := range args {
						values[i] = arg.Value
					}
					want := []any{int64(0), test.today, test.dueSoon, int64(3), int64(3)}
					if !reflect.DeepEqual(values, want) {
						t.Errorf("自然日或分页绑定参数错误：got %v, want %v", values, want)
					}
				}},
			)
			db.NowFunc = func() time.Time { return now }
			if _, _, err := (&IssueService{DB: db}).List(context.Background(), IssueQuery{Page: 2, Size: 3}); err != nil {
				t.Fatal(err)
			}
		})
	}
}

// TestAdminIssueListMySQLOrdering 用真实 MySQL 验证优先级、日期边界和跨页排序。
// 设置 GBNT_TEST_MYSQL_DSN 启用；仅创建连接级临时表，不迁移或写入业务表。
func TestAdminIssueListMySQLOrdering(t *testing.T) {
	dsn := os.Getenv("GBNT_TEST_MYSQL_DSN")
	if dsn == "" {
		t.Skip("设置 GBNT_TEST_MYSQL_DSN 可运行真实 MySQL 排序验证")
	}
	now := time.Date(2026, 9, 7, 2, 0, 0, 0, time.UTC)
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{
		NowFunc: func() time.Time { return now },
		Logger:  logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	// 临时表只属于本连接；关闭连接即释放，避免影响现有表或其他测试。
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	t.Cleanup(func() { _ = sqlDB.Close() })
	for _, statement := range []string{
		`CREATE TEMPORARY TABLE issues (
			id BIGINT UNSIGNED PRIMARY KEY, type VARCHAR(32), type_ext JSON,
			status VARCHAR(16), plan_date VARCHAR(32), created_at DATETIME,
			is_delete INT NOT NULL DEFAULT 0
		)`,
		`CREATE TEMPORARY TABLE issue_rectify_records (id BIGINT UNSIGNED PRIMARY KEY, issue_id BIGINT UNSIGNED, is_delete INT NOT NULL DEFAULT 0)`,
	} {
		if err := db.Exec(statement).Error; err != nil {
			t.Fatal(err)
		}
	}
	for _, row := range []struct {
		id      int
		status  string
		plan    any
		created string
		deleted int
	}{
		{1, "new", "2026-09-06", "2026-09-01 10:00:00", 0},
		{2, "pending", "2026-09-01", "2026-09-03 10:00:00", 0},
		{3, "new", "2026-09-07", "2026-09-02 10:00:00", 0},
		{4, "pending", "2026-09-10", "2026-09-06 10:00:00", 0},
		{5, "new", "2026-09-11", "2026-09-07 10:00:00", 0},
		{6, "pending", "", "2026-09-04 10:00:00", 0},
		{7, "done", "2026-09-01", "2026-09-06 10:00:00", 0},
		{8, "done", "", "2026-09-07 10:00:00", 0},
		{9, "new", "2026-02-30", "2026-09-05 10:00:00", 0},
		{10, "new", "", "2026-09-04 10:00:00", 0},
		{11, "new", nil, "2026-09-04 10:00:00", 0},
		{99, "new", "2026-09-01", "2026-09-07 10:00:00", 1},
	} {
		if err := db.Exec("INSERT INTO issues (id, type, type_ext, status, plan_date, created_at, is_delete) VALUES (?, 'well', '{}', ?, ?, ?, ?)", row.id, row.status, row.plan, row.created, row.deleted).Error; err != nil {
			t.Fatal(err)
		}
	}
	s := &IssueService{DB: db}
	assertIDs := func(query IssueQuery, want []uint64, wantTotal int64) {
		t.Helper()
		list, total, err := s.List(context.Background(), query)
		if err != nil {
			t.Fatal(err)
		}
		got := make([]uint64, len(list))
		for i, issue := range list {
			got[i] = issue.ID
		}
		if !reflect.DeepEqual(got, want) || total != wantTotal {
			t.Errorf("query=%+v: IDs=%v total=%d; want %v total=%d", query, got, total, want, wantTotal)
		}
	}
	for i, want := range [][]uint64{{2, 1, 4}, {3, 5, 9}, {11, 10, 6}, {8, 7}} {
		assertIDs(IssueQuery{Page: i + 1, Size: 3}, want, 11)
	}
	assertIDs(IssueQuery{Status: "new"}, []uint64{1, 3, 5, 9, 11, 10}, 6)
	assertIDs(IssueQuery{Status: "pending"}, []uint64{2, 4, 6}, 3)
	assertIDs(IssueQuery{Status: "done"}, []uint64{8, 7}, 2)

	// 非法日期不能误入逾期组，也不能使 MySQL 日期转换报错。
	for _, plan := range []string{"2026-02-29", "2026-04-31", "2026-00-10", "2026-13-10", "2026-09-00", "2026-09-32", "not-a-date", "0000-00-00"} {
		if err := db.Exec("UPDATE issues SET plan_date = ? WHERE id = 9", plan).Error; err != nil {
			t.Fatal(err)
		}
		assertIDs(IssueQuery{Page: 2, Size: 3}, []uint64{3, 5, 9}, 11)
	}
	// 有效闰日仍属于逾期记录，不能被非法日期保护逻辑误排除。
	if err := db.Exec("UPDATE issues SET plan_date = '2024-02-29' WHERE id = 9").Error; err != nil {
		t.Fatal(err)
	}
	assertIDs(IssueQuery{Page: 1, Size: 3}, []uint64{9, 2, 1}, 11)
}
