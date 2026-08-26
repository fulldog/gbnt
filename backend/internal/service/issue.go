package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"strings"

	"gbnt/backend/internal/model"
)

// IssueService 排查/整改业务。
type IssueService struct {
	DB     *gorm.DB
	Attach *AttachService
}

// IssueQuery 列表筛选。
type IssueQuery struct {
	Type          string // 问题类型 well/road/bridge/forest/transformer；空或 all 不限
	Status        string // new|pending|done|all；空由调用方设默认
	Street        string // 街道名称（冗余字段筛选）
	Village       string // 村/社区名称（冗余字段筛选）
	RootOrgID     uint64 // 区划根组织 ID；0 不限
	DistrictOrgID uint64 // 区划区级组织 ID；0 不限
	StreetOrgID   uint64 // 区划街道组织 ID；0 不限
	VillageOrgID  uint64 // 区划村级组织 ID；0 不限
	ProjectYear   int    // 项目年度 2020–2023；0 不限
	Keyword       string // 编号/地址模糊
	Page          int    // 页码，默认 1
	Size          int    // 每页条数，默认 20
}

// IssueInput 创建/更新入参（对齐 miniapp 上报向导；责任人接口不传，库内可空）。
type IssueInput struct {
	Type                    string          `json:"type"`                       // 问题类型 well/road/bridge/forest/transformer（必填）
	ProjectYear             int             `json:"project_year"`               // 项目年度 2020–2023（新建必填）
	RootOrgID               uint64          `json:"root_org_id"`                // 区划根组织 ID（可空，与下级至少填一级）
	DistrictOrgID           uint64          `json:"district_org_id"`            // 区划区级组织 ID（可空）
	StreetOrgID             uint64          `json:"street_org_id"`              // 区划街道组织 ID（可空）
	VillageOrgID            uint64          `json:"village_org_id"`             // 区划村级组织 ID（可空）
	Code                    string          `json:"code"`                       // 设施编号（选填）
	Address                 string          `json:"address"`                    // 定位地址（必填）
	Lat                     float64         `json:"lat"`                        // 纬度
	Lng                     float64         `json:"lng"`                        // 经度
	PlanDate                string          `json:"plan_date"`                  // 计划整改完成日 YYYY-MM-DD；需整改时必填
	ReporterSignatureFileID string          `json:"reporter_signature_file_id"` // 排查电子签名 file_id（新建必填）
	TypeExt                 json.RawMessage `json:"type_ext"`                   // 类型扩展 JSON（含 checklist[] QuizBool，新建必填）
	Status                  string          `json:"status"`                     // 仅更新用 new|pending|done；新建由 quiz 推导
}

// IssueVO 业务明细/列表项。
type IssueVO struct {
	model.Issue
	TypeExtVO         json.RawMessage   `json:"type_ext"`                     // 解码并展开 photos 后的 type_ext
	ReporterSignature *FileItem         `json:"reporter_signature,omitempty"` // 排查签名 file_id + url
	RectifyRecords    []RectifyRecordVO `json:"rectify_records"`              // 历史整改记录（新→旧）
}

// RectifyRecordVO 单条整改记录（含照片 URL）。
type RectifyRecordVO struct {
	model.IssueRectifyRecord
	Photos []FileItem `json:"photos"` // 整改照片 file_id + 相对路径
}

// RectifyInput 整改入参。
type RectifyInput struct {
	Note      string   `json:"note"`       // 整改说明（必填）
	FileUUIDs []string `json:"file_uuids"` // 整改照片 file_id 列表（必填）
}

// ImportIssuesReq 管理端批量导入。
type ImportIssuesReq struct {
	Rows []IssueInput `json:"rows" binding:"required"` // 导入行，校验规则同新建 IssueInput
}

func (s *IssueService) db(ctx context.Context) *gorm.DB {
	if ctx == nil {
		return s.DB
	}
	return s.DB.WithContext(ctx)
}

func (s *IssueService) toVO(item *model.Issue) (*IssueVO, error) {
	ctx := context.Background()
	ext, err := s.hydrateTypeExt(ctx, item.Type, item.TypeExt)
	if err != nil {
		return nil, err
	}
	vo := &IssueVO{
		Issue:          *item,
		TypeExtVO:      ext,
		RectifyRecords: []RectifyRecordVO{},
	}
	if s.Attach != nil && strings.TrimSpace(item.ReporterSignatureFileID) != "" {
		if list, lookErr := s.Attach.lookupExisting(ctx, []string{item.ReporterSignatureFileID}); lookErr == nil && len(list) == 1 {
			sig := list[0]
			vo.ReporterSignature = &sig
		}
	}
	var records []model.IssueRectifyRecord
	if err := s.DB.Where("issue_id = ?", item.ID).Order("id DESC").Find(&records).Error; err != nil {
		return nil, err
	}
	out := make([]RectifyRecordVO, 0, len(records))
	for i := range records {
		ids := parseFileIDJSON(records[i].PhotoFileIDs)
		photos := []FileItem{}
		if s.Attach != nil && len(ids) > 0 {
			photos, _ = s.Attach.lookupExisting(ctx, ids)
		}
		out = append(out, RectifyRecordVO{IssueRectifyRecord: records[i], Photos: photos})
	}
	vo.RectifyRecords = out
	return vo, nil
}

