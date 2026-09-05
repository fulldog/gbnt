package service

import (
	"context"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"reflect"
	"strings"
	"testing"
	"time"

	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/testutil"
)

func TestParseLedgerSplitQuery(t *testing.T) {
	for _, raw := range []string{"", "street_org_id=", "street_org_id=0", "street_org_id=003", "street_org_id=9007199254740991", "date_from=2024-02-29", "date_to=2026-09-05"} {
		values, err := url.ParseQuery(raw)
		if err != nil {
			t.Fatal(err)
		}
		q, err := ParseLedgerSplitQuery(values)
		if err != nil {
			t.Errorf("合法参数 %q：%v", raw, err)
		}
		if raw == "street_org_id=003" && q.StreetOrgID != 3 {
			t.Fatal("前导零未规范化")
		}
	}
	for _, raw := range []string{"street_org_id=-1", "street_org_id=1.2", "street_org_id=1e3", "street_org_id=%2B3", "street_org_id=+3", "street_org_id=null", "street_org_id=9007199254740992", "street_org_id=18446744073709551616", "street_org_id=3&street_org_id=3", "date_from=&date_from=", "unused=", "date_from=2026-02-30", "date_from=2026-2-01", "date_to=null", "date_to=2026-09-05+", "date_from=2026-09-06&date_to=2026-09-05"} {
		values, err := url.ParseQuery(raw)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := ParseLedgerSplitQuery(values); !errors.Is(err, ErrLedgerReportArgument) {
			t.Errorf("应拒绝 %q：%v", raw, err)
		}
	}
	if _, err := ParseLedgerSplitQuery(url.Values{"date_from": nil}); !errors.Is(err, ErrLedgerReportArgument) {
		t.Fatal("无值数组也应拒绝")
	}
}

func goldenLedgerIssues() []model.Issue {
	road := func(length float64) string {
		var ext map[string]any
		_ = json.Unmarshal([]byte(reportChecklist("road", false)), &ext)
		ext["length"] = length
		encoded, _ := json.Marshal(ext)
		return string(encoded)
	}
	return []model.Issue{
		{OrgID: 4, ProjectYear: 2023, Type: "road", Status: "done", TypeExt: road(1.25)},
		{OrgID: 4, ProjectYear: 2023, Type: "road", Status: "done", TypeExt: road(0.5)},
		{OrgID: 4, ProjectYear: 2023, Type: "forest", Status: "done", TypeExt: `{"handover_count":100,"existing_count":0}`},
		{OrgID: 4, ProjectYear: 2023, Type: "well", Status: "done", TypeExt: reportChecklist("well", true)},
		{OrgID: 4, ProjectYear: 2023, Type: "well", Status: "new", TypeExt: reportChecklist("well", true)},
		{OrgID: 4, ProjectYear: 2023, Type: "well", Status: "done", TypeExt: reportChecklist("well", false)},
		{OrgID: 4, ProjectYear: 2024, Type: "road", Status: "done", TypeExt: road(2)},
	}
}

func goldenOrgStep(orgs []model.SysOrg) testutil.QueryStep {
	rows := [][]driver.Value{}
	for _, org := range orgs {
		rows = append(rows, []driver.Value{int64(org.ID), int64(org.ParentID), org.Name, string(org.Type)})
	}
	return testutil.QueryStep{Contains: "FROM `sys_orgs`", Columns: []string{"id", "parent_id", "name", "type"}, Rows: rows}
}

func ledgerBaseStep(t *testing.T, issues []model.Issue, withYear bool) testutil.QueryStep {
	t.Helper()
	rows := [][]driver.Value{}
	seen := map[string]bool{}
	for _, issue := range issues {
		year := 0
		if withYear {
			year = issue.ProjectYear
		}
		key := fmt.Sprintf("%d:%d", year, issue.OrgID)
		if seen[key] {
			continue
		}
		seen[key] = true
		row := []driver.Value{int64(issue.OrgID)}
		if withYear {
			row = append(row, int64(year))
		}
		rows = append(rows, row)
	}
	columns := []string{"org_id"}
	if withYear {
		columns = append(columns, "project_year")
	}
	return testutil.QueryStep{Contains: "SELECT DISTINCT", Columns: columns, Rows: rows, Check: func(query string, _ []driver.NamedValue) {
		if strings.Contains(query, "type_ext") || strings.Contains(query, "`status`") || strings.Contains(query, " LIMIT ") {
			t.Errorf("基础查询不得读取大字段/统计或截断：%s", query)
		}
		if !strings.Contains(query, "is_delete") {
			t.Errorf("不得跳过软删除：%s", query)
		}
		if !withYear && strings.Contains(query, "project_year") {
			t.Errorf("排查基础查询不按年度拆行：%s", query)
		}
	}}
}

