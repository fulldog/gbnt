package service

import (
	"context"
	"fmt"
	"net/url"
	"regexp"
	"strconv"
	"time"

	"gbnt/apps/server/internal/model"
)

const maxLedgerSafeInteger uint64 = 9007199254740991

var ledgerDecimalID = regexp.MustCompile(`^[0-9]+$`)

// LedgerAppliedQuery 是服务端已校验且实际应用的筛选条件，三键始终出现。
type LedgerAppliedQuery struct {
	StreetOrgID uint64 `json:"street_org_id"` // 街道 ID；0 表示全部，不超过 JS 安全整数上限
	DateFrom    string `json:"date_from"`     // 北京时间起日，包含当日；空串表示不限
	DateTo      string `json:"date_to"`       // 北京时间终日，包含当日；空串表示不限
}

// LedgerPartResult 为基础行或统计行供数，空数据也返回非空数组。
type LedgerPartResult[T any] struct {
	Query LedgerAppliedQuery `json:"query"` // 实际应用的规范化筛选，不是数据库快照凭据
	Rows  []T                `json:"rows"`  // 全部分组行，无分页和静默截断；空时为 []
	Notes []string           `json:"notes"` // 本部分统计口径和未采集项说明；无说明时为 []
}

// LedgerBaseLocation 只包含身份与组织位置，不重复提供统计数量。
type LedgerBaseLocation struct {
	RowKey         string  `json:"row_key"`         // 同页同轮查询内的唯一关联键，前端不能按名称关联
	OrgID          uint64  `json:"org_id"`          // 实际落点组织，关联缺失仍保留；历史 0 兼容
	OrgName        *string `json:"org_name"`        // 落点组织名称；缺失为 null
	StreetOrgID    *uint64 `json:"street_org_id"`   // 沿祖先解析街道 ID；未知为 null
	StreetName     *string `json:"street_name"`     // 街道名称；未知为 null
	VillageOrgID   *uint64 `json:"village_org_id"`  // 沿祖先解析村/社区 ID；未知为 null
	VillageName    *string `json:"village_name"`    // 村/社区名称；未知为 null
	NaturalVillage *string `json:"natural_village"` // 未采集自然村层级，固定 null
}

// LedgerStatisticIdentity 是统计行的唯一身份和记录口径数量。
type LedgerStatisticIdentity struct {
	RowKey            string `json:"row_key"`             // 关联本页基础行，不可跨页面复用
	SourceRecordCount int64  `json:"source_record_count"` // 分组全部设施类型的记录条数，不是去重资产数
}

// StreetLedgerBaseRow 是按建设年份和落点组织分组的基础行。
type StreetLedgerBaseRow struct {
	LedgerBaseLocation // 身份和正式组织位置，无统计指标

	ProjectYear *int    `json:"project_year"` // 建设年份；历史 0 为 null，正数保留
	Signer      *string `json:"signer"`       // 村级台账签字尚未采集，固定 null
	Phone       *string `json:"phone"`        // 村级台账电话尚未采集，固定 null
}

// StreetLedgerStatisticsRow 只提供台账指标，未建立资产来源的数量固定 null。
type StreetLedgerStatisticsRow struct {
	LedgerStatisticIdentity // 关联键及全部类型记录数

	WellHandover        *int64   `json:"well_handover"`        // 机井移交数量未采集，固定 null
	WellExisting        *int64   `json:"well_existing"`        // 机井现有数量无资产基线，固定 null
	BridgeHandover      *int64   `json:"bridge_handover"`      // 桥涵闸移交数量未采集，固定 null
	BridgeExisting      *int64   `json:"bridge_existing"`      // 桥涵闸现有数量未采集，固定 null
	RoadKM              *float64 `json:"road_km"`              // 道路上报 length 千米合计；无道路或存在无效值为 null
	ForestHandover      *float64 `json:"forest_handover"`      // 林网上报移交株数合计；无林网或存在无效值为 null
	ForestExisting      *float64 `json:"forest_existing"`      // 林网上报现有株数合计；无林网或存在无效值为 null
	TransformerHandover *int64   `json:"transformer_handover"` // 变压器移交数量未采集，固定 null
	TransformerExisting *int64   `json:"transformer_existing"` // 变压器现有数量未采集，固定 null
}

// SurveyLedgerBaseRow 按实际落点组织跨年度汇总基础信息，不挪用排查人作为联系人。
type SurveyLedgerBaseRow struct {
	LedgerBaseLocation // 身份和正式组织位置，无统计指标

	ContactName  *string `json:"contact_name"`  // 村级排查联系人未指定，固定 null
	ContactPhone *string `json:"contact_phone"` // 村级排查联系人电话未指定，固定 null
	LeaderSign   *string `json:"leader_sign"`   // 报表负责人签字未采集，固定 null
}

