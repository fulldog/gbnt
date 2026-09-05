package service

import (
	"context"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"

	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/testutil"
	"gorm.io/gorm"
)

func TestAdminIssueJSONPreservesBaseAndNullNames(t *testing.T) {
	base := IssueVO{Issue: model.Issue{IssueKey: "ISS-1", Type: "well", TypeExt: `{}`},
		TypeExtVO:      json.RawMessage(`{"checklist":[{"type":"water_out","photos":[{"file_id":"image-1","url":"/uploads/1"}]}]}`),
		RectifyRecords: []RectifyRecordVO{}, ReporterSignature: &FileItem{FileID: "sig-1", URL: "/uploads/sig"}}
	name := "上报人"
	admin := AdminIssueVO{IssueVO: base, ReportUserName: &name}
	data, err := json.Marshal(admin)
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]json.RawMessage
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"assignee_user_name", "org_name", "org_path"} {
		if string(got[key]) != "null" {
			t.Errorf("%s 应固定输出 null，实际 %s", key, got[key])
		}
	}
	for _, key := range []string{"issue_key", "type_ext", "rectify_records", "reporter_signature"} {
		if _, ok := got[key]; !ok {
			t.Errorf("缺少基础键 %s", key)
		}
	}
	if string(got["rectify_records"]) != "[]" || !strings.Contains(string(got["type_ext"]), "photos") {
		t.Fatalf("基础结构丢失：%s", data)
	}
	appJSON, _ := json.Marshal(base)
	if strings.Contains(string(appJSON), "report_user_name") {
		t.Fatalf("基础视图不应扩展：%s", appJSON)
	}
}

func TestAdminIssueNamesAreBatchedAndMissingRemainNull(t *testing.T) {
	db := testutil.NewQueryDB(t,
		testutil.QueryStep{Contains: "FROM `sys_users`", Columns: []string{"id", "name", "username"}, Rows: [][]driver.Value{{int64(2), "", "older-than-1000"}}, Check: func(sql string, _ []driver.NamedValue) {
			if strings.Contains(sql, "phone") || !strings.Contains(sql, "id IN") || !strings.Contains(sql, "is_delete") {
				t.Fatalf("不应全量/绕过软删读取人员：%s", sql)
			}
		}},
		testutil.QueryStep{Contains: "FROM `sys_orgs`", Columns: []string{"id", "name", "parent_id"}, Rows: [][]driver.Value{{int64(4), "村", int64(3)}}},
		testutil.QueryStep{Contains: "FROM `sys_orgs`", Columns: []string{"id", "name", "parent_id"}, Rows: [][]driver.Value{{int64(3), "街道", int64(1)}}},
		testutil.QueryStep{Contains: "FROM `sys_orgs`", Columns: []string{"id", "name", "parent_id"}, Rows: [][]driver.Value{{int64(1), "区", int64(0)}}},
	)
	list := make([]IssueVO, 25)
	for i := range list {
		list[i].Issue = model.Issue{ReportUserID: 2, AssigneeUser: 9999, OrgID: 4}
	}
	out, err := enrichAdminIssues(db, list)
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 25 || *out[0].ReportUserName != "older-than-1000" || out[0].AssigneeUserName != nil || *out[0].OrgPath != "区 / 街道 / 村" {
		t.Fatalf("关联名称错误：%+v", out[0])
	}
}

func TestOrgDisplayMissingAncestorsAndCycles(t *testing.T) {
	names := &adminDisplayNames{orgs: map[uint64]model.SysOrg{
		2: {Name: "街道", ParentID: 99}, 3: {Name: "村", ParentID: 2}, 8: {Name: "环", ParentID: 8},
	}}
	_, path := names.orgDisplay(3)
	if path == nil || *path != "街道 / 村" {
		t.Fatalf("缺失祖先应保留可解析部分：%v", path)
	}
	if name, path := names.orgDisplay(404); name != nil || path != nil {
		t.Fatal("缺失组织应为 null")
	}
	if _, path := names.orgDisplay(8); path == nil || *path != "环" {
		t.Fatal("环不应无限递归")
	}
}

