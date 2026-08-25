package service

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"gbnt/backend/internal/model"
)

// IssueService 排查/整改业务。
type IssueService struct {
	DB     *gorm.DB
	Attach *AttachService
}

// IssueQuery 列表筛选。
type IssueQuery struct {
	Type    string // 问题类型；空或 all 不限
	Status  string // pending|done|all
	Street  string // 街道
	Village string // 村/社区
	Keyword string // 编号/描述/项目名模糊
	Page    int    // 页码，默认 1
	Size    int    // 每页条数，默认 20
}

// IssueInput 创建/更新入参，公共字段对齐 demo/miniapp/report.html。
// 新建：file_uuids → 建关联，落库 photo_ref_uuid；type_ext 按 type 校验（WellExt 等）。
// 修改：photo_ref_uuid 有值则附件不变；为空则用 file_uuids 重新关联。
type IssueInput struct {
	Type          string          `json:"type"`           // 问题类型 well/road/bridge/forest/transformer（必填）
	Street        string          `json:"street"`         // 街道（区划，必填）
	Village       string          `json:"village"`        // 村/社区（区划，必填）
	ProjectName   string          `json:"project_name"`   // 项目名称（必填）
	Code          string          `json:"code"`           // 设施编号（选填）
	LocationText  string          `json:"location_text"`  // 位置描述（与 address 至少填一项）
	Address       string          `json:"address"`        // 定位地址（与 location_text 至少填一项）
	Lat           float64         `json:"lat"`            // 纬度
	Lng           float64         `json:"lng"`            // 经度
	Description   string          `json:"description"`    // 问题描述（必填）
	Measures      string          `json:"measures"`       // 整改措施（必填）
	PlanDate      string          `json:"plan_date"`      // 计划整改完成日 YYYY-MM-DD（必填）
	ReporterName  string          `json:"reporter_name"`  // 上报人姓名（空则用登录用户）
	ReporterPhone string          `json:"reporter_phone"` // 上报人电话（选填）
	AssigneeName  string          `json:"assignee_name"`  // 整改责任人（必填）
	AssigneePhone string          `json:"assignee_phone"` // 整改责任人电话（必填）
	FileUUIDs     []string        `json:"file_uuids"`     // 现场照片 file_id 列表（新建必填）
	PhotoRefUUID  string          `json:"photo_ref_uuid"` // 修改：有值=附件不变；空=用 file_uuids 重绑
	TypeExt       json.RawMessage `json:"type_ext"`       // 类型专有字段 JSON（新建必填，见 WellExt 等）
	Status        string          `json:"status"`         // 更新用；新建忽略，固定 pending
}

// IssueVO 业务明细/列表项（含反查后的文件 list）。
type IssueVO struct {
	model.Issue
	Photos        []FileItem `json:"photos"`         // 现场照片 [{file_id,url}]
	RectifyPhotos []FileItem `json:"rectify_photos"` // 整改照片
}

func (s *IssueService) toVO(item *model.Issue) (*IssueVO, error) {
	vo := &IssueVO{Issue: *item}
	photos, err := s.Attach.Resolve(item.PhotoRefUUID)
	if err != nil && item.PhotoRefUUID != "" {
		return nil, err
	}
	if photos == nil {
		photos = []FileItem{}
	}
	vo.Photos = photos
	rectify, err := s.Attach.Resolve(item.RectifyPhotoRefUUID)
	if err != nil && item.RectifyPhotoRefUUID != "" {
		return nil, err
	}
	if rectify == nil {
		rectify = []FileItem{}
	}
	vo.RectifyPhotos = rectify
	return vo, nil
}

func (s *IssueService) List(q IssueQuery) ([]IssueVO, int64, error) {
	if q.Page <= 0 {
		q.Page = 1
	}
	if q.Size <= 0 {
		q.Size = 20
	}
	db := s.applyIssueFilters(s.DB.Model(&model.Issue{}), q)
	var total int64
	_ = db.Count(&total).Error
	var list []model.Issue
	if err := db.Order("id DESC").Offset((q.Page - 1) * q.Size).Limit(q.Size).Find(&list).Error; err != nil {
		return nil, 0, err
	}
	out := make([]IssueVO, 0, len(list))
	for i := range list {
		vo, err := s.toVO(&list[i])
		if err != nil {
			return nil, 0, err
		}
		out = append(out, *vo)
	}
	return out, total, nil
}

