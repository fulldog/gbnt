package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"

	"gbnt/apps/server/internal/model"
	"gorm.io/gorm"
)

// ErrHandoverArgument 表示移交数量入参无效。
var ErrHandoverArgument = errors.New("移交数量参数无效")

// ErrHandoverExists 表示同一组织同一建设年份已有未删除的移交数量。
var ErrHandoverExists = errors.New("该组织该建设年份已有移交数量")

// ErrHandoverDeletedOccupies 表示目标组织年度被已删除记录占用，应通过新建恢复。
var ErrHandoverDeletedOccupies = errors.New("该组织该建设年份存在已删除记录，请新建以恢复")

// HandoverInput 移交数量写入参数。数量为非负整数，0 合法。
type HandoverInput struct {
	OrgID               uint64 `json:"org_id"`               // 落点组织 ID，必填，须在当前可见范围内
	ProjectYear         int    `json:"project_year"`         // 建设年份，必填，仅 2020–2023
	WellHandover        int64  `json:"well_handover"`        // 机井移交数量，非负
	BridgeHandover      int64  `json:"bridge_handover"`      // 桥、涵、闸移交数量，非负
	RoadHandover        int64  `json:"road_handover"`        // 道路移交数量，非负，不是千米
	ForestHandover      int64  `json:"forest_handover"`      // 独立林网移交株数，非负
	TransformerHandover int64  `json:"transformer_handover"` // 变压器移交数量，非负
	Remark              string `json:"remark"`               // 备注，选填，最长 255 字
}

// HandoverListQuery 移交数量列表筛选。
type HandoverListQuery struct {
	OrgID       uint64 // 组织 ID；0 不限，非 0 时含该组织及下级
	ProjectYear int    // 建设年份；0 不限
	Page        int    // 页码，默认 1
	Size        int    // 每页条数，默认 20，最大 100
}

// HandoverVO 移交数量读取视图，组织缺失时名称为 null。
type HandoverVO struct {
	ID                  uint64  `json:"id"`                   // 主键
	OrgID               uint64  `json:"org_id"`               // 落点组织 ID
	OrgName             *string `json:"org_name"`             // 组织名称；组织已删除时为 null
	ProjectYear         int     `json:"project_year"`         // 建设年份
	WellHandover        int64   `json:"well_handover"`        // 机井移交数量
	BridgeHandover      int64   `json:"bridge_handover"`      // 桥、涵、闸移交数量
	RoadHandover        int64   `json:"road_handover"`        // 道路移交数量
	ForestHandover      int64   `json:"forest_handover"`      // 独立林网移交株数
	TransformerHandover int64   `json:"transformer_handover"` // 变压器移交数量
	Remark              string  `json:"remark"`               // 备注
}

// HandoverListResult 移交数量分页结果，无记录时 list 为 []。
type HandoverListResult struct {
	List  []HandoverVO `json:"list"`  // 当前页
	Total int64        `json:"total"` // 筛选后的总条数
	Page  int          `json:"page"`  // 实际页码
	Size  int          `json:"size"`  // 实际每页条数
}

func validateHandoverInput(in *HandoverInput) error {
	in.Remark = strings.TrimSpace(in.Remark)
	if in.OrgID == 0 {
		return fmt.Errorf("%w：请选择组织", ErrHandoverArgument)
	}
	if !model.ProjectYear(in.ProjectYear).Valid() {
		return fmt.Errorf("%w：建设年份仅支持 2020–2023", ErrHandoverArgument)
	}
	for _, item := range []struct {
		name  string
		value int64
	}{
		{"机井移交数量", in.WellHandover},
		{"桥涵闸移交数量", in.BridgeHandover},
		{"道路移交数量", in.RoadHandover},
		{"独立林网移交株数", in.ForestHandover},
		{"变压器移交数量", in.TransformerHandover},
	} {
		if item.value < 0 {
			return fmt.Errorf("%w：%s不能为负数", ErrHandoverArgument, item.name)
		}
	}
	if utf8.RuneCountInString(in.Remark) > 255 {
		return fmt.Errorf("%w：备注不能超过 255 字", ErrHandoverArgument)
	}
	return nil
}

func (s *IssueService) requireVisibleOrg(ctx context.Context, orgID uint64) error {
	scope, err := resolveVisibleOrgScope(ctx, s.db(ctx))
	if err != nil {
		return err
	}
	if !scope.Allows(orgID) {
		return ErrOrgScopeForbidden
	}
	var count int64
	if err := s.db(ctx).Model(&model.SysOrg{}).Where("id = ?", orgID).Count(&count).Error; err != nil {
		return err
	}
	if count == 0 {
		return fmt.Errorf("%w：组织不存在", ErrHandoverArgument)
	}
	return nil
}

