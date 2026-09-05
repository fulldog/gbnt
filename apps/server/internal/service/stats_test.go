package service

import (
	"database/sql/driver"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"testing"

	"gbnt/apps/server/internal/testutil"
)

func statsQuerySteps(t *testing.T, values []int64) []testutil.QueryStep {
	t.Helper()
	filters := []string{"", "new", "pending", "done", "well", "road", "bridge", "forest", "transformer"}
	steps := make([]testutil.QueryStep, 0, len(values))
	for index, value := range values {
		steps = append(steps, testutil.QueryStep{
			Contains: "SELECT count(*) FROM `issues`", Columns: []string{"count"}, Rows: [][]driver.Value{{value}},
			Check: func(query string, args []driver.NamedValue) {
				// 成功与故障路径均必须保留软删除过滤，不借统计查询扩大可见记录。
				if !strings.Contains(query, "`issues`.`is_delete` = ?") || len(args) == 0 || args[len(args)-1].Value != int64(0) {
					t.Errorf("软删除条件缺失：%s %v", query, args)
				}
				if index == 0 {
					if len(args) != 1 {
						t.Errorf("总量不应叠加状态/类型过滤：%v", args)
					}
					return
				}
				column := "status"
				if index >= 4 {
					column = "type"
				}
				if !strings.Contains(query, column+" = ?") || len(args) != 2 || fmt.Sprint(args[0].Value) != filters[index] {
					t.Errorf("统计条件变化：%s %v", query, args)
				}
			},
		})
	}
	return steps
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
			db := testutil.NewQueryDB(t, statsQuerySteps(t, values)...)
			stats, err := (&IssueService{DB: db}).Stats()
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
	labels := []string{"total", "new", "pending", "done", "well", "road", "bridge", "forest", "transformer"}
	for index, label := range labels {
		t.Run(label, func(t *testing.T) {
			wantErr := errors.New("统计查询失败：" + label)
			values := []int64{10, 2, 3, 5, 4, 3, 1, 1, 1}
			steps := statsQuerySteps(t, values[:index+1])
			steps[index].Err = wantErr
			db := testutil.NewQueryDB(t, steps...)
			stats, err := (&IssueService{DB: db}).Stats()
			if !errors.Is(err, wantErr) || stats != nil {
				t.Fatalf("不能吞错或返回部分统计：stats=%+v err=%v", stats, err)
			}
		})
	}
}
