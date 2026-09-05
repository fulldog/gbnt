package service

import (
	"context"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/testutil"
)

func reportTestOrgs() []model.SysOrg {
	return []model.SysOrg{
		{Base: model.Base{ID: 1}, Type: model.OrgTypeRoot, Name: "平台"},
		{Base: model.Base{ID: 3}, ParentID: 1, Type: model.OrgTypeStreet, Name: "测试街道"},
		{Base: model.Base{ID: 4}, ParentID: 3, Type: model.OrgTypeVillage, Name: "测试新村"},
		{Base: model.Base{ID: 5}, ParentID: 3, Type: model.OrgTypeVillage, Name: "另一社区"},
	}
}

func reportOrgStep() testutil.QueryStep {
	rows := [][]driver.Value{}
	for _, org := range reportTestOrgs() {
		rows = append(rows, []driver.Value{int64(org.ID), int64(org.ParentID), org.Name, string(org.Type)})
	}
	return testutil.QueryStep{Contains: "FROM `sys_orgs`", Columns: []string{"id", "parent_id", "name", "type"}, Rows: rows}
}

func reportIssueStep(issues ...model.Issue) testutil.QueryStep {
	rows := [][]driver.Value{}
	for _, issue := range issues {
		rows = append(rows, []driver.Value{int64(issue.ID), int64(issue.OrgID), int64(issue.ProjectYear), issue.Type, issue.Status, issue.TypeExt})
	}
	return testutil.QueryStep{Contains: "FROM `issues`", Columns: []string{"id", "org_id", "project_year", "type", "status", "type_ext"}, Rows: rows}
}

func TestStreetReportGroupsAndPreservesUncollectedValues(t *testing.T) {
	issues := []model.Issue{
		{OrgID: 4, ProjectYear: 2023, Type: "road", TypeExt: `{"length":1.25}`},
		{OrgID: 4, ProjectYear: 2023, Type: "road", TypeExt: `{"length":0.5}`},
		{OrgID: 4, ProjectYear: 2023, Type: "forest", TypeExt: `{"handover_count":100,"existing_count":0}`},
		{OrgID: 4, ProjectYear: 2023, Type: "well", TypeExt: `{}`},
		{OrgID: 5, ProjectYear: 2020, Type: "road", TypeExt: `{"length":2}`},
		{OrgID: 999, ProjectYear: 0, Type: "well", TypeExt: `{}`},
	}
	s := &IssueService{DB: testutil.NewQueryDB(t, reportOrgStep(), reportIssueStep(issues...))}
	result, err := s.LedgerStreetReport(context.Background(), LedgerReportQuery{})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Rows) != 3 || result.Rows[0].OrgID != 999 || result.Rows[1].OrgID != 5 || result.Rows[2].OrgID != 4 {
		t.Fatalf("排序及缺失关联记录：%+v", result.Rows)
	}
	row := result.Rows[2]
	if row.RoadKM == nil || *row.RoadKM != 1.75 || row.ForestHandover == nil || *row.ForestHandover != 100 || row.ForestExisting == nil || *row.ForestExisting != 0 {
		t.Fatalf("已采集字段未正确汇总：%+v", row)
	}
	if *row.StreetName != "测试街道" || *row.VillageName != "测试新村" || row.SourceRecordCount != 4 {
		t.Fatalf("组织及来源条数：%+v", row)
	}
	if row.WellExisting != nil || row.WellHandover != nil || row.Signer != nil || row.NaturalVillage != nil {
		t.Fatal("未采集量不得拿记录数补齐")
	}
	if result.Rows[0].OrgName != nil || result.Rows[0].StreetName != nil || result.Rows[0].ProjectYear != nil {
		t.Fatal("缺失字段应保持 null")
	}
	encoded, _ := json.Marshal(row)
	for _, fragment := range []string{`"well_existing":null`, `"natural_village":null`, `"forest_existing":0`} {
		if !strings.Contains(string(encoded), fragment) {
			t.Fatalf("响应丢失 null/0 区分：%s", encoded)
		}
	}
}

func TestReportedMetricUnknownDoesNotBecomePartialSum(t *testing.T) {
	for _, ext := range []string{`{}`, `{"length":null}`, `{"length":"3"}`, `{"length":-1}`, `bad-json`} {
		if result := sumReportedMetric([]model.Issue{{Type: "road", TypeExt: `{"length":2}`}, {Type: "road", TypeExt: ext}}, "road", "length"); result != nil {
			t.Errorf("%s 不得部分汇总为 %v", ext, *result)
		}
	}
	if sumReportedMetric(nil, "road", "length") != nil {
		t.Fatal("没有道路不能算零千米")
	}
}

func reportChecklist(typ string, abnormal bool) string {
	quiz := []map[string]any{}
	for i, spec := range checklistSpecsFor(typ) {
		value := !spec.Negative
		if abnormal && i == 0 {
			value = !value
		}
		quiz = append(quiz, map[string]any{"type": spec.Type, "value": value})
	}
	ext := map[string]any{"checklist": quiz, "outlet_total": 2, "outlet_damaged": 0, "casing_total": 2, "casing_damaged": 0}
	encoded, _ := json.Marshal(ext)
	return string(encoded)
}

