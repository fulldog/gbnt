package service

import (
	"context"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"gbnt/apps/server/internal/database"
	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/testutil"
)

func TestMiniappIssueNamesAreBatchedWithoutExposingUserFields(t *testing.T) {
	db := testutil.NewQueryDB(t,
		testutil.QueryStep{Contains: "FROM `sys_users`", Columns: []string{"id", "name", "username"}, Rows: [][]driver.Value{{int64(7), "巡查员", "reporter"}, {int64(8), "", "assignee"}}, Check: func(query string, _ []driver.NamedValue) {
			for _, forbidden := range []string{"phone", "password", "token_ver", "SELECT *"} {
				if strings.Contains(query, forbidden) {
					t.Fatalf("名称查询不能拉取敏感字段: %s", query)
				}
			}
		}},
		testutil.QueryStep{Contains: "FROM `sys_orgs`", Columns: []string{"id", "name", "parent_id"}, Rows: [][]driver.Value{{int64(2), "村", int64(1)}}},
		testutil.QueryStep{Contains: "FROM `sys_orgs`", Columns: []string{"id", "name", "parent_id"}, Rows: [][]driver.Value{{int64(1), "街道", int64(0)}}},
	)
	items := make([]IssueVO, 25)
	for i := range items {
		items[i] = IssueVO{Issue: model.Issue{ReportUserID: 7, AssigneeUser: 8, OrgID: 2, RectifyRound: 1}, TypeExtVO: json.RawMessage(`{}`), RectifyRecords: []RectifyRecordVO{}}
	}
	out, err := (&IssueService{DB: db}).MiniappIssueViews(context.Background(), items)
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 25 || *out[0].ReportUserName != "巡查员" || *out[0].AssigneeUserName != "assignee" || *out[0].OrgPath != "街道 / 村" {
		t.Fatalf("展示结果不符: %+v", out)
	}
	encoded, err := json.Marshal(out[0])
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(encoded), `"rectify_round":1`) || !strings.Contains(string(encoded), `"report_user_name":"巡查员"`) || strings.Contains(string(encoded), `"phone"`) {
		t.Fatalf("契约错误: %s", encoded)
	}
}

func TestMiniappNamesMissingAreNullAndFailuresPropagate(t *testing.T) {
	t.Run("已删除关联", func(t *testing.T) {
		db := testutil.NewQueryDB(t, testutil.QueryStep{Contains: "FROM `sys_orgs`", Columns: []string{"id"}}, testutil.QueryStep{Contains: "FROM `sys_roles`", Columns: []string{"id"}})
		out, err := (&AuthService{DB: db}).MiniappUserNames(context.Background(), &database.UserInfo{ID: 7, OrgID: 2, RoleID: 3})
		if err != nil || out.OrgName != nil || out.OrgPath != nil || out.RoleName != nil {
			t.Fatalf("缺失关联不应伪造: %+v %v", out, err)
		}
	})
	t.Run("本人名称", func(t *testing.T) {
		db := testutil.NewQueryDB(t,
			testutil.QueryStep{Contains: "FROM `sys_orgs`", Columns: []string{"id", "name", "parent_id"}, Rows: [][]driver.Value{{int64(2), "街道", int64(0)}}},
			testutil.QueryStep{Contains: "FROM `sys_roles`", Columns: []string{"id", "name"}, Rows: [][]driver.Value{{int64(3), "巡查员"}}},
		)
		out, err := (&AuthService{DB: db}).MiniappUserNames(context.Background(), &database.UserInfo{ID: 7, OrgID: 2, RoleID: 3})
		if err != nil || *out.OrgName != "街道" || *out.RoleName != "巡查员" {
			t.Fatalf("本人名称缺失: %+v %v", out, err)
		}
	})
	t.Run("读取故障", func(t *testing.T) {
		failure := errors.New("query unavailable")
		db := testutil.NewQueryDB(t, testutil.QueryStep{Contains: "FROM `sys_orgs`", Err: failure})
		_, err := (&AuthService{DB: db}).MiniappUserNames(context.Background(), &database.UserInfo{ID: 7, OrgID: 2})
		if !errors.Is(err, failure) {
			t.Fatalf("读取故障不应伪装为空名称: %v", err)
		}
	})
	t.Run("空列表", func(t *testing.T) {
		db := testutil.NewQueryDB(t)
		out, err := (&IssueService{DB: db}).MiniappIssueViews(context.Background(), nil)
		if err != nil || out == nil || len(out) != 0 {
			t.Fatalf("空列表必须为[]: %v %v", out, err)
		}
	})
}
