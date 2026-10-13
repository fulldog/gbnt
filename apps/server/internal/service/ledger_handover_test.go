package service

import (
	"context"
	"database/sql/driver"
	"errors"
	"strings"
	"testing"

	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/testutil"
)

func TestHandoverInputRejectsInvalidValuesBeforeQuery(t *testing.T) {
	s := &IssueService{}
	for _, in := range []HandoverInput{
		{},
		{OrgID: 4, ProjectYear: 2019},
		{OrgID: 4, ProjectYear: 2024},
		{OrgID: 4, ProjectYear: 2023, WellHandover: -1},
		{OrgID: 4, ProjectYear: 2023, Remark: strings.Repeat("字", 256)},
	} {
		if _, err := s.CreateHandover(context.Background(), in); !errors.Is(err, ErrHandoverArgument) {
			t.Fatalf("应拒绝 %+v：%v", in, err)
		}
	}
}

func TestStreetLedgerUnionsHandoverWithoutReplacingReportedCounts(t *testing.T) {
	issues := []model.Issue{
		{OrgID: 4, ProjectYear: 2023, Type: "well", Status: "done", TypeExt: `{}`},
		{OrgID: 4, ProjectYear: 2023, Type: "forest", Status: "done", TypeExt: `{"handover_count":100,"existing_count":9}`},
	}
	handover := testutil.QueryStep{
		Contains: "FROM `org_handovers`",
		Columns:  []string{"id", "org_id", "project_year", "well_handover", "bridge_handover", "road_handover", "forest_handover", "transformer_handover", "remark"},
		Rows: [][]driver.Value{
			{int64(1), int64(4), int64(2023), int64(13), int64(8), int64(2), int64(50), int64(1), ""},
			{int64(2), int64(5), int64(2021), int64(3), int64(0), int64(0), int64(0), int64(0), "仅移交"},
		},
		Check: func(sql string, _ []driver.NamedValue) {
			if strings.Contains(sql, "created_at") {
				t.Fatal("移交数量不按上报日期过滤")
			}
		},
	}
	query := LedgerReportQuery{DateFrom: "2026-09-01", DateTo: "2026-09-05"}
	stats, err := (&IssueService{DB: testutil.NewQueryDB(t, reportOrgStep(), reportIssueStep(issues...), handover)}).LedgerStreetStatistics(context.Background(), query)
	if err != nil {
		t.Fatal(err)
	}
	if len(stats.Rows) != 2 || stats.Rows[0].RowKey != "2021:5" || stats.Rows[1].RowKey != "2023:4" {
		t.Fatalf("并集排序错误：%+v", stats.Rows)
	}
	only := stats.Rows[0]
	if only.SourceRecordCount != 0 || only.WellReportCount != 0 || only.RoadKM != nil || only.ForestExisting != nil || only.WellHandover == nil || *only.WellHandover != 3 || only.BridgeHandover == nil || *only.BridgeHandover != 0 || only.ForestHandover == nil || *only.ForestHandover != 0 || only.RoadHandover == nil || *only.RoadHandover != 0 {
		t.Fatalf("仅移交分组应保留 0 且不上报指标：%+v", only)
	}
	both := stats.Rows[1]
	if both.WellReportCount != 1 || both.SourceRecordCount != 2 || both.ForestExisting == nil || *both.ForestExisting != 9 || both.WellHandover == nil || *both.WellHandover != 13 || both.BridgeHandover == nil || *both.BridgeHandover != 8 || both.RoadHandover == nil || *both.RoadHandover != 2 || both.TransformerHandover == nil || *both.TransformerHandover != 1 || both.ForestHandover == nil || *both.ForestHandover != 50 || both.WellExisting != nil {
		t.Fatalf("上报条数应保留，林网移交株数应被移交表覆盖：%+v", both)
	}
	rows, err := (&IssueService{DB: testutil.NewQueryDB(t, reportOrgStep(), ledgerBaseStep(t, issues, true), handover)}).LedgerStreetRows(context.Background(), query)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows.Rows) != len(stats.Rows) || rows.Rows[0].RowKey != stats.Rows[0].RowKey || rows.Rows[1].RowKey != stats.Rows[1].RowKey || rows.Rows[0].ProjectYear == nil || *rows.Rows[0].ProjectYear != 2021 {
		t.Fatalf("基础行应并入仅有移交数量的组织：%+v", rows.Rows)
	}
}