// SurveyLedgerStatisticsRow 提供当前清单的问题和整改记录数，不推导全量资产排查数。
type SurveyLedgerStatisticsRow struct {
	LedgerStatisticIdentity // 关联键及全部类型记录数

	SurveyDone           *bool  `json:"survey_done"`            // 无完整排查任务和资产基线，固定 null
	WellInspected        *int64 `json:"well_inspected"`         // 已排查机井资产数未知，固定 null
	WellNormal           *int64 `json:"well_normal"`            // 正常运行机井资产数未知，固定 null
	WellProblemCount     *int64 `json:"well_problem_count"`     // 当前机井异常记录数；任一清单无效为 null
	WellRectifiedCount   *int64 `json:"well_rectified_count"`   // 异常且当前 done 的机井记录数；任一清单无效为 null
	BridgeInspected      *int64 `json:"bridge_inspected"`       // 已排查桥涵闸资产数未知，固定 null
	BridgeProblemCount   *int64 `json:"bridge_problem_count"`   // 当前桥涵闸异常记录数；任一清单无效为 null
	BridgeRectifiedCount *int64 `json:"bridge_rectified_count"` // 异常且当前 done 的桥涵闸记录数；任一清单无效为 null
	RoadInspected        *int64 `json:"road_inspected"`         // 已排查道路资产数未知，固定 null
	RoadProblemCount     *int64 `json:"road_problem_count"`     // 当前道路异常记录数；任一清单无效为 null
	RoadRectifiedCount   *int64 `json:"road_rectified_count"`   // 异常且当前 done 的道路记录数；任一清单无效为 null
}

// ParseLedgerSplitQuery 仅解析四个新入口，拒绝未知/重复参数，不将无效筛选扩大为全量查询。
func ParseLedgerSplitQuery(values url.Values) (LedgerReportQuery, error) {
	q := LedgerReportQuery{}
	for key, items := range values {
		if (key != "street_org_id" && key != "date_from" && key != "date_to") || len(items) != 1 {
			return q, fmt.Errorf("%w：未知或重复参数 %s", ErrLedgerReportArgument, key)
		}
	}
	if raw := values.Get("street_org_id"); raw != "" {
		if !ledgerDecimalID.MatchString(raw) {
			return q, fmt.Errorf("%w：street_org_id 必须为非负整数", ErrLedgerReportArgument)
		}
		id, err := strconv.ParseUint(raw, 10, 64)
		if err != nil || id > maxLedgerSafeInteger {
			return q, fmt.Errorf("%w：street_org_id 超出安全范围", ErrLedgerReportArgument)
		}
		q.StreetOrgID = id
	}
	q.DateFrom, q.DateTo = values.Get("date_from"), values.Get("date_to")
	return q, validateLedgerSplitQuery(q)
}

func validateLedgerSplitQuery(q LedgerReportQuery) error {
	if q.StreetOrgID > maxLedgerSafeInteger {
		return fmt.Errorf("%w：street_org_id 超出安全范围", ErrLedgerReportArgument)
	}
	// 独立于旧 handler 的容错行为，非 HTTP 调用也不可跳过日期或 ID 校验。
	for _, item := range []struct{ name, value string }{{"date_from", q.DateFrom}, {"date_to", q.DateTo}} {
		if item.value != "" {
			parsed, err := time.ParseInLocation("2006-01-02", item.value, ledgerReportTimezone)
			if err != nil || parsed.Format("2006-01-02") != item.value {
				return fmt.Errorf("%w：%s 必须为有效日期", ErrLedgerReportArgument, item.name)
			}
		}
	}
	return validateLedgerReportQuery(q)
}

func appliedLedgerQuery(q LedgerReportQuery) LedgerAppliedQuery {
	return LedgerAppliedQuery{StreetOrgID: q.StreetOrgID, DateFrom: q.DateFrom, DateTo: q.DateTo}
}

// loadLedgerPartGroups 基础路径只取去重分组列，统计路径批量加载；每次至多两次 SQL，不逐行查组织。
func (s *IssueService) loadLedgerPartGroups(ctx context.Context, q LedgerReportQuery, withYear, statistics bool) ([]reportGroup, error) {
	if err := validateLedgerSplitQuery(q); err != nil {
		return nil, err
	}
	var issues []model.Issue
	var orgs map[uint64]model.SysOrg
	var err error
	if statistics {
		issues, orgs, err = s.loadLedgerReport(ctx, q)
	} else {
		db, byID, sourceErr := s.ledgerReportSource(ctx, q)
		if sourceErr != nil {
			return nil, sourceErr
		}
		orgs = byID
		columns := []string{"org_id"}
		if withYear {
			columns = append(columns, "project_year")
		}
		err = db.Distinct(columns).Find(&issues).Error
	}
	if err != nil {
		return nil, err
	}
	groups := groupLedgerReport(issues, orgs, withYear)
	for _, group := range groups {
		if err := validateLedgerGroup(group); err != nil {
			return nil, err
		}
	}
	return groups, nil
}

