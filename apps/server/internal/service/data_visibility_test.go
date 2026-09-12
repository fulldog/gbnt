package service

import (
	"context"
	"database/sql/driver"
	"errors"
	"strings"
	"testing"

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