func parseFileIDJSON(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "null" {
		return nil
	}
	var ids []string
	if err := json.Unmarshal([]byte(raw), &ids); err != nil {
		return nil
	}
	return ids
}

func (v IssueVO) MarshalJSON() ([]byte, error) {
	b, err := json.Marshal(v.Issue)
	if err != nil {
		return nil, err
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		return nil, err
	}
	var ext any
	if len(v.TypeExtVO) > 0 && string(v.TypeExtVO) != "null" {
		if err := json.Unmarshal(v.TypeExtVO, &ext); err != nil {
			m["type_ext"] = json.RawMessage(v.TypeExtVO)
		} else {
			m["type_ext"] = ext
		}
	}
	m["rectify_records"] = v.RectifyRecords
	if v.ReporterSignature != nil {
		m["reporter_signature"] = v.ReporterSignature
	}
	return json.Marshal(m)
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
	if q.RootOrgID > 0 {
		db = db.Where("root_org_id = ?", q.RootOrgID)
	}
	if q.DistrictOrgID > 0 {
		db = db.Where("district_org_id = ?", q.DistrictOrgID)
	}
	if q.StreetOrgID > 0 {
		db = db.Where("street_org_id = ?", q.StreetOrgID)
	}
	if q.VillageOrgID > 0 {
		db = db.Where("village_org_id = ?", q.VillageOrgID)
	}
	if q.ProjectYear > 0 {
		db = db.Where("project_year = ?", q.ProjectYear)
	}
	if q.Keyword != "" {
		like := "%" + q.Keyword + "%"
		db = db.Where("code LIKE ? OR address LIKE ?", like, like)
	}
	return db
}

// ListTodos 小程序待办：未传 status 默认 new。
func (s *IssueService) ListTodos(q IssueQuery) ([]IssueVO, int64, error) {
	if q.Status == "" {
		q.Status = string(model.IssueStatusNew)
	}
	if q.Status == "all" {
		q.Status = ""
	}
	return s.List(q)
}

func (s *IssueService) MineStats(userID uint64, userName string) (map[string]int64, error) {
	var reported, pending, done int64
	if err := s.DB.Model(&model.Issue{}).Where("reporter_id = ?", userID).Count(&reported).Error; err != nil {
		return nil, err
	}
	// 待整改对齐 status=new
	if err := s.DB.Model(&model.Issue{}).Where(
		"(reporter_id = ? OR assignee_name = ?) AND status = ?", userID, userName, model.IssueStatusNew,
	).Count(&pending).Error; err != nil {
		return nil, err
	}
	if err := s.DB.Model(&model.Issue{}).Where(
		"(reporter_id = ? OR assignee_name = ?) AND status = ?", userID, userName, model.IssueStatusDone,
	).Count(&done).Error; err != nil {
		return nil, err
	}
	return map[string]int64{"reported": reported, "pending": pending, "done": done}, nil
}

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
		db = db.Where("(reporter_id = ? OR assignee_name = ?) AND status = ?", userID, userName, model.IssueStatusNew)
	case "done":
		db = db.Where("(reporter_id = ? OR assignee_name = ?) AND status = ?", userID, userName, model.IssueStatusDone)
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

