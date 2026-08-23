package service

import (
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"gbnt/backend/internal/model"
)

// IssueService 排查/整改业务。
type IssueService struct {
	DB *gorm.DB
}

// IssueQuery 列表筛选。
type IssueQuery struct {
	Type, Status, Street, Village, Keyword string
	Page, Size                             int
}

// IssueInput 创建/更新入参（业务层用 UUID 关联附件）。
type IssueInput struct {
	Type          string          `json:"type"`
	Street        string          `json:"street"`
	Village       string          `json:"village"`
	ProjectName   string          `json:"project_name"`
	Code          string          `json:"code"`
	LocationText  string          `json:"location_text"`
	Address       string          `json:"address"`
	Lat           float64         `json:"lat"`
	Lng           float64         `json:"lng"`
	Description   string          `json:"description"`
	Measures      string          `json:"measures"`
	PlanDate      string          `json:"plan_date"`
	ReporterName  string          `json:"reporter_name"`
	ReporterPhone string          `json:"reporter_phone"`
	AssigneeName  string          `json:"assignee_name"`
	AssigneePhone string          `json:"assignee_phone"`
	PhotoUUIDs    []string        `json:"photo_uuids"`
	TypeExt       json.RawMessage `json:"type_ext"`
	Status        string          `json:"status"`
}

func (s *IssueService) List(q IssueQuery) ([]model.Issue, int64, error) {
	if q.Page <= 0 {
		q.Page = 1
	}
	if q.Size <= 0 {
		q.Size = 20
	}
	db := s.DB.Model(&model.Issue{})
	if q.Type != "" {
		db = db.Where("type = ?", q.Type)
	}
	if q.Status != "" {
		db = db.Where("status = ?", q.Status)
	}
	if q.Street != "" {
		db = db.Where("street = ?", q.Street)
	}
	if q.Village != "" {
		db = db.Where("village = ?", q.Village)
	}
	if q.Keyword != "" {
		like := "%" + q.Keyword + "%"
		db = db.Where("code LIKE ? OR description LIKE ? OR project_name LIKE ?", like, like, like)
	}
	var total int64
	_ = db.Count(&total).Error
	var list []model.Issue
	err := db.Order("id DESC").Offset((q.Page - 1) * q.Size).Limit(q.Size).Find(&list).Error
	return list, total, err
}

func (s *IssueService) Get(id uint64) (*model.Issue, error) {
	var item model.Issue
	if err := s.DB.First(&item, id).Error; err != nil {
		return nil, err
	}
	return &item, nil
}

func (s *IssueService) Create(in IssueInput, reporterID uint64, reporterName string) (*model.Issue, error) {
	if in.Type == "" {
		return nil, errors.New("type 必填")
	}
	if len(in.PhotoUUIDs) == 0 {
		return nil, errors.New("photo_uuids 至少 1 个")
	}
	ext := "{}"
	if len(in.TypeExt) > 0 {
		ext = string(in.TypeExt)
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
		PhotoUUIDs:    strings.Join(in.PhotoUUIDs, ","),
	}
	if err := s.DB.Create(item).Error; err != nil {
		return nil, err
	}
	return item, nil
}

func (s *IssueService) Update(id uint64, in IssueInput) (*model.Issue, error) {
	var item model.Issue
	if err := s.DB.First(&item, id).Error; err != nil {
		return nil, err
	}
	ext := item.TypeExt
	if len(in.TypeExt) > 0 {
		ext = string(in.TypeExt)
	}
	photos := item.PhotoUUIDs
	if len(in.PhotoUUIDs) > 0 {
		photos = strings.Join(in.PhotoUUIDs, ",")
	}
	updates := map[string]interface{}{
		"type": in.Type, "street": in.Street, "village": in.Village,
		"project_name": in.ProjectName, "code": in.Code,
		"location_text": in.LocationText, "address": in.Address,
		"lat": in.Lat, "lng": in.Lng,
		"description": in.Description, "measures": in.Measures,
		"plan_date": in.PlanDate, "assignee_name": in.AssigneeName,
		"assignee_phone": in.AssigneePhone, "type_ext": ext, "photo_uuids": photos,
	}
	if in.Status != "" {
		updates["status"] = in.Status
	}
	if err := s.DB.Model(&item).Updates(updates).Error; err != nil {
		return nil, err
	}
	_ = s.DB.First(&item, id)
	return &item, nil
}

func (s *IssueService) Delete(id uint64) error {
	return s.DB.Delete(&model.Issue{}, id).Error
}

// Rectify 提交整改照片闭环。
func (s *IssueService) Rectify(id uint64, note string, photoUUIDs []string) (*model.Issue, error) {
	if len(photoUUIDs) == 0 {
		return nil, errors.New("整改照片 photo_uuids 必填")
	}
	now := time.Now()
	if err := s.DB.Model(&model.Issue{}).Where("id = ?", id).Updates(map[string]interface{}{
		"status":              "done",
		"rectify_note":        note,
		"rectify_at":          &now,
		"rectify_photo_uuids": strings.Join(photoUUIDs, ","),
	}).Error; err != nil {
		return nil, err
	}
	return s.Get(id)
}

func (s *IssueService) Import(rows []IssueInput, reporterID uint64, reporterName string) (int, error) {
	n := 0
	for _, row := range rows {
		if _, err := s.Create(row, reporterID, reporterName); err != nil {
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

// LedgerStreet 按村聚合街道台账（简化版，对齐前端聚合口径）。
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

// LedgerSurvey 排查汇总（按类型计数）。
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

// ginH 避免 handler 包循环依赖的轻量 map。
type ginH map[string]interface{}