// applyIssueFilters 列表通用筛选（status=all 表示不按状态过滤）。
func (s *IssueService) applyIssueFilters(db *gorm.DB, q IssueQuery) *gorm.DB {
	if q.Type != "" && q.Type != "all" {
		db = db.Where("type = ?", q.Type)
	}
	if q.Status != "" && q.Status != "all" {
		db = db.Where("status = ?", q.Status)
	}
	if q.Street != "" && q.Street != "all" {
		db = db.Where("street = ?", q.Street)
	}
	if q.Village != "" && q.Village != "all" {
		db = db.Where("village = ?", q.Village)
	}
	if q.Keyword != "" {
		like := "%" + q.Keyword + "%"
		db = db.Where("code LIKE ? OR description LIKE ? OR project_name LIKE ?", like, like, like)
	}
	return db
}

// ListTodos 小程序待办列表：未传 status 时默认 pending；status=all 表示不限状态。
func (s *IssueService) ListTodos(q IssueQuery) ([]IssueVO, int64, error) {
	if q.Status == "" {
		q.Status = "pending"
	}
	if q.Status == "all" {
		q.Status = "" // List 中空 status 表示不筛选
	}
	return s.List(q)
}

// MineStats 小程序「我的」概览：我上报 / 与我相关的待整改 / 已整改。
// [PRD] reported=本人上报；pending|done=本人上报或整改责任人同名。
func (s *IssueService) MineStats(userID uint64, userName string) (map[string]int64, error) {
	var reported, pending, done int64
	if err := s.DB.Model(&model.Issue{}).Where("reporter_id = ?", userID).Count(&reported).Error; err != nil {
		return nil, err
	}
	if err := s.DB.Model(&model.Issue{}).Where(
		"(reporter_id = ? OR assignee_name = ?) AND status = ?", userID, userName, "pending",
	).Count(&pending).Error; err != nil {
		return nil, err
	}
	if err := s.DB.Model(&model.Issue{}).Where(
		"(reporter_id = ? OR assignee_name = ?) AND status = ?", userID, userName, "done",
	).Count(&done).Error; err != nil {
		return nil, err
	}
	return map[string]int64{
		"reported": reported,
		"pending":  pending,
		"done":     done,
	}, nil
}

