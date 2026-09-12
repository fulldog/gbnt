package service

import (
	"context"
	"database/sql/driver"
	"errors"
	"strings"
	"testing"
	"time"

	"gbnt/apps/server/internal/database"
	"gbnt/apps/server/internal/testutil"
)

func assertOrgArgs(t *testing.T, args []driver.NamedValue, want ...int64) {
	t.Helper()
	got := make(map[int64]bool, len(args))
	for _, arg := range args {
		if value, ok := arg.Value.(int64); ok {
			got[value] = true
		}
	}
	for _, id := range want {
		if !got[id] {
			t.Errorf("组织筛选缺少 %d：%v", id, args)
		}
	}
}

func TestListVisibleUsersUsesCurrentOrganizationSubtree(t *testing.T) {
	check := func(query string, args []driver.NamedValue) {
		if !strings.Contains(query, "org_id IN") {
			t.Fatalf("缺少组织可见范围：%s", query)
		}
		assertOrgArgs(t, args, 3, 4, 5)
	}
	db := testutil.NewQueryDB(t,
		scopeOrgRows(),
		testutil.QueryStep{Contains: "count(*)", Columns: []string{"count"}, Rows: [][]driver.Value{{int64(0)}}, Check: check},
		testutil.QueryStep{Contains: "FROM `sys_users`", Columns: []string{"id"}, Check: check},
	)
	ctx := database.WithUser(context.Background(), &database.UserInfo{ID: 7, OrgID: 3})
	list, total, err := (&SysService{DB: db}).ListVisibleUsers(ctx, 0, "", 1, 20)
	if err != nil || total != 0 || len(list) != 0 {
		t.Fatalf("可见人员列表异常：total=%d list=%v err=%v", total, list, err)
	}
}

func TestListVisibleUsersIntersectsExplicitOrganization(t *testing.T) {
	check := func(query string, _ []driver.NamedValue) {
		if !strings.Contains(query, "1 = 0") {
			t.Fatalf("兄弟组织筛选应得到空交集：%s", query)
		}
	}
	db := testutil.NewQueryDB(t,
		scopeOrgRows(),
		scopeOrgRows(),
		testutil.QueryStep{Contains: "count(*)", Columns: []string{"count"}, Rows: [][]driver.Value{{int64(0)}}, Check: check},
		testutil.QueryStep{Contains: "FROM `sys_users`", Columns: []string{"id"}, Check: check},
	)
	ctx := database.WithUser(context.Background(), &database.UserInfo{ID: 7, OrgID: 3})
	if _, _, err := (&SysService{DB: db}).ListVisibleUsers(ctx, 6, "", 1, 20); err != nil {
		t.Fatal(err)
	}
}

func TestListVisibleUsersTreatsZeroOrganizationAsGlobal(t *testing.T) {
	check := func(query string, _ []driver.NamedValue) {
		if strings.Contains(query, "org_id IN") || strings.Contains(query, "1 = 0") {
			t.Fatalf("org_id=0 不应追加组织过滤：%s", query)
		}
	}
	db := testutil.NewQueryDB(t,
		testutil.QueryStep{Contains: "count(*)", Columns: []string{"count"}, Rows: [][]driver.Value{{int64(0)}}, Check: check},
		testutil.QueryStep{Contains: "FROM `sys_users`", Columns: []string{"id"}, Check: check},
	)
	ctx := database.WithUser(context.Background(), &database.UserInfo{ID: 7, OrgID: 0})
	if _, _, err := (&SysService{DB: db}).ListVisibleUsers(ctx, 0, "", 1, 20); err != nil {
		t.Fatal(err)
	}
}

func TestGetAdminIssueRejectsSiblingOrganization(t *testing.T) {
	db := testutil.NewQueryDB(t,
		testutil.QueryStep{
			Contains: "FROM `issues`",
			Columns:  []string{"id", "type", "type_ext", "org_id"},
			Rows:     [][]driver.Value{{int64(1), "well", `{"checklist":[]}`, int64(6)}},
		},
		testutil.QueryStep{Contains: "FROM `issue_rectify_records`", Columns: []string{"id"}},
		scopeOrgRows(),
	)
	ctx := database.WithUser(context.Background(), &database.UserInfo{ID: 7, OrgID: 3})
	_, err := (&IssueService{DB: db}).GetAdmin(ctx, 1)
	if !errors.Is(err, ErrOrgScopeForbidden) {
		t.Fatalf("兄弟组织详情应拒绝：%v", err)
	}
}

func TestWorkbenchStatsUsesVisibleOrganizationSubtree(t *testing.T) {
	check := func(query string, args []driver.NamedValue) {
		if !strings.Contains(query, "org_id IN") {
			t.Fatalf("工作台统计缺少组织范围：%s", query)
		}
		assertOrgArgs(t, args, 3, 4, 5)
	}
	steps := []testutil.QueryStep{scopeOrgRows()}
	for range 9 {
		steps = append(steps, testutil.QueryStep{
			Contains: "SELECT count(*) FROM `issues`",
			Columns:  []string{"count"},
			Rows:     [][]driver.Value{{int64(0)}},
			Check:    check,
		})
	}
	db := testutil.NewQueryDB(t, steps...)
	ctx := database.WithUser(context.Background(), &database.UserInfo{ID: 7, OrgID: 3})
	if _, err := (&IssueService{DB: db}).Stats(ctx); err != nil {
		t.Fatal(err)
	}
}

