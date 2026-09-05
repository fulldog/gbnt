package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
	"time"

	"gbnt/apps/server/internal/model"
	"gorm.io/gorm"
)

// ErrLedgerReportArgument 表示报表筛选参数无效，不应降级成全量查询。
var ErrLedgerReportArgument = errors.New("报表筛选参数无效")

// ledgerReportTimezone 与工作台采用同一北京时间日界线，不依赖服务器本地时区。
var ledgerReportTimezone = time.FixedZone("Asia/Shanghai", 8*60*60)

// LedgerReportQuery 街道台账和排查汇总的只读筛选。
type LedgerReportQuery struct {
	StreetOrgID uint64 `form:"street_org_id"` // 街道组织 ID；0 或省略表示全部街道，非街道组织不允许
	DateFrom    string `form:"date_from"`     // 北京时间上报日期起点，选填 YYYY-MM-DD，包含当日
	DateTo      string `form:"date_to"`       // 北京时间上报日期终点，选填 YYYY-MM-DD，包含当日
}

// LedgerReportLocation 报表行的正式组织位置；没有自然村层级时明确输出 null。
type LedgerReportLocation struct {
	RowKey            string  `json:"row_key"`             // 稳定行键，由年度及落点组织组成
	OrgID             uint64  `json:"org_id"`              // 实际落点组织 ID；关联删除后仍保留
	OrgName           *string `json:"org_name"`            // 落点组织名称；关联缺失为 null
	StreetOrgID       *uint64 `json:"street_org_id"`       // 沿组织树解析的街道 ID；缺失为 null
	StreetName        *string `json:"street_name"`         // 街道名称；无法解析为 null
	VillageOrgID      *uint64 `json:"village_org_id"`      // 沿组织树解析的村 ID；缺失为 null
	VillageName       *string `json:"village_name"`        // 村/社区名称；无法解析为 null
	NaturalVillage    *string `json:"natural_village"`     // 当前没有自然村字段，固定 null，不从地址猜测
	SourceRecordCount int64   `json:"source_record_count"` // 当前筛选下的上报记录条数，不是去重设施数量
}

// StreetLedgerReportRow 建设年份、村级分组的街道台账；资产基表未采集项固定 null。
type StreetLedgerReportRow struct {
	LedgerReportLocation
	ProjectYear         *int     `json:"project_year"`         // 建设项目年度；历史缺失值为 null
	WellHandover        *int64   `json:"well_handover"`        // 机井移交数量；未建立资产基表，固定 null
	WellExisting        *int64   `json:"well_existing"`        // 机井现有数量；不能用排查记录条数冒充，固定 null
	BridgeHandover      *int64   `json:"bridge_handover"`      // 桥涵闸移交数量；未采集，固定 null
	BridgeExisting      *int64   `json:"bridge_existing"`      // 桥涵闸现有数量；未采集，固定 null
	RoadKM              *float64 `json:"road_km"`              // 道路上报记录 length 千米合计；没有道路或含缺失/无效长度时为 null
	ForestHandover      *float64 `json:"forest_handover"`      // 林网上报记录 handover_count 株数合计；无记录或含缺失值为 null
	ForestExisting      *float64 `json:"forest_existing"`      // 林网上报记录 existing_count 株数合计；无记录或含缺失值为 null
	TransformerHandover *int64   `json:"transformer_handover"` // 变压器移交数量；未采集，固定 null
	TransformerExisting *int64   `json:"transformer_existing"` // 变压器现有数量；未采集，固定 null
	Signer              *string  `json:"signer"`               // 村级报表负责人签字/盖章；未采集，不能挪用单条排查签名
	Phone               *string  `json:"phone"`                // 村级报表负责人电话；未指定，不能任选一名上报人
}

// StreetLedgerReportResult 保留报表行和统计口径，无数据时 rows 为 []。
type StreetLedgerReportResult struct {
	StreetOrgID uint64                  `json:"street_org_id"` // 实际应用的街道筛选，0 表示全部
	Rows        []StreetLedgerReportRow `json:"rows"`          // 按年度、街道及落点组织稳定排序的只读报表行
	Notes       []string                `json:"notes"`         // 必须展示的统计口径及尚未采集字段说明
}