func handoverValues(in HandoverInput) map[string]any {
	return map[string]any{
		"org_id": in.OrgID, "project_year": in.ProjectYear,
		"well_handover": in.WellHandover, "bridge_handover": in.BridgeHandover,
		"road_handover": in.RoadHandover, "forest_handover": in.ForestHandover,
		"transformer_handover": in.TransformerHandover, "remark": in.Remark, "is_delete": 0,
	}
}

// ListHandovers 按可见组织范围分页返回移交数量。
func (s *IssueService) ListHandovers(ctx context.Context, q HandoverListQuery) (*HandoverListResult, error) {
	q.Page, q.Size = NormalizePagination(q.Page, q.Size, 100)
	result := &HandoverListResult{List: []HandoverVO{}, Total: 0, Page: q.Page, Size: q.Size}
	if q.ProjectYear != 0 && !model.ProjectYear(q.ProjectYear).Valid() {
		return nil, fmt.Errorf("%w：建设年份仅支持 2020–2023", ErrHandoverArgument)
	}
	var orgs []model.SysOrg
	if err := s.db(ctx).Select("id", "parent_id", "name", "type").Find(&orgs).Error; err != nil {
		return nil, err
	}
	db, err := applyVisibleOrgFilterWithOrgs(ctx, s.db(ctx).Model(&model.OrgHandover{}), "org_id", q.OrgID, orgs)
	if err != nil {
		return nil, err
	}
	if q.ProjectYear != 0 {
		db = db.Where("project_year = ?", q.ProjectYear)
	}
	if err := db.Count(&result.Total).Error; err != nil {
		return nil, err
	}
	rows := make([]model.OrgHandover, 0)
	if err := db.Order("project_year DESC, id DESC").Offset((q.Page - 1) * q.Size).Limit(q.Size).Find(&rows).Error; err != nil {
		return nil, err
	}
	names := map[uint64]string{}
	for _, org := range orgs {
		names[org.ID] = org.Name
	}
	for _, row := range rows {
		result.List = append(result.List, handoverVO(row, names))
	}
	return result, nil
}

// GetHandover 读取一条可见范围内的移交数量。
func (s *IssueService) GetHandover(ctx context.Context, id uint64) (*HandoverVO, error) {
	row, err := s.visibleHandover(ctx, id)
	if err != nil {
		return nil, err
	}
	names, err := s.orgNames(ctx, []uint64{row.OrgID})
	if err != nil {
		return nil, err
	}
	vo := handoverVO(*row, names)
	return &vo, nil
}