type goldenLedgerResult struct {
	streetBase  *LedgerPartResult[StreetLedgerBaseRow]
	streetStats *LedgerPartResult[StreetLedgerStatisticsRow]
	surveyBase  *LedgerPartResult[SurveyLedgerBaseRow]
	surveyStats *LedgerPartResult[SurveyLedgerStatisticsRow]
}

func loadGoldenLedger(t *testing.T, issues []model.Issue, orgs []model.SysOrg, q LedgerReportQuery) goldenLedgerResult {
	t.Helper()
	newService := func(step testutil.QueryStep) *IssueService {
		return &IssueService{DB: testutil.NewQueryDB(t, goldenOrgStep(orgs), step)}
	}
	ctx := context.Background()
	sb, err := newService(ledgerBaseStep(t, issues, true)).LedgerStreetRows(ctx, q)
	if err != nil {
		t.Fatal(err)
	}
	ss, err := newService(reportIssueStep(issues...)).LedgerStreetStatistics(ctx, q)
	if err != nil {
		t.Fatal(err)
	}
	vb, err := newService(ledgerBaseStep(t, issues, false)).LedgerSurveyRows(ctx, q)
	if err != nil {
		t.Fatal(err)
	}
	vs, err := newService(reportIssueStep(issues...)).LedgerSurveyStatistics(ctx, q)
	if err != nil {
		t.Fatal(err)
	}
	// 兼容对比只是第二条证据；下面各用例另外写死人工预期。
	oldStreet, err := newService(reportIssueStep(issues...)).LedgerStreetReport(ctx, q)
	if err != nil {
		t.Fatal(err)
	}
	oldSurvey, err := newService(reportIssueStep(issues...)).LedgerSurveyReport(ctx, q)
	if err != nil {
		t.Fatal(err)
	}
	streetRows := []StreetLedgerReportRow{}
	for i, row := range sb.Rows {
		streetRows = append(streetRows, composeStreetLedgerRow(row, ss.Rows[i]))
	}
	surveyRows := []SurveyLedgerReportRow{}
	for i, row := range vb.Rows {
		surveyRows = append(surveyRows, composeSurveyLedgerRow(row, vs.Rows[i]))
	}
	if !reflect.DeepEqual(oldStreet.Rows, streetRows) || !reflect.DeepEqual(oldSurvey.Rows, surveyRows) {
		t.Fatal("旧 report 与新公共组装不兼容")
	}
	return goldenLedgerResult{sb, ss, vb, vs}
}