// SurveyLedgerReportRow 村级排查整改报告；异常/整改均按记录计数，不推导全量设施排查结果。
type SurveyLedgerReportRow struct {
	LedgerReportLocation
	SurveyDone           *bool   `json:"survey_done"`            // 是否全面完成排查；没有全量任务/资产基线，固定 null
	WellInspected        *int64  `json:"well_inspected"`         // 已排查机井设施总数；没有唯一资产去重基线，固定 null
	WellNormal           *int64  `json:"well_normal"`            // 当前运行正常机井设施总数；无全量资产状态，固定 null
	WellProblemCount     *int64  `json:"well_problem_count"`     // 当前保存清单异常的机井记录数；该类型存在无效清单时为 null
	WellRectifiedCount   *int64  `json:"well_rectified_count"`   // 异常机井记录中当前 status=done 的数量；未知清单为 null
	BridgeInspected      *int64  `json:"bridge_inspected"`       // 已排查桥涵闸设施数；未建立去重基线，固定 null
	BridgeProblemCount   *int64  `json:"bridge_problem_count"`   // 当前保存清单异常桥涵闸记录数；未知清单为 null
	BridgeRectifiedCount *int64  `json:"bridge_rectified_count"` // 当前清单异常且已整改的桥涵闸记录数；未知清单为 null
	RoadInspected        *int64  `json:"road_inspected"`         // 已排查道路设施数；未建立去重基线，固定 null
	RoadProblemCount     *int64  `json:"road_problem_count"`     // 当前保存清单异常道路记录数；未知清单为 null
	RoadRectifiedCount   *int64  `json:"road_rectified_count"`   // 当前清单异常且已整改道路记录数；未知清单为 null
	ContactName          *string `json:"contact_name"`           // 村级运行管护排查联系人；尚未指定，固定 null
	ContactPhone         *string `json:"contact_phone"`          // 村级联系人电话；尚未指定，固定 null
	LeaderSign           *string `json:"leader_sign"`            // 报表负责人签字/盖章；尚未采集，固定 null
}

// SurveyLedgerReportResult 排查汇总报表及不可省略的统计口径说明。
type SurveyLedgerReportResult struct {
	StreetOrgID uint64                  `json:"street_org_id"` // 实际街道筛选，0 表示全部
	Rows        []SurveyLedgerReportRow `json:"rows"`          // 按街道、落点组织排序的汇总行，空时为 []
	Notes       []string                `json:"notes"`         // 记录口径、未知值和未采集字段说明
}

func validateLedgerReportQuery(q LedgerReportQuery) error {
	for _, date := range []string{q.DateFrom, q.DateTo} {
		if date == "" {
			continue
		}
		if parsed, err := time.ParseInLocation("2006-01-02", date, ledgerReportTimezone); err != nil || parsed.Format("2006-01-02") != date {
			return fmt.Errorf("%w：日期必须为 YYYY-MM-DD", ErrLedgerReportArgument)
		}
	}
	if q.DateFrom != "" && q.DateTo != "" && q.DateFrom > q.DateTo {
		return fmt.Errorf("%w：开始日期不能晚于结束日期", ErrLedgerReportArgument)
	}
	return nil
}

// ledgerReportSource 为每次请求创建独立查询，基础行、统计和旧报表共用筛选及软删除规则。
func (s *IssueService) ledgerReportSource(ctx context.Context, q LedgerReportQuery) (*gorm.DB, map[uint64]model.SysOrg, error) {
	if err := validateLedgerReportQuery(q); err != nil {
		return nil, nil, err
	}
	var orgs []model.SysOrg
	if err := s.db(ctx).Select("id", "parent_id", "name", "type").Find(&orgs).Error; err != nil {
		return nil, nil, err
	}
	byID := make(map[uint64]model.SysOrg, len(orgs))
	for _, org := range orgs {
		byID[org.ID] = org
	}
	db := s.db(ctx).Model(&model.Issue{})
	if q.StreetOrgID != 0 {
		if org, exists := byID[q.StreetOrgID]; !exists || org.Type != model.OrgTypeStreet {
			return nil, nil, fmt.Errorf("%w：请选择有效街道", ErrLedgerReportArgument)
		}
		db = db.Where("org_id IN ?", orgSubtreeIDs(orgs, q.StreetOrgID))
	}
	// 报表按北京时间自然日过滤；绑定 time.Time 由 MySQL 驱动按配置 loc 转换，不用裸字符串误当存储时区。
	// 保留软删除默认作用域；不因缺失关联而丢掉已有记录。
	if q.DateFrom != "" {
		start, _ := time.ParseInLocation("2006-01-02", q.DateFrom, ledgerReportTimezone)
		db = db.Where("created_at >= ?", start)
	}
	if q.DateTo != "" {
		end, _ := time.ParseInLocation("2006-01-02", q.DateTo, ledgerReportTimezone)
		db = db.Where("created_at < ?", end.AddDate(0, 0, 1))
	}
	return db, byID, nil
}