// CreateHandover 新增移交数量；同一组织同一年已软删时恢复并覆盖。
func (s *IssueService) CreateHandover(ctx context.Context, in HandoverInput) (*HandoverVO, error) {
	if err := validateHandoverInput(&in); err != nil {
		return nil, err
	}
	if err := s.requireVisibleOrg(ctx, in.OrgID); err != nil {
		return nil, err
	}
	var existing model.OrgHandover
	err := s.db(ctx).Unscoped().Where("org_id = ? AND project_year = ?", in.OrgID, in.ProjectYear).First(&existing).Error
	if err == nil {
		if existing.IsDelete == 0 {
			return nil, ErrHandoverExists
		}
		if err := s.db(ctx).Unscoped().Model(&existing).Updates(handoverValues(in)).Error; err != nil {
			return nil, err
		}
		existing.IsDelete = 0
		return s.handoverByID(ctx, existing.ID)
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	row := model.OrgHandover{
		OrgID: in.OrgID, ProjectYear: in.ProjectYear, WellHandover: in.WellHandover,
		BridgeHandover: in.BridgeHandover, RoadHandover: in.RoadHandover, ForestHandover: in.ForestHandover,
		TransformerHandover: in.TransformerHandover, Remark: in.Remark,
	}
	if err := s.db(ctx).Create(&row).Error; err != nil {
		return nil, err
	}
	return s.handoverByID(ctx, row.ID)
}

// UpdateHandover 更新移交数量。改到已被软删记录占用的组织年度时拒绝，避免和恢复语义冲突。
func (s *IssueService) UpdateHandover(ctx context.Context, id uint64, in HandoverInput) (*HandoverVO, error) {
	if err := validateHandoverInput(&in); err != nil {
		return nil, err
	}
	row, err := s.visibleHandover(ctx, id)
	if err != nil {
		return nil, err
	}
	if err := s.requireVisibleOrg(ctx, in.OrgID); err != nil {
		return nil, err
	}
	var other model.OrgHandover
	err = s.db(ctx).Unscoped().Where("org_id = ? AND project_year = ? AND id <> ?", in.OrgID, in.ProjectYear, row.ID).First(&other).Error
	if err == nil {
		if other.IsDelete == 0 {
			return nil, ErrHandoverExists
		}
		return nil, ErrHandoverDeletedOccupies
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	if err := s.db(ctx).Model(row).Updates(handoverValues(in)).Error; err != nil {
		return nil, err
	}
	return s.handoverByID(ctx, row.ID)
}

// DeleteHandover 软删除可见范围内的移交数量。
func (s *IssueService) DeleteHandover(ctx context.Context, id uint64) error {
	row, err := s.visibleHandover(ctx, id)
	if err != nil {
		return err
	}
	return s.db(ctx).Delete(row).Error
}

func (s *IssueService) visibleHandover(ctx context.Context, id uint64) (*model.OrgHandover, error) {
	var row model.OrgHandover
	if err := s.db(ctx).First(&row, id).Error; err != nil {
		return nil, err
	}
	if err := s.requireVisibleOrg(ctx, row.OrgID); err != nil {
		return nil, err
	}
	return &row, nil
}

func (s *IssueService) handoverByID(ctx context.Context, id uint64) (*HandoverVO, error) {
	var row model.OrgHandover
	if err := s.db(ctx).First(&row, id).Error; err != nil {
		return nil, err
	}
	names, err := s.orgNames(ctx, []uint64{row.OrgID})
	if err != nil {
		return nil, err
	}
	vo := handoverVO(row, names)
	return &vo, nil
}

func (s *IssueService) orgNames(ctx context.Context, ids []uint64) (map[uint64]string, error) {
	names := map[uint64]string{}
	if len(ids) == 0 {
		return names, nil
	}
	var orgs []model.SysOrg
	if err := s.db(ctx).Select("id", "name").Where("id IN ?", ids).Find(&orgs).Error; err != nil {
		return nil, err
	}
	for _, org := range orgs {
		names[org.ID] = org.Name
	}
	return names, nil
}

func handoverVO(row model.OrgHandover, names map[uint64]string) HandoverVO {
	vo := HandoverVO{
		ID: row.ID, OrgID: row.OrgID, ProjectYear: row.ProjectYear,
		WellHandover: row.WellHandover, BridgeHandover: row.BridgeHandover, RoadHandover: row.RoadHandover,
		ForestHandover: row.ForestHandover, TransformerHandover: row.TransformerHandover, Remark: row.Remark,
	}
	if name, ok := names[row.OrgID]; ok {
		vo.OrgName = &name
	}
	return vo
}

// loadStreetHandoverIndex 读取当前组织范围和街道筛选内的移交数量，不按上报日期过滤。
func (s *IssueService) loadStreetHandoverIndex(ctx context.Context, q LedgerReportQuery, orgs map[uint64]model.SysOrg) (map[string]model.OrgHandover, error) {
	list := make([]model.SysOrg, 0, len(orgs))
	for _, org := range orgs {
		list = append(list, org)
	}
	db, err := applyVisibleOrgFilterWithOrgs(ctx, s.db(ctx).Model(&model.OrgHandover{}), "org_id", q.StreetOrgID, list)
	if err != nil {
		return nil, err
	}
	rows := make([]model.OrgHandover, 0)
	if err := db.Find(&rows).Error; err != nil {
		return nil, err
	}
	index := make(map[string]model.OrgHandover, len(rows))
	for _, row := range rows {
		index[fmt.Sprintf("%d:%d", row.ProjectYear, row.OrgID)] = row
	}
	return index, nil
}

// appendHandoverGroups 把没有上报记录的移交分组并入街道台账，并按原排序重排。
func appendHandoverGroups(groups []reportGroup, handovers map[string]model.OrgHandover, orgs map[uint64]model.SysOrg) ([]reportGroup, error) {
	seen := map[string]struct{}{}
	for _, group := range groups {
		seen[group.location.RowKey] = struct{}{}
	}
	added := false
	for _, row := range handovers {
		key := fmt.Sprintf("%d:%d", row.ProjectYear, row.OrgID)
		if _, ok := seen[key]; ok {
			continue
		}
		location := ledgerReportLocation(row.OrgID, orgs)
		location.RowKey = key
		group := reportGroup{location: location, year: row.ProjectYear}
		if err := validateLedgerGroup(group); err != nil {
			return nil, err
		}
		groups = append(groups, group)
		seen[key] = struct{}{}
		added = true
	}
	if added {
		sortReportGroups(groups)
	}
	return groups, nil
}

// applyStreetHandover 用移交表覆盖机井、桥涵闸、变压器、道路和林网移交数量；0 保留为 0。
func applyStreetHandover(row *StreetLedgerStatisticsRow, handover *model.OrgHandover) {
	if handover == nil {
		return
	}
	well, bridge, road, transformer := handover.WellHandover, handover.BridgeHandover, handover.RoadHandover, handover.TransformerHandover
	forest := float64(handover.ForestHandover)
	row.WellHandover = &well
	row.BridgeHandover = &bridge
	row.RoadHandover = &road
	row.TransformerHandover = &transformer
	row.ForestHandover = &forest
}