// ListMine 小程序「我的」清单，scope=reported|pending|done。
func (s *IssueService) ListMine(scope string, userID uint64, userName string, page, size int) ([]IssueVO, int64, error) {
	if page <= 0 {
		page = 1
	}
	if size <= 0 {
		size = 20
	}
	db := s.DB.Model(&model.Issue{})
	switch scope {
	case "reported":
		db = db.Where("reporter_id = ?", userID)
	case "pending":
		db = db.Where("(reporter_id = ? OR assignee_name = ?) AND status = ?", userID, userName, "pending")
	case "done":
		db = db.Where("(reporter_id = ? OR assignee_name = ?) AND status = ?", userID, userName, "done")
	default:
		return nil, 0, errors.New("scope 须为 reported|pending|done")
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var list []model.Issue
	if err := db.Order("id DESC").Offset((page - 1) * size).Limit(size).Find(&list).Error; err != nil {
		return nil, 0, err
	}
	out := make([]IssueVO, 0, len(list))
	for i := range list {
		vo, err := s.toVO(&list[i])
		if err != nil {
			return nil, 0, err
		}
		out = append(out, *vo)
	}
	return out, total, nil
}

func (s *IssueService) Get(id uint64) (*IssueVO, error) {
	var item model.Issue
	if err := s.DB.First(&item, id).Error; err != nil {
		return nil, err
	}
	return s.toVO(&item)
}

func (s *IssueService) db(ctx context.Context) *gorm.DB {
	if ctx == nil {
		return s.DB
	}
	return s.DB.WithContext(ctx)
}

func (s *IssueService) Create(ctx context.Context, in IssueInput, reporterID uint64, reporterName string) (*IssueVO, error) {
	ext, err := validateIssueCreate(in)
	if err != nil {
		return nil, err
	}
	refUUID, _, err := s.Attach.Bind(ctx, in.FileUUIDs)
	if err != nil {
		return nil, err
	}
	name := in.ReporterName
	if name == "" {
		name = reporterName
	}
	item := &model.Issue{
		IssueKey:      "issue-" + uuid.NewString()[:8],
		Type:          in.Type,
		Street:        in.Street,
		Village:       in.Village,
		ProjectName:   in.ProjectName,
		Code:          in.Code,
		LocationText:  in.LocationText,
		Address:       in.Address,
		Lat:           in.Lat,
		Lng:           in.Lng,
		Description:   in.Description,
		Measures:      in.Measures,
		PlanDate:      in.PlanDate,
		Status:        "pending", // [PRD] 提交排查 = 生成待整改
		ReporterID:    reporterID,
		ReporterName:  name,
		ReporterPhone: in.ReporterPhone,
		AssigneeName:  in.AssigneeName,
		AssigneePhone: in.AssigneePhone,
		TypeExt:       ext,
		PhotoRefUUID:  refUUID,
	}
	if err := s.db(ctx).Create(item).Error; err != nil {
		return nil, err
	}
	return s.toVO(item)
}

func (s *IssueService) Update(ctx context.Context, id uint64, in IssueInput) (*IssueVO, error) {
	var item model.Issue
	if err := s.DB.First(&item, id).Error; err != nil {
		return nil, err
	}
	ext := item.TypeExt
	if len(in.TypeExt) > 0 {
		typ := in.Type
		if typ == "" {
			typ = item.Type
		}
		canon, err := validateTypeExt(typ, in.TypeExt)
		if err != nil {
			return nil, err
		}
		ext = canon
	}

	// 附件：传了关联 uuid → 认为无变化；为空 → 用 file_uuids 重新关联
	photoRef := item.PhotoRefUUID
	if in.PhotoRefUUID != "" {
		// 前端带回关联 uuid：附件不变
		photoRef = item.PhotoRefUUID
	} else {
		if len(in.FileUUIDs) == 0 {
			return nil, errors.New("photo_ref_uuid 为空时须传 file_uuids 重新关联")
		}
		ref, _, err := s.Attach.Bind(ctx, in.FileUUIDs)
		if err != nil {
			return nil, err
		}
		photoRef = ref
	}

	updates := map[string]interface{}{
		"type": in.Type, "street": in.Street, "village": in.Village,
		"project_name": in.ProjectName, "code": in.Code,
		"location_text": in.LocationText, "address": in.Address,
		"lat": in.Lat, "lng": in.Lng,
		"description": in.Description, "measures": in.Measures,
		"plan_date": in.PlanDate, "assignee_name": in.AssigneeName,
		"assignee_phone": in.AssigneePhone, "type_ext": ext,
		"photo_ref_uuid": photoRef,
	}
	if in.Status != "" {
		updates["status"] = in.Status
	}
	if err := s.db(ctx).Model(&item).Updates(updates).Error; err != nil {
		return nil, err
	}
	return s.Get(id)
}

func (s *IssueService) Delete(ctx context.Context, id uint64) error {
	// 软删：is_delete=1
	return s.db(ctx).Delete(&model.Issue{}, id).Error
}

// RectifyInput 整改入参。
type RectifyInput struct {
	Note                string   `json:"note"`                   // 整改说明
	FileUUIDs           []string `json:"file_uuids"`             // 整改照片 file_id 列表；rectify_photo_ref_uuid 为空时必填
	RectifyPhotoRefUUID string   `json:"rectify_photo_ref_uuid"` // 有值=整改附件不变；空=用 file_uuids 重绑
}

// ImportIssuesReq 管理端批量导入。
type ImportIssuesReq struct {
	Rows []IssueInput `json:"rows" binding:"required"` // 导入行，校验规则同新建
}

// Rectify 提交整改照片闭环。
func (s *IssueService) Rectify(ctx context.Context, id uint64, in RectifyInput) (*IssueVO, error) {
	var item model.Issue
	if err := s.DB.First(&item, id).Error; err != nil {
		return nil, err
	}
	ref := item.RectifyPhotoRefUUID
	if in.RectifyPhotoRefUUID != "" {
		// 传了关联 uuid：整改附件不变
		ref = item.RectifyPhotoRefUUID
	} else {
		if len(in.FileUUIDs) == 0 {
			return nil, errors.New("rectify_photo_ref_uuid 为空时须传 file_uuids")
		}
		r, _, err := s.Attach.Bind(ctx, in.FileUUIDs)
		if err != nil {
			return nil, err
		}
		ref = r
	}
	now := time.Now()
	if err := s.db(ctx).Model(&model.Issue{}).Where("id = ?", id).Updates(map[string]interface{}{
		"status":                 "done",
		"rectify_note":           in.Note,
		"rectify_at":             &now,
		"rectify_photo_ref_uuid": ref,
	}).Error; err != nil {
		return nil, err
	}
	return s.Get(id)
}

func (s *IssueService) Import(ctx context.Context, rows []IssueInput, reporterID uint64, reporterName string) (int, error) {
	n := 0
	for _, row := range rows {
		if _, err := s.Create(ctx, row, reporterID, reporterName); err != nil {
			return n, err
		}
		n++
	}
	return n, nil
}

// Stats 工作台指标。
func (s *IssueService) Stats() (map[string]interface{}, error) {
	var total, pending, done int64
	s.DB.Model(&model.Issue{}).Count(&total)
	s.DB.Model(&model.Issue{}).Where("status = ?", "pending").Count(&pending)
	s.DB.Model(&model.Issue{}).Where("status = ?", "done").Count(&done)
	byType := map[string]int64{}
	for _, t := range []string{"well", "road", "bridge", "forest", "transformer"} {
		var c int64
		s.DB.Model(&model.Issue{}).Where("type = ?", t).Count(&c)
		byType[t] = c
	}
	rate := float64(0)
	if total > 0 {
		rate = float64(done) / float64(total) * 100
	}
	return map[string]interface{}{
		"total": total, "pending": pending, "done": done,
		"complete_rate": rate, "by_type": byType,
	}, nil
}

// LedgerStreet 按村聚合街道台账。
func (s *IssueService) LedgerStreet(street, from, to string) (interface{}, error) {
	q := s.DB.Model(&model.Issue{})
	if street != "" {
		q = q.Where("street = ?", street)
	}
	if from != "" {
		q = q.Where("DATE(created_at) >= ?", from)
	}
	if to != "" {
		q = q.Where("DATE(created_at) <= ?", to)
	}
	type row struct {
		Village string `json:"village"`
		Type    string `json:"type"`
		Total   int64  `json:"total"`
		Pending int64  `json:"pending"`
		Done    int64  `json:"done"`
	}
	var list []row
	err := q.Select("village, type, COUNT(*) as total, SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending, SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) as done").
		Group("village, type").Scan(&list).Error
	return ginH{"rows": list, "street": street}, err
}

// LedgerSurvey 排查汇总。
func (s *IssueService) LedgerSurvey(street, from, to string) (interface{}, error) {
	q := s.DB.Model(&model.Issue{})
	if street != "" {
		q = q.Where("street = ?", street)
	}
	if from != "" {
		q = q.Where("DATE(created_at) >= ?", from)
	}
	if to != "" {
		q = q.Where("DATE(created_at) <= ?", to)
	}
	type row struct {
		Type    string `json:"type"`
		Total   int64  `json:"total"`
		Pending int64  `json:"pending"`
		Done    int64  `json:"done"`
	}
	var list []row
	err := q.Select("type, COUNT(*) as total, SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending, SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) as done").
		Group("type").Scan(&list).Error
	return ginH{"rows": list, "street": street}, err
}

type ginH map[string]interface{}