func (s *IssueService) loadLedgerReport(ctx context.Context, q LedgerReportQuery) ([]model.Issue, map[uint64]model.SysOrg, error) {
	db, byID, err := s.ledgerReportSource(ctx, q)
	if err != nil {
		return nil, nil, err
	}
	issues := make([]model.Issue, 0)
	err = db.Select("id", "org_id", "project_year", "type", "status", "type_ext").Order("project_year ASC, org_id ASC, id ASC").Find(&issues).Error
	return issues, byID, err
}

func ledgerReportLocation(orgID uint64, orgs map[uint64]model.SysOrg) LedgerReportLocation {
	location := LedgerReportLocation{OrgID: orgID}
	if org, exists := orgs[orgID]; exists {
		location.OrgName = &org.Name
	}
	seen := map[uint64]bool{}
	for current := orgID; current != 0 && !seen[current]; {
		seen[current] = true
		org, exists := orgs[current]
		if !exists {
			break
		}
		if org.Type == model.OrgTypeStreet && location.StreetOrgID == nil {
			location.StreetOrgID, location.StreetName = &org.ID, &org.Name
		}
		if org.Type == model.OrgTypeVillage && location.VillageOrgID == nil {
			location.VillageOrgID, location.VillageName = &org.ID, &org.Name
		}
		current = org.ParentID
	}
	return location
}

type reportGroup struct {
	location LedgerReportLocation
	year     int
	issues   []model.Issue
}

func groupLedgerReport(issues []model.Issue, orgs map[uint64]model.SysOrg, withYear bool) []reportGroup {
	groups := map[string]*reportGroup{}
	for _, issue := range issues {
		year := 0
		if withYear {
			year = issue.ProjectYear
		}
		key := fmt.Sprintf("%d:%d", year, issue.OrgID)
		if groups[key] == nil {
			location := ledgerReportLocation(issue.OrgID, orgs)
			location.RowKey = key
			groups[key] = &reportGroup{location: location, year: year}
		}
		groups[key].issues = append(groups[key].issues, issue)
		groups[key].location.SourceRecordCount++
	}
	result := make([]reportGroup, 0, len(groups))
	for _, group := range groups {
		result = append(result, *group)
	}
	id := func(value *uint64) uint64 {
		if value == nil {
			return 0
		}
		return *value
	}
	sort.Slice(result, func(i, j int) bool {
		a, b := result[i], result[j]
		if a.year != b.year {
			return a.year < b.year
		}
		if id(a.location.StreetOrgID) != id(b.location.StreetOrgID) {
			return id(a.location.StreetOrgID) < id(b.location.StreetOrgID)
		}
		return a.location.OrgID < b.location.OrgID
	})
	return result
}

func sumReportedMetric(issues []model.Issue, typ, field string) *float64 {
	total, found := float64(0), false
	for _, issue := range issues {
		if issue.Type != typ {
			continue
		}
		found = true
		var ext map[string]json.RawMessage
		if json.Unmarshal([]byte(issue.TypeExt), &ext) != nil {
			return nil
		}
		var value *float64
		if json.Unmarshal(ext[field], &value) != nil || value == nil || *value < 0 || math.IsNaN(*value) || math.IsInf(*value, 0) {
			return nil
		}
		total += *value
	}
	if !found || math.IsInf(total, 0) {
		return nil
	}
	total = math.Round(total*10000) / 10000
	if math.IsInf(total, 0) {
		return nil
	}
	return &total
}

// LedgerStreetReport 返回正式字段驱动的 Excel 式街道台账，不创建虚构资产或编辑存储。
func (s *IssueService) LedgerStreetReport(ctx context.Context, query LedgerReportQuery) (*StreetLedgerReportResult, error) {
	issues, orgs, err := s.loadLedgerReport(ctx, query)
	if err != nil {
		return nil, err
	}
	result := &StreetLedgerReportResult{StreetOrgID: query.StreetOrgID, Rows: []StreetLedgerReportRow{}, Notes: []string{
		"道路千米数、林网株数为当前筛选内上报记录的已采集字段合计，未按资产去重，不代表全村资产总量。",
		"自然村、机井/桥涵闸/变压器移交及现有数量、村级负责人签字和电话尚未采集，以 — 表示，不用问题条数代替。",
		"道路或林网存在缺失/无效字段时对应合计为 —；报表当前只读，不提供未接入持久化的移交数量编辑。",
	}}
	for _, group := range groupLedgerReport(issues, orgs, true) {
		result.Rows = append(result.Rows, composeStreetLedgerRow(buildStreetBaseRow(group), buildStreetStatisticsRow(group)))
	}
	return result, nil
}