// validateRegionOrgs 至少一级；子级有值则上级必填；类型与父子链合法。
func (s *IssueService) validateRegionOrgs(rootID, districtID, streetID, villageID uint64) (streetName, villageName string, err error) {
	if rootID == 0 && districtID == 0 && streetID == 0 && villageID == 0 {
		return "", "", errors.New("请至少选择一级区划")
	}
	if villageID > 0 && (streetID == 0 || districtID == 0 || rootID == 0) {
		return "", "", errors.New("选择村级时须同时填写街道、区、根组织")
	}
	if streetID > 0 && villageID == 0 && (districtID == 0 || rootID == 0) {
		return "", "", errors.New("选择街道时须同时填写区、根组织")
	}
	if districtID > 0 && streetID == 0 && villageID == 0 && rootID == 0 {
		return "", "", errors.New("选择区级时须同时填写根组织")
	}

	load := func(id uint64, want model.OrgType) (*model.SysOrg, error) {
		if id == 0 {
			return nil, nil
		}
		var o model.SysOrg
		if err := s.DB.First(&o, id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, fmt.Errorf("组织不存在: %d", id)
			}
			return nil, err
		}
		if o.Type != want {
			return nil, fmt.Errorf("组织 %d 类型应为 %s", id, want)
		}
		return &o, nil
	}

	root, err := load(rootID, model.OrgTypeRoot)
	if err != nil {
		return "", "", err
	}
	district, err := load(districtID, model.OrgTypeDistrict)
	if err != nil {
		return "", "", err
	}
	street, err := load(streetID, model.OrgTypeStreet)
	if err != nil {
		return "", "", err
	}
	village, err := load(villageID, model.OrgTypeVillage)
	if err != nil {
		return "", "", err
	}

	if district != nil && root != nil && district.ParentID != root.ID {
		return "", "", errors.New("区级组织的上级须为所选根组织")
	}
	if street != nil && district != nil && street.ParentID != district.ID {
		return "", "", errors.New("街道组织的上级须为所选区组织")
	}
	if village != nil && street != nil && village.ParentID != street.ID {
		return "", "", errors.New("村级组织的上级须为所选街道组织")
	}

	if street != nil {
		streetName = street.Name
	}
	if village != nil {
		villageName = village.Name
	}
	return streetName, villageName, nil
}