func TestWorkbenchTrendAndTodosUseVisibleOrganizationSubtree(t *testing.T) {
	t.Run("trend", func(t *testing.T) {
		db := testutil.NewQueryDB(t,
			scopeOrgRows(),
			testutil.QueryStep{
				Contains: "SELECT issues.created_at",
				Columns:  []string{"created_at", "status", "completed_at"},
				Check: func(query string, args []driver.NamedValue) {
					if !strings.Contains(query, "org_id IN") {
						t.Fatalf("工作台趋势缺少组织范围：%s", query)
					}
					assertOrgArgs(t, args, 3, 4, 5)
				},
			},
		)
		ctx := database.WithUser(context.Background(), &database.UserInfo{ID: 7, OrgID: 3})
		if _, err := (&IssueService{DB: db}).WorkbenchTrend(ctx, "all", time.Now()); err != nil {
			t.Fatal(err)
		}
	})

	t.Run("todos", func(t *testing.T) {
		check := func(query string, args []driver.NamedValue) {
			if !strings.Contains(query, "org_id IN") {
				t.Fatalf("工作台待办缺少组织范围：%s", query)
			}
			assertOrgArgs(t, args, 3, 4, 5)
		}
		db := testutil.NewQueryDB(t,
			scopeOrgRows(),
			testutil.QueryStep{Contains: "count(*)", Columns: []string{"count"}, Rows: [][]driver.Value{{int64(0)}}, Check: check},
			testutil.QueryStep{Contains: "SELECT id, issue_key", Columns: []string{"id"}, Check: check},
		)
		ctx := database.WithUser(context.Background(), &database.UserInfo{ID: 7, OrgID: 3})
		if _, err := (&IssueService{DB: db}).WorkbenchTodos(ctx, 1, 20, time.Now()); err != nil {
			t.Fatal(err)
		}
	})
}

func ledgerVisibilityOrgRows() testutil.QueryStep {
	return testutil.QueryStep{
		Contains: "FROM `sys_orgs`",
		Columns:  []string{"id", "parent_id", "name", "type"},
		Rows: [][]driver.Value{
			{int64(1), int64(0), "根", "root"},
			{int64(2), int64(1), "区", "district"},
			{int64(3), int64(2), "当前街道", "street"},
			{int64(4), int64(3), "甲村", "village"},
			{int64(5), int64(3), "乙村", "village"},
			{int64(6), int64(2), "兄弟街道", "street"},
		},
	}
}

func TestLedgerReportUsesVisibleOrganizationAndRejectsSiblingStreet(t *testing.T) {
	t.Run("current subtree", func(t *testing.T) {
		db := testutil.NewQueryDB(t,
			ledgerVisibilityOrgRows(),
			testutil.QueryStep{Contains: "FROM `issues`", Columns: []string{"id"}, Check: func(query string, args []driver.NamedValue) {
				if !strings.Contains(query, "org_id IN") {
					t.Fatalf("汇总报表缺少组织范围：%s", query)
				}
				assertOrgArgs(t, args, 3, 4, 5)
			}},
		)
		ctx := database.WithUser(context.Background(), &database.UserInfo{ID: 7, OrgID: 3})
		if _, _, err := (&IssueService{DB: db}).loadLedgerReport(ctx, LedgerReportQuery{}); err != nil {
			t.Fatal(err)
		}
	})

	t.Run("sibling street", func(t *testing.T) {
		db := testutil.NewQueryDB(t,
			ledgerVisibilityOrgRows(),
			testutil.QueryStep{Contains: "FROM `issues`", Columns: []string{"id"}, Check: func(query string, _ []driver.NamedValue) {
				if !strings.Contains(query, "1 = 0") {
					t.Fatalf("兄弟街道应得到空交集：%s", query)
				}
			}},
		)
		ctx := database.WithUser(context.Background(), &database.UserInfo{ID: 7, OrgID: 3})
		if _, _, err := (&IssueService{DB: db}).loadLedgerReport(ctx, LedgerReportQuery{StreetOrgID: 6}); err != nil {
			t.Fatal(err)
		}
	})
}

func TestLegacyLedgerUsesVisibleOrganizationSubtree(t *testing.T) {
	db := testutil.NewQueryDB(t,
		scopeOrgRows(),
		testutil.QueryStep{
			Contains: "SELECT type, COUNT(*)",
			Columns:  []string{"type", "total", "pending", "done"},
			Check: func(query string, args []driver.NamedValue) {
				if !strings.Contains(query, "org_id IN") {
					t.Fatalf("旧汇总接口缺少组织范围：%s", query)
				}
				assertOrgArgs(t, args, 3, 4, 5)
			},
		},
	)
	ctx := database.WithUser(context.Background(), &database.UserInfo{ID: 7, OrgID: 3})
	if _, err := (&IssueService{DB: db}).LedgerSurvey(ctx, 0, "", ""); err != nil {
		t.Fatal(err)
	}
}

func TestWorkbenchZeroOrganizationRemainsGlobal(t *testing.T) {
	db := testutil.NewQueryDB(t, testutil.QueryStep{
		Contains: "SELECT issues.created_at",
		Columns:  []string{"created_at", "status", "completed_at"},
		Check: func(query string, _ []driver.NamedValue) {
			if strings.Contains(query, "org_id IN") || strings.Contains(query, "1 = 0") {
				t.Fatalf("org_id=0 的工作台不应追加组织过滤：%s", query)
			}
		},
	})
	ctx := database.WithUser(context.Background(), &database.UserInfo{ID: 7, OrgID: 0})
	if _, err := (&IssueService{DB: db}).WorkbenchTrend(ctx, "all", time.Now()); err != nil {
		t.Fatal(err)
	}
}
