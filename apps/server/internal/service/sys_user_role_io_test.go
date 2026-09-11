package service

import (
	"bytes"
	"context"
	"database/sql/driver"
	"strings"
	"testing"
	"time"

	"github.com/xuri/excelize/v2"

	"gbnt/apps/server/internal/testutil"
	"gbnt/apps/server/pkg/xlsxutil"
)

func userIOOrgStep() testutil.QueryStep {
	return testutil.QueryStep{Contains: "FROM `sys_orgs`", Columns: []string{"id", "name"}, Rows: [][]driver.Value{{int64(2), "测试街道"}}}
}

func userIORoleStep() testutil.QueryStep {
	return testutil.QueryStep{Contains: "FROM `sys_roles`", Columns: []string{"id", "name", "code"}, Rows: [][]driver.Value{{int64(2), "系统配置员", "admin-test"}, {int64(3), "系统配置员", "test"}, {int64(4), "历史角色", "legacy"}}}
}

func TestExportUsersIncludesTextRoleIDWithDuplicateNames(t *testing.T) {
	db := testutil.NewQueryDB(t,
		testutil.QueryStep{Contains: "ORDER BY sort ASC, id DESC", Columns: []string{"id", "name", "username", "org_id", "role_id", "sort", "status", "created_at"}, Rows: [][]driver.Value{
			{int64(10), "测试人员", "worker", int64(2), int64(3), int64(0), int64(1), time.Date(2026, 9, 11, 10, 0, 0, 0, time.Local)},
		}}, userIOOrgStep(), userIORoleStep())
	svc := SysService{DB: db}
	raw, err := svc.ExportUsers(0, "")
	if err != nil {
		t.Fatal(err)
	}
	f, err := excelize.OpenReader(bytes.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	rows, err := f.GetRows(f.GetSheetName(0))
	if err != nil || len(rows) != 2 {
		t.Fatalf("rows=%v err=%v", rows, err)
	}
	idx, err := mapUserImportHeaders(rows[0])
	if err != nil {
		t.Fatal(err)
	}
	if cellAt(rows[1], idx[colRoleID]) != "test" || cellAt(rows[1], idx[colRole]) != "系统配置员" {
		t.Fatalf("角色导出错位: %v", rows)
	}
	if _, ok := idx[colSort]; !ok || cellAt(rows[1], idx[colSort]) != "0" {
		t.Fatalf("排序列未保留0值: %v", rows)
	}
	cell, _ := excelize.CoordinatesToCellName(idx[colRoleID]+1, 2)
	typ, err := f.GetCellType(f.GetSheetName(0), cell)
	if err != nil || (typ != excelize.CellTypeSharedString && typ != excelize.CellTypeInlineString) {
		t.Fatalf("角色ID必须以文本输出，type=%v err=%v", typ, err)
	}
}

func TestImportUsersReadsSortAndKeepsOldFiles(t *testing.T) {
	for _, tc := range []struct {
		name    string
		header  bool
		value   string
		want    int32
		failure bool
	}{
		{"旧文件无排序列", false, "", 100, false}, {"空值默认", true, "", 100, false},
		{"显式0", true, "0", 0, false}, {"负数", true, "-10", -10, false}, {"正数", true, "50", 50, false},
		{"小数", true, "1.5", 0, true}, {"越界", true, "2147483648", 0, true}, {"非数字", true, "bad", 0, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			headers := []string{colName, colPhone, colUsername, colOrg, colRoleID}
			cells := []any{"测试人员", "", "sort-worker", "测试街道", "test"}
			if tc.header {
				headers = append(headers, colSort)
				cells = append(cells, tc.value)
			}
			raw, err := xlsxutil.Export(headers, [][]any{cells})
			if err != nil {
				t.Fatal(err)
			}
			steps := []testutil.QueryStep{userIOOrgStep(), userIORoleStep()}
			if !tc.failure {
				steps = append(steps,
					testutil.QueryStep{Contains: "FROM `sys_users`", Columns: []string{"username"}},
					testutil.QueryStep{Kind: "begin"},
					testutil.QueryStep{Kind: "exec", Contains: "INSERT INTO `sys_users`", Check: checkInsertedUserSort(t, tc.want)},
					testutil.QueryStep{Kind: "commit"},
				)
			}
			count, err := (&SysService{DB: testutil.NewTransactionDB(t, steps...)}).ImportUsers(context.Background(), bytes.NewReader(raw))
			if tc.failure {
				if err == nil || !strings.Contains(err.Error(), "排序须为") || count != 0 {
					t.Fatalf("无效排序未阻止整批导入: count=%d err=%v", count, err)
				}
			} else if err != nil || count != 1 {
				t.Fatalf("导入排序失败: count=%d err=%v", count, err)
			}
		})
	}
}

