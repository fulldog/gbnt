package service

import (
	"context"
	"database/sql/driver"
	"encoding/json"
	"strings"
	"testing"

	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/testutil"
)

func TestStreetReportedCountsReflectRecordChanges(t *testing.T) {
	seed := []model.Issue{
		{Type: "well", Code: "同一设施", Status: "new"},
		{Type: "well", Code: "同一设施", Status: "pending", RectifyRound: 5},
		{Type: "well", Status: "done"},
		{Type: "bridge", Status: "new", TypeExt: `{"kind":"bridge"}`},
		{Type: "bridge", Status: "pending", TypeExt: `{"kind":"culvert"}`},
		{Type: "bridge", Status: "done", TypeExt: `{"kind":"gate"}`},
		{Type: "transformer", Status: "new"},
		{Type: "transformer", Status: "pending"},
		{Type: "transformer", Status: "done", RectifyRound: 8},
		{Type: "road", TypeExt: `{"length":1.25,"tree_survive":10}`},
		{Type: "road", TypeExt: `{"length":0.75,"tree_survive":20}`},
		{Type: "forest", TypeExt: `{"handover_count":100,"existing_count":80}`},
	}
	cases := []struct {
		name   string
		change func([]model.Issue) []model.Issue
		source int64
		well   int64
		bridge int64
		trans  int64
		road   float64
		trees  float64
	}{
		{"全部状态和重复设施编号仍按上报条数", nil, 12, 3, 3, 3, 2, 30},
		{"新增上报", func(rows []model.Issue) []model.Issue {
			return append(rows, model.Issue{Type: "transformer", Status: "new"})
		}, 13, 3, 3, 4, 2, 30},
		{"删除上报后只计未删除查询结果", func(rows []model.Issue) []model.Issue {
			return rows[1:]
		}, 11, 2, 3, 3, 2, 30},
		{"编辑设施类型", func(rows []model.Issue) []model.Issue {
			rows[0].Type = "transformer"
			return rows
		}, 12, 2, 3, 4, 2, 30},
		{"整改和轮次变化不增加记录", func(rows []model.Issue) []model.Issue {
			rows[0].Status, rows[0].RectifyRound = "done", 10
			return rows
		}, 12, 3, 3, 3, 2, 30},
		{"编辑道路长度与附属树木", func(rows []model.Issue) []model.Issue {
			rows[9].TypeExt = `{"length":3.25,"tree_survive":15}`
			return rows
		}, 12, 3, 3, 3, 4, 35},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			issues := append([]model.Issue(nil), seed...)
			if tc.change != nil {
				issues = tc.change(issues)
			}
			for i := range issues {
				issues[i].OrgID, issues[i].ProjectYear = 4, 2023
			}
			step := reportIssueStep(issues...)
			step.Check = func(query string, _ []driver.NamedValue) {
				if !strings.Contains(query, "is_delete") || strings.Contains(query, "JOIN") || strings.Contains(query, "status =") {
					t.Errorf("统计只读取未删除主记录，不按状态过滤或关联多条整改明细：%s", query)
				}
			}
			svc := &IssueService{DB: testutil.NewQueryDB(t, reportOrgStep(), step)}
			result, err := svc.LedgerStreetStatistics(context.Background(), LedgerReportQuery{})
			if err != nil || len(result.Rows) != 1 {
				t.Fatalf("统计行错误：%+v %v", result, err)
			}
			row := result.Rows[0]
			if row.SourceRecordCount != tc.source || row.WellReportCount != tc.well || row.BridgeReportCount != tc.bridge || row.TransformerReportCount != tc.trans {
				t.Fatalf("上报记录计数错误：%+v", row)
			}
			if row.RoadKM == nil || *row.RoadKM != tc.road || row.RoadTreeSurvive == nil || *row.RoadTreeSurvive != tc.trees || row.ForestExisting == nil || *row.ForestExisting != 80 || row.ForestHandover == nil || *row.ForestHandover != 100 {
				t.Fatalf("道路与独立林网指标应分别汇总：%+v", row)
			}
			if row.WellExisting != nil || row.BridgeExisting != nil || row.TransformerExisting != nil || row.WellHandover != nil {
				t.Fatal("上报条数不能填充资产或移交字段")
			}
		})
	}
}

func TestStreetRoadTreesPreserveUnknownAndZero(t *testing.T) {
	for _, ext := range []string{`{}`, `{"tree_survive":null}`, `{"tree_survive":"3"}`, `{"tree_survive":-1}`, `{"tree_survive":1e400}`, `bad-json`} {
		t.Run(ext, func(t *testing.T) {
			issues := []model.Issue{
				{OrgID: 4, Type: "road", TypeExt: `{"length":2,"tree_survive":10}`},
				{OrgID: 4, Type: "road", TypeExt: ext},
				{OrgID: 4, Type: "forest", TypeExt: `{"handover_count":10,"existing_count":8}`},
				{OrgID: 4, Type: "well"},
			}
			svc := &IssueService{DB: testutil.NewQueryDB(t, reportOrgStep(), reportIssueStep(issues...))}
			result, err := svc.LedgerStreetReport(context.Background(), LedgerReportQuery{})
			if err != nil {
				t.Fatal(err)
			}
			row := result.Rows[0]
			if row.RoadTreeSurvive != nil || row.WellReportCount != 1 || row.ForestExisting == nil || *row.ForestExisting != 8 {
				t.Fatalf("不完整树木数据不可部分求和，也不影响独立指标：%+v", row)
			}
		})
	}
	for _, typ := range []string{"road", "forest"} {
		svc := &IssueService{DB: testutil.NewQueryDB(t, reportOrgStep(), reportIssueStep(model.Issue{OrgID: 4, Type: typ, TypeExt: `{"length":0,"tree_survive":0,"existing_count":0,"handover_count":0}`}))}
		result, err := svc.LedgerStreetStatistics(context.Background(), LedgerReportQuery{})
		if err != nil {
			t.Fatal(err)
		}
		encoded, _ := json.Marshal(result.Rows[0])
		want := `"road_tree_survive":null`
		if typ == "road" {
			want = `"road_tree_survive":0`
		}
		for _, field := range []string{want, `"well_report_count":0`, `"bridge_report_count":0`, `"transformer_report_count":0`} {
			if !strings.Contains(string(encoded), field) {
				t.Fatalf("零值和未知值的 HTTP 字段应明确区分：%s", encoded)
			}
		}
	}
}
