package service

import (
	"context"
	"database/sql/driver"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"gbnt/apps/server/internal/testutil"
)

func TestWorkbenchTrendCalendarWindows(t *testing.T) {
	now := time.Date(2026, 1, 1, 16, 30, 0, 0, time.UTC) // 北京时间 1 月 2 日
	for _, test := range []struct {
		value, granularity, first, last string
		count                           int
	}{
		{"week7", "day", "2025-12-27", "2026-01-02", 7},
		{"month1", "day", "2025-12-04", "2026-01-02", 30},
		{"halfyear", "month", "2025-08", "2026-01", 6},
		{"all", "year", "2026", "2026", 1},
	} {
		t.Run(test.value, func(t *testing.T) {
			result, _, err := workbenchTrendWindow(test.value, now)
			if err != nil || result.Granularity != test.granularity || len(result.Points) != test.count || result.Points[0].Period != test.first || result.Points[test.count-1].Period != test.last {
				t.Fatalf("自然日/月/年边界错误：%+v %v", result, err)
			}
		})
	}
	if _, _, err := workbenchTrendWindow("unknown", now); err == nil {
		t.Fatal("非法范围必须拒绝")
	}
}

func TestWorkbenchTrendUsesShanghaiDatesAndCurrentRoundSQL(t *testing.T) {
	now := time.Date(2026, 1, 2, 10, 0, 0, 0, time.UTC)
	reported := time.Date(2025, 12, 31, 16, 1, 0, 0, time.UTC)
	completed := time.Date(2026, 1, 1, 16, 1, 0, 0, time.UTC)
	db := testutil.NewQueryDB(t, testutil.QueryStep{Contains: "SELECT issues.created_at", Columns: []string{"created_at", "status", "completed_at"},
		Rows: [][]driver.Value{{reported, "done", completed}, {reported, "done", nil}, {reported, "pending", completed}, {now.Add(time.Hour), "new", nil}},
		Check: func(query string, args []driver.NamedValue) {
			for _, expected := range []string{"MAX(r.created_at)", "r.round = issues.rectify_round", "r.is_delete = 0", "`issues`.`is_delete` = ?", "issues.created_at >= ? OR issues.status = ?"} {
				if !strings.Contains(query, expected) {
					t.Errorf("遗漏当前轮次/软删除/范围保护 %q：%s", expected, query)
				}
			}
			if args[0].Value.(time.Time).Format("2006-01-02 -0700") != "2025-12-27 +0800" {
				t.Errorf("查询日期不是北京自然日：%v", args)
			}
		},
	})
	result, err := (&IssueService{DB: db}).WorkbenchTrend(context.Background(), "week7", now)
	if err != nil {
		t.Fatal(err)
	}
	if result.UndatedCompleted != 1 || result.Points[5].Reported != 3 || result.Points[6].Completed != 1 || result.Points[6].Reported != 0 {
		t.Fatalf("趋势计数或未知日期错误：%+v", result)
	}
}

func TestWorkbenchTrendAllYearsAndEmptyPoints(t *testing.T) {
	now := time.Date(2026, 9, 5, 0, 0, 0, 0, time.UTC)
	for _, empty := range []bool{false, true} {
		t.Run(fmt.Sprint(empty), func(t *testing.T) {
			rows := [][]driver.Value{}
			if !empty {
				rows = append(rows, []driver.Value{now.AddDate(-3, 0, 0), "done", now.AddDate(-1, 0, 0)})
			}
			db := testutil.NewQueryDB(t, testutil.QueryStep{Contains: "SELECT issues.created_at", Columns: []string{"created_at", "status", "completed_at"}, Rows: rows})
			result, err := (&IssueService{DB: db}).WorkbenchTrend(context.Background(), "all", now)
			if err != nil {
				t.Fatal(err)
			}
			if empty {
				if len(result.Points) != 1 || result.Points[0].Period != "2026" {
					t.Fatalf("空趋势仍需当前年：%+v", result)
				}
				return
			}
			if len(result.Points) != 3 || result.Points[0].Period != "2023" || result.Points[1].Period != "2025" || result.Points[2].Period != "2026" {
				t.Fatalf("全部范围年度排序错误：%+v", result)
			}
		})
	}
}