func TestImportUsersResolvesActualExcelRoleColumns(t *testing.T) {
	for _, tc := range []struct {
		name      string
		headers   []string
		cells     []any
		wantID    int64
		errorText string
	}{
		{"同名按ID", []string{colRoleID, colRole}, []any{"3", "系统配置员"}, 3, ""},
		{"仅ID列", []string{colRoleID}, []any{"2"}, 2, ""},
		{"英文ID", []string{colRoleID, colRole}, []any{"test", "系统配置员"}, 3, ""},
		{"英文ID大小写", []string{colRoleID}, []any{" ADMIN-TEST "}, 2, ""},
		{"旧名称列", []string{colRole}, []any{"历史角色"}, 4, ""},
		{"重名不可盲选", []string{colRole}, []any{"系统配置员"}, 0, "请填写角色ID"},
		{"未知ID不可回退名称", []string{colRoleID, colRole}, []any{"bad", "历史角色"}, 0, "不存在"},
		{"非法ID不可回退名称", []string{colRoleID, colRole}, []any{"bad.name", "历史角色"}, 0, "以英文字母开头"},
		{"英文ID与名称冲突", []string{colRoleID, colRole}, []any{"test", "历史角色"}, 0, "不一致"},
		{"ID与名称冲突", []string{colRoleID, colRole}, []any{"3", "历史角色"}, 0, "不一致"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			headers := append([]string{colName, colPhone, colUsername, colOrg}, tc.headers...)
			cells := append([]any{"测试人员", "", "new_worker", "测试街道"}, tc.cells...)
			raw, err := xlsxutil.Export(headers, [][]any{cells})
			if err != nil {
				t.Fatal(err)
			}
			steps := []testutil.QueryStep{userIOOrgStep(), userIORoleStep()}
			if tc.errorText == "" {
				steps = append(steps, testutil.QueryStep{Contains: "FROM `sys_users`", Columns: []string{"username"}}, testutil.QueryStep{Kind: "begin"},
					testutil.QueryStep{Kind: "exec", Contains: "INSERT INTO `sys_users`", Check: func(query string, args []driver.NamedValue) {
						start, end := strings.Index(query, "("), strings.Index(query, ")")
						columns := strings.Split(query[start+1:end], ",")
						for i, column := range columns {
							if column == "`role_id`" && args[i].Value != tc.wantID {
								t.Errorf("导入分配到错误角色: %v", args[i].Value)
							}
						}
					}}, testutil.QueryStep{Kind: "commit"})
			}
			db := testutil.NewTransactionDB(t, steps...)
			svc := SysService{DB: db}
			count, err := svc.ImportUsers(context.Background(), bytes.NewReader(raw))
			if tc.errorText != "" {
				if err == nil || !strings.Contains(err.Error(), tc.errorText) || count != 0 {
					t.Fatalf("%d %v", count, err)
				}
			} else if err != nil || count != 1 {
				t.Fatalf("%d %v", count, err)
			}
		})
	}
}

func TestExportUsersWithoutBoundRoleKeepsEmptyRoleColumns(t *testing.T) {
	db := testutil.NewQueryDB(t,
		testutil.QueryStep{Contains: "FROM `sys_users`", Columns: []string{"id", "name", "username", "role_id"}, Rows: [][]driver.Value{
			{int64(10), "未绑定人员", "unbound", int64(0)},
			{int64(11), "历史人员", "legacy", int64(99)},
		}}, userIOOrgStep(), userIORoleStep())
	svc := SysService{DB: db}
	raw, err := svc.ExportUsers(0, "")
	if err != nil {
		t.Fatal(err)
	}
	f, err := excelize.OpenReader(bytes.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	rows, err := f.GetRows(f.GetSheetName(0))
	if err != nil || len(rows) != 3 {
		t.Fatalf("%v %v", rows, err)
	}
	idx, err := mapUserImportHeaders(rows[0])
	if err != nil {
		t.Fatal(err)
	}
	for _, row := range rows[1:] {
		if cellAt(row, idx[colRoleID]) != "" || cellAt(row, idx[colRole]) != "" {
			t.Fatalf("未绑定角色不应冒充英文ID: %v", row)
		}
	}
}