func TestLedgerPartsGoldenDataAndLegacyCompatibility(t *testing.T) {
	q := LedgerReportQuery{StreetOrgID: 3, DateFrom: "2026-09-01", DateTo: "2026-09-05"}
	t.Run("G1独立人工预期", func(t *testing.T) {
		result := loadGoldenLedger(t, goldenLedgerIssues(), reportTestOrgs(), q)
		if len(result.streetBase.Rows) != 2 || len(result.surveyBase.Rows) != 1 {
			t.Fatal("跨年行粒度不正确")
		}
		first, second := result.streetStats.Rows[0], result.streetStats.Rows[1]
		if first.RowKey != "2023:4" || first.SourceRecordCount != 6 || first.RoadKM == nil || *first.RoadKM != 1.75 || first.ForestHandover == nil || *first.ForestHandover != 100 || first.ForestExisting == nil || *first.ForestExisting != 0 {
			t.Fatalf("G1台账第一行错误：%+v", first)
		}
		if second.RowKey != "2024:4" || second.SourceRecordCount != 1 || second.RoadKM == nil || *second.RoadKM != 2 || second.ForestHandover != nil || second.ForestExisting != nil {
			t.Fatalf("G1台账第二行错误：%+v", second)
		}
		survey := result.surveyStats.Rows[0]
		if survey.RowKey != "0:4" || survey.SourceRecordCount != 7 || *survey.WellProblemCount != 2 || *survey.WellRectifiedCount != 1 || *survey.BridgeProblemCount != 0 || *survey.BridgeRectifiedCount != 0 || *survey.RoadProblemCount != 0 || *survey.RoadRectifiedCount != 0 {
			t.Fatalf("G1排查人工预期不符：%+v", survey)
		}
		baseJSON, _ := json.Marshal(result.streetBase)
		statsJSON, _ := json.Marshal(result.streetStats)
		if strings.Contains(string(baseJSON), "source_record_count") || strings.Contains(string(statsJSON), "project_year") || strings.Contains(string(statsJSON), "org_name") {
			t.Fatal("供数方字段发生交叉")
		}
		for _, fragment := range []string{`"natural_village":null`, `"signer":null`, `"phone":null`, `"query":{"street_org_id":3,"date_from":"2026-09-01","date_to":"2026-09-05"}`} {
			if !strings.Contains(string(baseJSON), fragment) {
				t.Fatalf("基础契约缺失 %s：%s", fragment, baseJSON)
			}
		}
		if first.WellHandover != nil || first.WellExisting != nil || first.BridgeHandover != nil || first.BridgeExisting != nil || first.TransformerHandover != nil || first.TransformerExisting != nil || survey.SurveyDone != nil || survey.WellInspected != nil || survey.WellNormal != nil || survey.BridgeInspected != nil || survey.RoadInspected != nil {
			t.Fatal("固定未知字段不可伪造")
		}
	})
	t.Run("G2道路缺失不部分求和", func(t *testing.T) {
		issues := goldenLedgerIssues()
		issues[1].TypeExt = strings.Replace(issues[1].TypeExt, `"length":0.5`, `"length":null`, 1)
		result := loadGoldenLedger(t, issues, reportTestOrgs(), q)
		if result.streetStats.Rows[0].RoadKM != nil || *result.surveyStats.Rows[0].RoadProblemCount != 0 {
			t.Fatal("长度未知与正常清单应独立")
		}
	})
	t.Run("G3缺题两指标同时未知", func(t *testing.T) {
		issues := goldenLedgerIssues()
		issues[4].TypeExt = `{"checklist":[]}`
		row := loadGoldenLedger(t, issues, reportTestOrgs(), q).surveyStats.Rows[0]
		if row.WellProblemCount != nil || row.WellRectifiedCount != nil {
			t.Fatal("未知清单不能部分统计")
		}
	})
	t.Run("G4同名不同组织不合并无记录不生成行", func(t *testing.T) {
		orgs := reportTestOrgs()
		orgs[3].Name = "测试新村"
		issues := goldenLedgerIssues()
		added := issues[0]
		added.OrgID = 5
		added.TypeExt = strings.Replace(added.TypeExt, `"length":1.25`, `"length":3`, 1)
		issues = append(issues, added)
		result := loadGoldenLedger(t, issues, orgs, q)
		if len(result.streetBase.Rows) != 3 || len(result.surveyBase.Rows) != 2 || result.streetStats.Rows[1].RowKey != "2023:5" || *result.streetStats.Rows[1].RoadKM != 3 || result.surveyStats.Rows[1].RowKey != "0:5" || result.surveyStats.Rows[1].SourceRecordCount != 1 || *result.surveyStats.Rows[1].RoadProblemCount != 0 || *result.surveyStats.Rows[1].RoadRectifiedCount != 0 {
			t.Fatal("同名组织错误合并")
		}
	})
	t.Run("G5未知组织与年份保留", func(t *testing.T) {
		issues := append(goldenLedgerIssues(), model.Issue{OrgID: 999, Type: "well", Status: "new", TypeExt: reportChecklist("well", true)})
		all := q
		all.StreetOrgID = 0
		result := loadGoldenLedger(t, issues, reportTestOrgs(), all)
		base, stats := result.streetBase.Rows[0], result.streetStats.Rows[0]
		survey := result.surveyStats.Rows[0]
		if base.RowKey != "0:999" || base.ProjectYear != nil || base.OrgName != nil || base.StreetOrgID != nil || stats.SourceRecordCount != 1 || stats.RoadKM != nil || survey.RowKey != "0:999" || *survey.WellProblemCount != 1 || *survey.WellRectifiedCount != 0 {
			t.Fatal("缺失关联记录不得被 inner join 丢失或补造")
		}
	})
	t.Run("G6空记录不生成全组织零台账", func(t *testing.T) {
		result := loadGoldenLedger(t, nil, reportTestOrgs(), q)
		for _, value := range []any{result.streetBase, result.streetStats, result.surveyBase, result.surveyStats} {
			body, _ := json.Marshal(value)
			if !strings.Contains(string(body), `"rows":[]`) || !strings.Contains(string(body), `"notes":[`) {
				t.Fatalf("空数组契约：%s", body)
			}
		}
	})
}