func TestSurveyReportCountsOnlyKnownAbnormalRecords(t *testing.T) {
	issues := []model.Issue{
		{OrgID: 4, Type: "well", Status: "done", TypeExt: reportChecklist("well", false)},
		{OrgID: 4, Type: "well", Status: "new", RectifyRound: 2, TypeExt: reportChecklist("well", true)},
		{OrgID: 4, Type: "well", Status: "done", RectifyRound: 5, TypeExt: reportChecklist("well", true)},
		{OrgID: 4, Type: "bridge", Status: "done", TypeExt: reportChecklist("bridge", true)},
		{OrgID: 4, Type: "road", Status: "done", TypeExt: `{}`},
	}
	s := &IssueService{DB: testutil.NewQueryDB(t, reportOrgStep(), reportIssueStep(issues...))}
	result, err := s.LedgerSurveyReport(context.Background(), LedgerReportQuery{})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Rows) != 1 {
		t.Fatalf("应按村聚合：%+v", result.Rows)
	}
	row := result.Rows[0]
	if *row.WellProblemCount != 2 || *row.WellRectifiedCount != 1 || *row.BridgeProblemCount != 1 || *row.BridgeRectifiedCount != 1 {
		t.Fatalf("正常完成、多轮统计不正确：%+v", row)
	}
	if row.RoadProblemCount != nil || row.RoadRectifiedCount != nil {
		t.Fatal("坏清单不能被算为零问题/已整改")
	}
	if row.WellInspected != nil || row.WellNormal != nil || row.SurveyDone != nil || row.ContactName != nil {
		t.Fatal("无全量资产/排查基线，不允许编造全面完成与总数")
	}
}

func TestReportProblemStateUsesCurrentChecklistAndDamagedCounts(t *testing.T) {
	initial := model.Issue{Type: "well", Status: "done", TypeExt: reportChecklist("well", false)}
	if problem, known := reportProblemState(initial); problem || !known {
		t.Fatal("原先正常完成不得记问题")
	}
	initial.TypeExt = strings.Replace(initial.TypeExt, `"outlet_damaged":0`, `"outlet_damaged":1`, 1)
	if problem, known := reportProblemState(initial); !problem || !known {
		t.Fatal("后续保存的损坏数须参与当前快照")
	}
	for _, ext := range []string{`{"checklist":[{"type":"needs_rectify"}]}`, `{"checklist":[{"type":"needs_rectify","value":true},{"type":"needs_rectify","value":true}]}`, `{"checklist":[]}`} {
		if _, known := reportProblemState(model.Issue{Type: "bridge", TypeExt: ext}); known {
			t.Errorf("坏清单不可判定：%s", ext)
		}
	}
}

func TestLedgerReportFiltersAndErrors(t *testing.T) {
	step := reportIssueStep()
	step.Check = func(query string, args []driver.NamedValue) {
		for _, fragment := range []string{"org_id IN", "created_at >=", "created_at <", "is_delete"} {
			if !strings.Contains(query, fragment) {
				t.Errorf("缺少过滤 %s：%s", fragment, query)
			}
		}
		boundaries := []time.Time{}
		for _, arg := range args {
			if value, ok := arg.Value.(time.Time); ok {
				boundaries = append(boundaries, value)
			}
		}
		if len(boundaries) != 2 {
			t.Fatalf("日期必须绑定 time.Time，不应使用裸字符串：%v", args)
		}
		for i, boundary := range boundaries {
			_, offset := boundary.Zone()
			if offset != 8*60*60 {
				t.Errorf("边界 %d 必须以 +08:00 构造：%v", i, boundary)
			}
		}
		if boundaries[0].Format(time.RFC3339) != "2026-09-01T00:00:00+08:00" || boundaries[0].UTC().Format(time.RFC3339) != "2026-08-31T16:00:00Z" {
			t.Errorf("开始日北京时间与 UTC instant 错误：%v", boundaries[0])
		}
		if boundaries[1].Format(time.RFC3339) != "2026-09-06T00:00:00+08:00" || boundaries[1].UTC().Format(time.RFC3339) != "2026-09-05T16:00:00Z" {
			t.Errorf("结束日应为次日北京时间零点排他边界：%v", boundaries[1])
		}
	}
	s := &IssueService{DB: testutil.NewQueryDB(t, reportOrgStep(), step)}
	result, err := s.LedgerStreetReport(context.Background(), LedgerReportQuery{StreetOrgID: 3, DateFrom: "2026-09-01", DateTo: "2026-09-05"})
	if err != nil || result.Rows == nil || len(result.Rows) != 0 || result.StreetOrgID != 3 {
		t.Fatalf("空报表：%+v %v", result, err)
	}
	for _, query := range []LedgerReportQuery{{DateFrom: "2026-02-30"}, {DateFrom: "2026-09-05", DateTo: "2026-09-01"}} {
		if _, err := (&IssueService{}).LedgerStreetReport(context.Background(), query); !errors.Is(err, ErrLedgerReportArgument) {
			t.Errorf("应拒绝非法日期：%v", err)
		}
	}
	badStreet := &IssueService{DB: testutil.NewQueryDB(t, reportOrgStep())}
	if _, err := badStreet.LedgerSurveyReport(context.Background(), LedgerReportQuery{StreetOrgID: 4}); !errors.Is(err, ErrLedgerReportArgument) {
		t.Fatal("村 ID 不可伪装街道")
	}
	failed := reportIssueStep()
	failed.Err = errors.New("query unavailable")
	if result, err := (&IssueService{DB: testutil.NewQueryDB(t, reportOrgStep(), failed)}).LedgerSurveyReport(context.Background(), LedgerReportQuery{}); err == nil || result != nil {
		t.Fatal("查询失败不得部分成功")
	}
}