func validateLedgerGroup(group reportGroup) error {
	location := group.location
	if location.OrgID > maxLedgerSafeInteger || (location.StreetOrgID != nil && *location.StreetOrgID > maxLedgerSafeInteger) || (location.VillageOrgID != nil && *location.VillageOrgID > maxLedgerSafeInteger) || group.year < 0 || uint64(group.year) > maxLedgerSafeInteger || location.SourceRecordCount < 0 || uint64(location.SourceRecordCount) > maxLedgerSafeInteger {
		// 存量异常是服务端数据错误，不归为用户参数 400，也不截断或舍入 ID。
		return fmt.Errorf("报表存量数据超出安全整数范围，row_key=%s", location.RowKey)
	}
	return nil
}

func baseLedgerLocation(location LedgerReportLocation) LedgerBaseLocation {
	return LedgerBaseLocation{RowKey: location.RowKey, OrgID: location.OrgID, OrgName: location.OrgName, StreetOrgID: location.StreetOrgID, StreetName: location.StreetName, VillageOrgID: location.VillageOrgID, VillageName: location.VillageName, NaturalVillage: location.NaturalVillage}
}

func buildStreetBaseRow(group reportGroup) StreetLedgerBaseRow {
	row := StreetLedgerBaseRow{LedgerBaseLocation: baseLedgerLocation(group.location)}
	if group.year > 0 {
		year := group.year
		row.ProjectYear = &year
	}
	return row
}

func buildSurveyBaseRow(group reportGroup) SurveyLedgerBaseRow {
	return SurveyLedgerBaseRow{LedgerBaseLocation: baseLedgerLocation(group.location)}
}

func buildStreetStatisticsRow(group reportGroup) StreetLedgerStatisticsRow {
	return StreetLedgerStatisticsRow{
		LedgerStatisticIdentity: LedgerStatisticIdentity{RowKey: group.location.RowKey, SourceRecordCount: group.location.SourceRecordCount},
		RoadKM:                  sumReportedMetric(group.issues, "road", "length"),
		ForestHandover:          sumReportedMetric(group.issues, "forest", "handover_count"),
		ForestExisting:          sumReportedMetric(group.issues, "forest", "existing_count"),
	}
}

func buildSurveyStatisticsRow(group reportGroup) SurveyLedgerStatisticsRow {
	row := SurveyLedgerStatisticsRow{LedgerStatisticIdentity: LedgerStatisticIdentity{RowKey: group.location.RowKey, SourceRecordCount: group.location.SourceRecordCount}}
	row.WellProblemCount, row.WellRectifiedCount = surveyProblemCounts(group.issues, "well")
	row.BridgeProblemCount, row.BridgeRectifiedCount = surveyProblemCounts(group.issues, "bridge")
	row.RoadProblemCount, row.RoadRectifiedCount = surveyProblemCounts(group.issues, "road")
	return row
}

func composeLedgerLocation(base LedgerBaseLocation, statistics LedgerStatisticIdentity) LedgerReportLocation {
	return LedgerReportLocation{RowKey: base.RowKey, OrgID: base.OrgID, OrgName: base.OrgName, StreetOrgID: base.StreetOrgID, StreetName: base.StreetName, VillageOrgID: base.VillageOrgID, VillageName: base.VillageName, NaturalVillage: base.NaturalVillage, SourceRecordCount: statistics.SourceRecordCount}
}

func composeStreetLedgerRow(base StreetLedgerBaseRow, stats StreetLedgerStatisticsRow) StreetLedgerReportRow {
	return StreetLedgerReportRow{LedgerReportLocation: composeLedgerLocation(base.LedgerBaseLocation, stats.LedgerStatisticIdentity), ProjectYear: base.ProjectYear, Signer: base.Signer, Phone: base.Phone,
		WellHandover: stats.WellHandover, WellExisting: stats.WellExisting, BridgeHandover: stats.BridgeHandover, BridgeExisting: stats.BridgeExisting, RoadKM: stats.RoadKM, ForestHandover: stats.ForestHandover, ForestExisting: stats.ForestExisting, TransformerHandover: stats.TransformerHandover, TransformerExisting: stats.TransformerExisting}
}

