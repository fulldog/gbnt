package service

import (
	"context"
	"database/sql/driver"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"testing"

	"gbnt/apps/server/internal/testutil"
)

func statsAggregateStep(t *testing.T, values []int64, fail error) testutil.QueryStep {
	t.Helper()
	return testutil.QueryStep{
		Contains: "FROM `issues`",
		Columns:  []string{"total", "status_new", "status_pend", "status_done", "well", "road", "bridge", "forest", "transformer"},
		Rows:     [][]driver.Value{{values[0], values[1], values[2], values[3], values[4], values[5], values[6], values[7], values[8]}},
		Err:      fail,
		Check: func(query string, args []driver.NamedValue) {
			if !strings.Contains(query, "`issues`.`is_delete` = ?") || len(args) == 0 || args[len(args)-1].Value != int64(0) {
				t.Errorf("软删除条件缺失：%s %v", query, args)
			}
			if !strings.Contains(strings.ToUpper(query), "COUNT(*)") || !strings.Contains(query, "CASE WHEN status") || !strings.Contains(query, "CASE WHEN type") {
				t.Errorf("应一次聚合状态与类型：%s", query)
			}
			if strings.Contains(query, "count(*) FROM `issues`") && strings.Count(strings.ToLower(query), "count(*)") > 1 {
				t.Errorf("不应拆成多次 COUNT：%s", query)
			}
		},
	}
}

func TestStatsPreservesCountsRateAndEmptyResult(t *testing.T) {
	for _, empty := range []bool{false, true} {
		t.Run(fmt.Sprintf("空统计_%t", empty), func(t *testing.T) {
			values := []int64{10, 2, 3, 5, 4, 3, 1, 1, 1}
			wantRate := float64(50)
			if empty {
				values = make([]int64, 9)
				wantRate = 0
			}
			db := testutil.NewQueryDB(t, statsAggregateStep(t, values, nil))
			stats, err := (&IssueService{DB: db}).Stats(context.Background())
			if err != nil {
				t.Fatal(err)
			}
			want := map[string]interface{}{
				"total": values[0], "new": values[1], "pending": values[2], "done": values[3], "complete_rate": wantRate,
				"by_type": map[string]int64{"well": values[4], "road": values[5], "bridge": values[6], "forest": values[7], "transformer": values[8]},
			}
			if !reflect.DeepEqual(stats, want) {
				t.Fatalf("统计协议或口径变化：got=%+v want=%+v", stats, want)
			}
		})
	}
}

func TestStatsEveryCountFailureStopsWithoutPartialData(t *testing.T) {
	wantErr := errors.New("统计查询失败")
	db := testutil.NewQueryDB(t, statsAggregateStep(t, []int64{10, 2, 3, 5, 4, 3, 1, 1, 1}, wantErr))
	stats, err := (&IssueService{DB: db}).Stats(context.Background())
	if !errors.Is(err, wantErr) || stats != nil {
		t.Fatalf("不能吞错或返回部分统计：stats=%+v err=%v", stats, err)
	}
}