func TestAdminIssueAndAppKeywordStaySeparate(t *testing.T) {
	db := testutil.NewQueryDB(t)
	s := &IssueService{DB: db}
	q := IssueQuery{Keyword: "  ISS-100  ", Type: "well", Status: "new", ProjectYear: 2023}
	admin := s.applyAdminIssueFilters(db.Session(&gorm.Session{DryRun: true}).Model(&model.Issue{}), q).Find(&[]model.Issue{}).Statement
	query := admin.SQL.String()
	if !strings.Contains(query, "(issue_key LIKE ? OR code LIKE ? OR address LIKE ?)") || !strings.Contains(query, "type = ? AND status = ? AND project_year = ? AND") {
		t.Fatalf("条件分组错误：%s", query)
	}
	if !strings.Contains(fmt.Sprint(admin.Vars), "%ISS-100%") || strings.Contains(fmt.Sprint(admin.Vars), "%  ISS") {
		t.Fatalf("未 trim：%v", admin.Vars)
	}
	app := s.applyIssueFilters(db.Session(&gorm.Session{DryRun: true}).Model(&model.Issue{}), q).Find(&[]model.Issue{}).Statement
	if strings.Contains(app.SQL.String(), "issue_key LIKE") {
		t.Fatal("不能扩大小程序搜索语义")
	}
}

func TestListCountAndAssociationFailuresPropagate(t *testing.T) {
	want := errors.New("count unavailable")
	t.Run("问题计数", func(t *testing.T) {
		db := testutil.NewQueryDB(t, testutil.QueryStep{Contains: "count(*)", Err: want})
		_, _, err := (&IssueService{DB: db}).ListAdmin(context.Background(), IssueQuery{})
		if !errors.Is(err, want) {
			t.Fatalf("错误被吞：%v", err)
		}
	})
	t.Run("人员计数", func(t *testing.T) {
		db := testutil.NewQueryDB(t, testutil.QueryStep{Contains: "count(*)", Err: want})
		_, _, err := (&SysService{DB: db}).ListAdminUsers(context.Background(), 0, "", 0, 0)
		if !errors.Is(err, want) {
			t.Fatalf("错误被吞：%v", err)
		}
	})
	t.Run("关联失败", func(t *testing.T) {
		db := testutil.NewQueryDB(t, testutil.QueryStep{Contains: "FROM `sys_users`", Err: want})
		_, err := enrichAdminIssues(db, []IssueVO{{Issue: model.Issue{ReportUserID: 1}}})
		if !errors.Is(err, want) {
			t.Fatalf("错误被吞：%v", err)
		}
	})
}

func TestLedgerEmptyRowsAndQueryFailures(t *testing.T) {
	for _, street := range []bool{false, true} {
		for _, fail := range []bool{false, true} {
			t.Run(fmt.Sprintf("街道_%t_故障_%t", street, fail), func(t *testing.T) {
				step := testutil.QueryStep{Contains: "GROUP BY", Columns: []string{"org_id", "type", "total", "pending", "done"}}
				if fail {
					step.Err = errors.New("aggregate unavailable")
				}
				db := testutil.NewQueryDB(t, step)
				s := &IssueService{DB: db}
				var result any
				var err error
				if street {
					result, err = s.LedgerStreet(0, "2026-01-01", "2026-09-01")
				} else {
					result, err = s.LedgerSurvey(0, "", "")
				}
				if fail {
					if err == nil || result != nil {
						t.Fatal("故障不能返回成功空数据")
					}
					return
				}
				if err != nil {
					t.Fatal(err)
				}
				encoded, _ := json.Marshal(result)
				if !strings.Contains(string(encoded), `"rows":[]`) {
					t.Fatalf("空值不应为 null：%s", encoded)
				}
			})
		}
	}
}

func TestAdminUsersDisplayAndPagination(t *testing.T) {
	db := testutil.NewQueryDB(t,
		testutil.QueryStep{Contains: "count(*)", Columns: []string{"count"}, Rows: [][]driver.Value{{int64(2)}}},
		testutil.QueryStep{Contains: "FROM `sys_users`", Columns: []string{"id", "org_id", "role_id", "is_super_admin"}, Rows: [][]driver.Value{{int64(1), int64(0), int64(0), true}, {int64(2), int64(9), int64(8), false}}, Check: func(query string, args []driver.NamedValue) {
			if !strings.Contains(query, "LIMIT ?") || args[len(args)-1].Value != int64(20) {
				t.Errorf("默认分页错误：%s %v", query, args)
			}
		}},
		testutil.QueryStep{Contains: "FROM `sys_orgs`", Columns: []string{"id", "name", "parent_id"}},
		testutil.QueryStep{Contains: "FROM `sys_roles`", Columns: []string{"id", "name"}},
	)
	list, total, err := (&SysService{DB: db}).ListAdminUsers(context.Background(), 0, "", -1, 0)
	if err != nil {
		t.Fatal(err)
	}
	if total != 2 || len(list) != 2 || !list[0].IsSuperAdmin || list[0].RoleName != nil || list[1].OrgName != nil {
		t.Fatalf("关联兜底错误：%+v", list)
	}
}