func composeSurveyLedgerRow(base SurveyLedgerBaseRow, stats SurveyLedgerStatisticsRow) SurveyLedgerReportRow {
	return SurveyLedgerReportRow{LedgerReportLocation: composeLedgerLocation(base.LedgerBaseLocation, stats.LedgerStatisticIdentity), ContactName: base.ContactName, ContactPhone: base.ContactPhone, LeaderSign: base.LeaderSign,
		SurveyDone: stats.SurveyDone, WellInspected: stats.WellInspected, WellNormal: stats.WellNormal, WellProblemCount: stats.WellProblemCount, WellRectifiedCount: stats.WellRectifiedCount,
		BridgeInspected: stats.BridgeInspected, BridgeProblemCount: stats.BridgeProblemCount, BridgeRectifiedCount: stats.BridgeRectifiedCount, RoadInspected: stats.RoadInspected, RoadProblemCount: stats.RoadProblemCount, RoadRectifiedCount: stats.RoadRectifiedCount}
}

// LedgerStreetRows 返回按建设年份、街道及落点组织排序的基础行，不加载业务 JSON。
func (s *IssueService) LedgerStreetRows(ctx context.Context, q LedgerReportQuery) (*LedgerPartResult[StreetLedgerBaseRow], error) {
	groups, err := s.loadLedgerPartGroups(ctx, q, true, false)
	if err != nil {
		return nil, err
	}
	result := &LedgerPartResult[StreetLedgerBaseRow]{
		Query: appliedLedgerQuery(q), Rows: []StreetLedgerBaseRow{},
		Notes: []string{"自然村、村级报表签字和电话尚未采集。"},
	}
	for _, group := range groups {
		result.Rows = append(result.Rows, buildStreetBaseRow(group))
	}
	return result, nil
}

// LedgerStreetStatistics 批量计算台账记录指标，缺失值保持 null，不替代资产基线。
func (s *IssueService) LedgerStreetStatistics(ctx context.Context, q LedgerReportQuery) (*LedgerPartResult[StreetLedgerStatisticsRow], error) {
	groups, err := s.loadLedgerPartGroups(ctx, q, true, true)
	if err != nil {
		return nil, err
	}
	result := &LedgerPartResult[StreetLedgerStatisticsRow]{
		Query: appliedLedgerQuery(q), Rows: []StreetLedgerStatisticsRow{},
		Notes: []string{
			"道路千米数、林网株数为当前筛选内上报记录的已采集字段合计，未按资产去重，不代表全村资产总量。",
			"机井/桥涵闸/变压器移交及现有数量尚未采集，以 — 表示，不用问题条数代替。",
			"道路或林网存在缺失/无效字段时对应合计为 —；报表当前只读，不提供未接入持久化的移交数量编辑。",
		},
	}
	for _, group := range groups {
		result.Rows = append(result.Rows, buildStreetStatisticsRow(group))
	}
	return result, nil
}

// LedgerSurveyRows 跨建设年份生成组织基础行，不为没有记录的组织生成虚构零行。
func (s *IssueService) LedgerSurveyRows(ctx context.Context, q LedgerReportQuery) (*LedgerPartResult[SurveyLedgerBaseRow], error) {
	groups, err := s.loadLedgerPartGroups(ctx, q, false, false)
	if err != nil {
		return nil, err
	}
	result := &LedgerPartResult[SurveyLedgerBaseRow]{
		Query: appliedLedgerQuery(q), Rows: []SurveyLedgerBaseRow{},
		Notes: []string{"自然村、村级联系人、电话及报表签字尚未采集。"},
	}
	for _, group := range groups {
		result.Rows = append(result.Rows, buildSurveyBaseRow(group))
	}
	return result, nil
}

// LedgerSurveyStatistics 按组织计算当前问题及整改记录，正常直接完成不计为整改。
func (s *IssueService) LedgerSurveyStatistics(ctx context.Context, q LedgerReportQuery) (*LedgerPartResult[SurveyLedgerStatisticsRow], error) {
	groups, err := s.loadLedgerPartGroups(ctx, q, false, true)
	if err != nil {
		return nil, err
	}
	result := &LedgerPartResult[SurveyLedgerStatisticsRow]{
		Query: appliedLedgerQuery(q), Rows: []SurveyLedgerStatisticsRow{},
		Notes: []string{
			"问题数量按当前保存的排查清单判定异常的上报记录计数；整改数量仅统计其中当前状态为已整改的记录。正常排查直接完成不算整改。",
			"统计反映当前有效记录状态，不是资产总量或历史整改次数；重新整改只按当前状态计数，不累加往轮完成次数。",
			"统计未按设施去重；完整排查任务、资产基线及当前全量运行状态尚未建立，已排查设施总数、正常机井总数及是否全面完成排查均为 —。",
			"历史记录清单不完整时对应类型的问题及整改数量为 —。",
		},
	}
	for _, group := range groups {
		result.Rows = append(result.Rows, buildSurveyStatisticsRow(group))
	}
	return result, nil
}