// reportProblemState 严格识别当前保存的排查清单；缺题/值缺失/坏 JSON 返回未知，正常上报直接 done 不计为整改。
// 口径为当前数据库记录快照，不是历史事件累计；重新整改只反映当前轮次状态，不累计历史完成次数。
func reportProblemState(issue model.Issue) (problem, known bool) {
	var ext struct {
		Checklist []struct {
			Type  model.QuizType `json:"type"`  // 清单题型，必须属于当前设施类型且不得重复
			Value *bool          `json:"value"` // 题目答案；nil 表示缺失，不可当作 false
		} `json:"checklist"` // 当前保存的排查题目，缺题时不计算异常总数
		OutletTotal   *int `json:"outlet_total"`   // 出水口总数，机井清单必需
		OutletDamaged *int `json:"outlet_damaged"` // 出水口损坏数，影响异常判定
		CasingTotal   *int `json:"casing_total"`   // 护筒总数，机井清单必需
		CasingDamaged *int `json:"casing_damaged"` // 护筒损坏数，影响异常判定
	}
	if json.Unmarshal([]byte(issue.TypeExt), &ext) != nil {
		return false, false
	}
	specs := checklistSpecsFor(issue.Type)
	if len(specs) == 0 || len(ext.Checklist) != len(specs) {
		return false, false
	}
	values := map[model.QuizType]bool{}
	for _, quiz := range ext.Checklist {
		if quiz.Value == nil {
			return false, false
		}
		if _, duplicate := values[quiz.Type]; duplicate {
			return false, false
		}
		values[quiz.Type] = *quiz.Value
	}
	for _, spec := range specs {
		value, exists := values[spec.Type]
		if !exists {
			return false, false
		}
		if value == spec.Negative {
			problem = true
		}
	}
	if issue.Type == "well" {
		if ext.OutletTotal == nil || ext.OutletDamaged == nil || ext.CasingTotal == nil || ext.CasingDamaged == nil {
			return false, false
		}
		if *ext.OutletTotal < 0 || *ext.CasingTotal < 0 || *ext.OutletDamaged < 0 || *ext.CasingDamaged < 0 || *ext.OutletDamaged > *ext.OutletTotal || *ext.CasingDamaged > *ext.CasingTotal {
			return false, false
		}
		problem = problem || *ext.OutletDamaged > 0 || *ext.CasingDamaged > 0
	}
	return problem, true
}

func surveyProblemCounts(issues []model.Issue, typ string) (*int64, *int64) {
	problems, rectified := int64(0), int64(0)
	for _, issue := range issues {
		if issue.Type != typ {
			continue
		}
		problem, known := reportProblemState(issue)
		if !known {
			return nil, nil
		}
		if problem {
			problems++
			if issue.Status == string(model.IssueStatusDone) {
				rectified++
			}
		}
	}
	return &problems, &rectified
}

// LedgerSurveyReport 按正式落点村汇总已上报的异常/整改记录，全面排查结论保持未采集。
func (s *IssueService) LedgerSurveyReport(ctx context.Context, query LedgerReportQuery) (*SurveyLedgerReportResult, error) {
	issues, orgs, err := s.loadLedgerReport(ctx, query)
	if err != nil {
		return nil, err
	}
	result := &SurveyLedgerReportResult{StreetOrgID: query.StreetOrgID, Rows: []SurveyLedgerReportRow{}, Notes: []string{
		"问题数量按当前保存的排查清单判定异常的上报记录计数；整改数量仅统计其中当前状态为已整改的记录。正常排查直接完成不算整改。",
		"统计反映当前数据库记录快照，不是历史事件累计；重新整改只按当前状态计数，不累加往轮完成次数。",
		"统计未按设施去重；完整排查任务、资产基线及当前全量运行状态尚未建立，已排查设施总数、正常机井总数及是否全面完成排查均为 —。",
		"历史记录清单不完整时对应类型的问题及整改数量为 —；自然村、村级运行管护联系人和报表负责人签字未采集，不任取上报人填充。",
	}}
	for _, group := range groupLedgerReport(issues, orgs, false) {
		result.Rows = append(result.Rows, composeSurveyLedgerRow(buildSurveyBaseRow(group), buildSurveyStatisticsRow(group)))
	}
	return result, nil
}