func TestWorkbenchTrendQueryAndScanErrorsDoNotReturnPartialData(t *testing.T) {
	for _, scan := range []bool{false, true} {
		t.Run(fmt.Sprint(scan), func(t *testing.T) {
			step := testutil.QueryStep{Contains: "SELECT issues.created_at", Err: errors.New("数据库故障")}
			if scan {
				step.Err = nil
				step.Columns = []string{"created_at", "status", "completed_at"}
				step.Rows = [][]driver.Value{{"invalid time", "done", nil}}
			}
			db := testutil.NewQueryDB(t, step)
			result, err := (&IssueService{DB: db}).WorkbenchTrend(context.Background(), "week7", time.Now())
			if err == nil || result != nil {
				t.Fatalf("错误不可返回部分/零统计：%+v %v", result, err)
			}
		})
	}
}

func TestWorkbenchTodosLightweightDisplayDeadlineAndPagination(t *testing.T) {
	now := time.Date(2026, 1, 1, 16, 30, 0, 0, time.UTC)
	checkFilter := func(query string, args []driver.NamedValue) {
		if !strings.Contains(query, "status IN (?,?)") || !strings.Contains(query, "`issues`.`is_delete` = ?") || args[0].Value != "new" || args[1].Value != "pending" {
			t.Errorf("待办状态/软删条件缺失：%s %v", query, args)
		}
	}
	db := testutil.NewQueryDB(t,
		testutil.QueryStep{Contains: "count(*)", Columns: []string{"count"}, Rows: [][]driver.Value{{int64(4)}}, Check: checkFilter},
		testutil.QueryStep{Contains: "SELECT id, issue_key, code, type, status, org_id, assignee_user, plan_date", Columns: []string{"id", "issue_key", "code", "type", "status", "org_id", "assignee_user", "plan_date"}, Rows: [][]driver.Value{
			{int64(1), "ISSUE-1", "WELL-1", "well", "new", int64(5), int64(7), "2025-12-31"},
			{int64(2), "ISSUE-2", "", "road", "pending", int64(0), int64(0), "2026-01-02"},
			{int64(3), "ISSUE-3", "", "road", "new", int64(0), int64(0), ""},
			{int64(4), "ISSUE-4", "", "road", "new", int64(0), int64(0), "2026-02-30"},
		}, Check: func(query string, args []driver.NamedValue) {
			checkFilter(query, args)
			if !strings.Contains(query, "plan_date ASC, id DESC LIMIT ? OFFSET ?") {
				t.Errorf("排序/分页丢失：%s", query)
			}
		}},
		testutil.QueryStep{Contains: "FROM `sys_users`", Columns: []string{"id", "name", "username"}, Rows: [][]driver.Value{{int64(7), "张三", "worker"}}},
		testutil.QueryStep{Contains: "FROM `sys_orgs`", Columns: []string{"id", "name", "parent_id"}, Rows: [][]driver.Value{{int64(5), "南村", int64(6)}}},
		testutil.QueryStep{Contains: "FROM `sys_orgs`", Columns: []string{"id", "name", "parent_id"}, Rows: [][]driver.Value{{int64(6), "北城街道", int64(0)}}},
	)
	result, err := (&IssueService{DB: db}).WorkbenchTodos(context.Background(), 2, 2, now)
	if err != nil {
		t.Fatal(err)
	}
	if result.Today != "2026-01-02" || result.Page != 2 || result.Size != 2 || *result.List[0].DaysLeft != -2 || *result.List[1].DaysLeft != 0 || result.List[2].DaysLeft != nil || result.List[3].DaysLeft != nil {
		t.Fatalf("日期/分页/无期限错误：%+v", result)
	}
	if *result.List[0].OrgPath != "北城街道 / 南村" || *result.List[0].AssigneeUserName != "张三" || result.List[1].OrgPath != nil {
		t.Fatalf("关联展示错误：%+v", result.List)
	}
}

func TestWorkbenchTodosErrorsDoNotReturnEmptySuccess(t *testing.T) {
	for index := 0; index < 3; index++ {
		t.Run(fmt.Sprint(index), func(t *testing.T) {
			steps := []testutil.QueryStep{
				{Contains: "count(*)", Columns: []string{"count"}, Rows: [][]driver.Value{{int64(1)}}},
				{Contains: "SELECT id, issue_key", Columns: []string{"id", "assignee_user"}, Rows: [][]driver.Value{{int64(1), int64(2)}}},
				{Contains: "FROM `sys_users`"},
			}
			steps[index].Err = errors.New("读取失败")
			db := testutil.NewQueryDB(t, steps[:index+1]...)
			result, err := (&IssueService{DB: db}).WorkbenchTodos(context.Background(), 1, 20, time.Now())
			if err == nil || result != nil {
				t.Fatalf("错误不可返回空成功：%+v %v", result, err)
			}
		})
	}
}
