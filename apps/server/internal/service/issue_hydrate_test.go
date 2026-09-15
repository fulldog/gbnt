package service

import (
	"context"
	"database/sql/driver"
	"strings"
	"testing"
	"time"

	"gbnt/apps/server/internal/testutil"
)

func TestListBatchesRectifyRecords(t *testing.T) {
	db := testutil.NewQueryDB(t,
		testutil.QueryStep{Contains: "count(*)", Columns: []string{"count"}, Rows: [][]driver.Value{{int64(2)}}},
		testutil.QueryStep{Contains: "FROM `issues`", Columns: []string{"id", "type", "type_ext"}, Rows: [][]driver.Value{
			{int64(1), "well", "{}"}, {int64(2), "well", "{}"},
		}},
		testutil.QueryStep{
			Contains: "FROM `issue_rectify_records`",
			Columns:  []string{"id", "issue_id", "round", "photo_file_ids", "created_at"},
			Rows: [][]driver.Value{
				{int64(11), int64(1), int64(1), `["p1"]`, time.Unix(1, 0)},
				{int64(12), int64(2), int64(1), `["p2"]`, time.Unix(2, 0)},
			},
			Check: func(query string, args []driver.NamedValue) {
				if !strings.Contains(query, "issue_id IN") {
					t.Errorf("整改记录必须按本页 issue_id IN 一次查出：%s", query)
				}
			},
		},
	)
	list, total, err := (&IssueService{DB: db}).List(context.Background(), IssueQuery{Page: 1, Size: 20})
	if err != nil {
		t.Fatal(err)
	}
	if total != 2 || len(list) != 2 || len(list[0].RectifyRecords) != 1 || len(list[1].RectifyRecords) != 1 {
		t.Fatalf("批量装配失败：total=%d list=%+v", total, list)
	}
}

func TestGetUsesRequestContextForIssueQuery(t *testing.T) {
	db := testutil.NewQueryDB(t,
		testutil.QueryStep{Contains: "FROM `issues`", Columns: []string{"id", "type", "type_ext"}, Rows: [][]driver.Value{{int64(9), "well", "{}"}}},
		testutil.QueryStep{Contains: "FROM `issue_rectify_records`", Columns: []string{"id", "issue_id"}},
	)
	item, err := (&IssueService{DB: db}).Get(context.Background(), 9)
	if err != nil || item == nil || item.ID != 9 {
		t.Fatalf("详情读取失败：%+v %v", item, err)
	}
}

func TestLedgerStreetUsesCreatedAtRange(t *testing.T) {
	db := testutil.NewQueryDB(t, testutil.QueryStep{
		Contains: "GROUP BY",
		Columns:  []string{"org_id", "type", "total", "pending", "done"},
		Check: func(query string, args []driver.NamedValue) {
			if strings.Contains(query, "DATE(created_at)") {
				t.Errorf("日期条件不能包 DATE(created_at)：%s", query)
			}
			if !strings.Contains(query, "created_at >= ?") || !strings.Contains(query, "DATE_ADD") {
				t.Errorf("应为 created_at 半开区间：%s", query)
			}
			if len(args) < 3 || args[0].Value != "2026-01-01" || args[1].Value != "2026-09-01" {
				t.Errorf("日期绑定错误：%v", args)
			}
		},
	})
	if _, err := (&IssueService{DB: db}).LedgerStreet(context.Background(), 0, "2026-01-01", "2026-09-01"); err != nil {
		t.Fatal(err)
	}
}