func (s *IssueService) Create(ctx context.Context, in IssueInput) (*IssueVO, error) {
	typ := strings.TrimSpace(in.Type)
	if !model.IssueType(typ).Valid() {
		return nil, errors.New("问题类型无效")
	}
	if !model.ProjectYear(in.ProjectYear).Valid() {
		return nil, errors.New("请选择项目年度")
	}
	if strings.TrimSpace(in.Address) == "" {
		return nil, errors.New("请填写定位地址")
	}
	if strings.TrimSpace(in.ReporterSignatureFileID) == "" {
		return nil, errors.New("请提交电子签名")
	}
	if s.Attach != nil {
		if _, err := s.Attach.EnsureFiles(ctx, []string{in.ReporterSignatureFileID}); err != nil {
			return nil, fmt.Errorf("电子签名: %w", err)
		}
	}

	ext, needsRectify, err := s.normalizeTypeExt(ctx, typ, in.TypeExt)
	if err != nil {
		return nil, err
	}
	if needsRectify {
		if strings.TrimSpace(in.PlanDate) == "" {
			return nil, errors.New("请选择计划整改完成时间")
		}
	}

	status := deriveCreateStatus(needsRectify)

	item := &model.Issue{
		IssueKey:                "issue-" + uuid.NewString()[:8],
		Type:                    typ,
		ProjectYear:             in.ProjectYear,
		RootOrgID:               in.RootOrgID,
		DistrictOrgID:           in.DistrictOrgID,
		StreetOrgID:             in.StreetOrgID,
		VillageOrgID:            in.VillageOrgID,
		Code:                    in.Code,
		Address:                 in.Address,
		Lat:                     in.Lat,
		Lng:                     in.Lng,
		PlanDate:                in.PlanDate,
		Status:                  string(status),
		ReporterSignatureFileID: in.ReporterSignatureFileID,
		// AssigneeName/Phone：接口不传，留空由后续业务填充
		TypeExt: ext,
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
	typ := strings.TrimSpace(in.Type)
	if typ == "" {
		typ = item.Type
	}
	if !model.IssueType(typ).Valid() {
		return nil, errors.New("问题类型无效")
	}
	year := in.ProjectYear
	if year == 0 {
		year = item.ProjectYear
	}
	if !model.ProjectYear(year).Valid() {
		return nil, errors.New("请选择项目年度")
	}

	rootID, districtID, streetID, villageID := in.RootOrgID, in.DistrictOrgID, in.StreetOrgID, in.VillageOrgID
	if rootID == 0 && districtID == 0 && streetID == 0 && villageID == 0 {
		rootID, districtID, streetID, villageID = item.RootOrgID, item.DistrictOrgID, item.StreetOrgID, item.VillageOrgID
	}
	streetName, villageName, err := s.validateRegionOrgs(rootID, districtID, streetID, villageID)
	if err != nil {
		return nil, err
	}

	ext := item.TypeExt
	//if len(in.TypeExt) > 0 {
	//	canon, needs, nerr := s.normalizeTypeExt(ctx, typ, in.TypeExt)
	//	if nerr != nil {
	//		return nil, nerr
	//	}
	//	ext, needsRectify = canon, needs
	//}

	//sig := in.ReporterSignatureFileID
	//if sig == "" {
	//	sig = item.ReporterSignatureFileID
	//}

	addr := strings.TrimSpace(in.Address)
	if addr == "" {
		addr = item.Address
	}

	updates := map[string]interface{}{
		"type": typ, "project_year": year,
		"root_org_id": rootID, "district_org_id": districtID,
		"street_org_id": streetID, "village_org_id": villageID,
		"street": streetName, "village": villageName,
		"code": in.Code, "address": addr,
		"lat": in.Lat, "lng": in.Lng,
		"plan_date": in.PlanDate, "type_ext": ext,
		//"reporter_signature_file_id": sig,
	}
	if in.Status != "" {
		if !model.IssueStatus(in.Status).Valid() {
			return nil, errors.New("状态无效")
		}
		updates["status"] = in.Status
	}
	if err := s.db(ctx).Model(&item).Updates(updates).Error; err != nil {
		return nil, err
	}
	return s.Get(id)
}

func (s *IssueService) Delete(ctx context.Context, id uint64) error {
	return s.db(ctx).Delete(&model.Issue{}, id).Error
}

func deriveCreateStatus(needsRectify bool) model.IssueStatus {
	if needsRectify {
		return model.IssueStatusNew
	}
	return model.IssueStatusDone
}

func rectifyGate(status string, needsRectify bool) error {
	if !needsRectify {
		return errors.New("该问题无需整改")
	}
	if status == string(model.IssueStatusDone) {
		return errors.New("已整改不可再提交，请先重新整改")
	}
	if status != string(model.IssueStatusNew) && status != string(model.IssueStatusPending) {
		return errors.New("当前状态不可整改")
	}
	return nil
}

func reRectifyGate(status string, needsRectify bool) error {
	if status != string(model.IssueStatusDone) {
		return errors.New("仅已整改状态可重新整改")
	}
	if !needsRectify {
		return errors.New("无问题排查不可重新整改")
	}
	return nil
}

// Rectify 提交整改：仅 new/pending；写入记录表后 status=done。
func (s *IssueService) Rectify(ctx context.Context, id uint64, in RectifyInput) (*IssueVO, error) {
	var item model.Issue
	if err := s.DB.First(&item, id).Error; err != nil {
		return nil, err
	}

	note := strings.TrimSpace(in.Note)
	if note == "" {
		return nil, errors.New("请填写整改说明")
	}

	if s.Attach == nil {
		return nil, errors.New("附件服务未初始化")
	}
	clean, err := s.Attach.EnsureFiles(ctx, in.FileUUIDs)
	if err != nil {
		return nil, err
	}
	photoJSON, err := json.Marshal(clean)
	if err != nil {
		return nil, err
	}

	err = s.db(ctx).Transaction(func(tx *gorm.DB) error {
		rec := model.IssueRectifyRecord{IssueID: id, Note: note, PhotoFileIDs: string(photoJSON)}
		if err := tx.Create(&rec).Error; err != nil {
			return err
		}
		return tx.Model(&model.Issue{}).Where("id = ?", id).Updates(map[string]interface{}{
			"status": model.IssueStatusDone,
		}).Error
	})
	if err != nil {
		return nil, err
	}
	return s.Get(id)
}

// ReRectify 重新整改：done → pending。
func (s *IssueService) ReRectify(ctx context.Context, id uint64) (*IssueVO, error) {
	var item model.Issue
	if err := s.db(ctx).First(&item, id).Error; err != nil {
		return nil, err
	}
	if err := reRectifyGate(item.Status, false); err != nil {
		return nil, err
	}
	if err := s.db(ctx).Model(&item).Update("status", model.IssueStatusPending).Error; err != nil {
		return nil, err
	}
	return s.Get(id)
}

func (s *IssueService) Import(ctx context.Context, rows []IssueInput) (int, error) {
	n := 0
	for _, row := range rows {
		if _, err := s.Create(ctx, row); err != nil {
			return n, err
		}
		n++
	}
	return n, nil
}

func (s *IssueService) Stats() (map[string]interface{}, error) {
	var total, statusNew, statusPending, done int64
	s.DB.Model(&model.Issue{}).Count(&total)
	s.DB.Model(&model.Issue{}).Where("status = ?", model.IssueStatusNew).Count(&statusNew)
	s.DB.Model(&model.Issue{}).Where("status = ?", model.IssueStatusPending).Count(&statusPending)
	s.DB.Model(&model.Issue{}).Where("status = ?", model.IssueStatusDone).Count(&done)
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
		"total": total, "new": statusNew, "pending": statusPending, "done": done,
		"complete_rate": rate, "by_type": byType,
	}, nil
}

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
	err := q.Select("village, type, COUNT(*) as total, SUM(CASE WHEN status IN ('new','pending') THEN 1 ELSE 0 END) as pending, SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) as done").
		Group("village, type").Scan(&list).Error
	return ginH{"rows": list, "street": street}, err
}

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
	err := q.Select("type, COUNT(*) as total, SUM(CASE WHEN status IN ('new','pending') THEN 1 ELSE 0 END) as pending, SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) as done").
		Group("type").Scan(&list).Error
	return ginH{"rows": list, "street": street}, err
}

type ginH map[string]interface{}