func TestLedgerPartsRejectUnsafeStoredDataAndServiceArguments(t *testing.T) {
	ctx := context.Background()
	for _, q := range []LedgerReportQuery{{StreetOrgID: maxLedgerSafeInteger + 1}, {DateFrom: "2026-02-30"}, {DateFrom: "2026-09-06", DateTo: "2026-09-01"}} {
		s := &IssueService{}
		_, a := s.LedgerStreetRows(ctx, q)
		_, b := s.LedgerStreetStatistics(ctx, q)
		_, c := s.LedgerSurveyRows(ctx, q)
		_, d := s.LedgerSurveyStatistics(ctx, q)
		for _, err := range []error{a, b, c, d} {
			if !errors.Is(err, ErrLedgerReportArgument) {
				t.Fatalf("非HTTP调用也须拒绝：%v", err)
			}
		}
	}
	for _, orgID := range []uint64{0, 999, maxLedgerSafeInteger, maxLedgerSafeInteger + 1} {
		s := &IssueService{DB: testutil.NewQueryDB(t, reportOrgStep(), ledgerBaseStep(t, []model.Issue{{OrgID: orgID}}, true))}
		result, err := s.LedgerStreetRows(ctx, LedgerReportQuery{})
		if orgID > maxLedgerSafeInteger {
			if err == nil || result != nil || errors.Is(err, ErrLedgerReportArgument) {
				t.Fatal("存量不安全ID须服务端失败")
			}
		} else if err != nil || len(result.Rows) != 1 {
			t.Fatalf("兼容缺失/零ID：%v", err)
		}
	}
	bad := uint64(maxLedgerSafeInteger + 1)
	for _, group := range []reportGroup{{year: -1}, {year: int(maxLedgerSafeInteger + 1)}, {location: LedgerReportLocation{StreetOrgID: &bad}}, {location: LedgerReportLocation{VillageOrgID: &bad}}, {location: LedgerReportLocation{SourceRecordCount: int64(maxLedgerSafeInteger + 1)}}} {
		if validateLedgerGroup(group) == nil {
			t.Fatalf("应拒绝存量数值：%+v", group)
		}
	}
}

func TestLedgerPartsUseSameBoundFiltersAndConstantQueryCount(t *testing.T) {
	// G7：sqlstub 不执行 SQL，精确断言真实查询的包含/排他日界线与软删除约束。
	// 真实 MySQL 对边界记录的执行结果仍属于发布联调，不能把桩当作数据库集成测试。
	q := LedgerReportQuery{StreetOrgID: 3, DateFrom: "2026-09-01", DateTo: "2026-09-05"}
	for _, mode := range []string{"street-rows", "street-statistics", "survey-rows", "survey-statistics"} {
		t.Run(mode, func(t *testing.T) {
			step := reportIssueStep()
			step.Check = func(sql string, args []driver.NamedValue) {
				for _, fragment := range []string{"org_id IN", "created_at >=", "created_at <", "is_delete"} {
					if !strings.Contains(sql, fragment) {
						t.Errorf("缺少 %s：%s", fragment, sql)
					}
				}
				boundaries := []time.Time{}
				for _, arg := range args {
					if value, ok := arg.Value.(time.Time); ok {
						boundaries = append(boundaries, value)
					}
					if value, ok := arg.Value.(int64); ok && value == 999 {
						t.Fatal("未知组织不得加入已知街道子树")
					}
				}
				if len(boundaries) != 2 || boundaries[0].Format(time.RFC3339) != "2026-09-01T00:00:00+08:00" || boundaries[1].Format(time.RFC3339) != "2026-09-06T00:00:00+08:00" {
					t.Fatalf("日期边界错误：%v", args)
				}
				if strings.Contains(sql, " LIMIT ") {
					t.Fatal("不得静默截断整表")
				}
			}
			s := &IssueService{DB: testutil.NewQueryDB(t, reportOrgStep(), step)}
			var err error
			switch mode {
			case "street-rows":
				_, err = s.LedgerStreetRows(context.Background(), q)
			case "street-statistics":
				_, err = s.LedgerStreetStatistics(context.Background(), q)
			case "survey-rows":
				_, err = s.LedgerSurveyRows(context.Background(), q)
			case "survey-statistics":
				_, err = s.LedgerSurveyStatistics(context.Background(), q)
			}
			if err != nil {
				t.Fatal(err)
			}
		})
	}
}

// BenchmarkLedgerParts10k 衡量纯计算与序列化，不冒充真实数据库或网络延迟。
func BenchmarkLedgerParts10k(b *testing.B) {
	issues := make([]model.Issue, 10000)
	seed := goldenLedgerIssues()
	orgs := map[uint64]model.SysOrg{}
	for _, org := range reportTestOrgs() {
		orgs[org.ID] = org
	}
	for i := range issues {
		issues[i] = seed[i%len(seed)]
		issues[i].OrgID = uint64(100 + i%100)
	}
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		street := []StreetLedgerStatisticsRow{}
		for _, group := range groupLedgerReport(issues, orgs, true) {
			street = append(street, buildStreetStatisticsRow(group))
		}
		survey := []SurveyLedgerStatisticsRow{}
		for _, group := range groupLedgerReport(issues, orgs, false) {
			survey = append(survey, buildSurveyStatisticsRow(group))
		}
		encoded, _ := json.Marshal([]any{street, survey})
		b.ReportMetric(float64(len(encoded)), "response-B")
	}
}
