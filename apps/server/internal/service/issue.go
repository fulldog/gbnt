package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"strings"

	"gbnt/apps/server/internal/database"
	"gbnt/apps/server/internal/model"
)

// IssueService 排查/整改业务。
type IssueService struct {
	DB     *gorm.DB
	Attach *AttachService
}

// IssueQuery 列表筛选。
type IssueQuery struct {
	Type        string // 问题类型 well/road/bridge/forest/transformer；空或 all 不限
	Status      string // new|pending|done；空或 all 不限状态
	OrgID       uint64 // 落点组织 ID；>0 时含该组织及全部下级；0 不限
	ProjectYear int    // 项目年度 2020–2023；0 不限
	Keyword     string // 管理端为问题编号/设施编号/地址模糊；小程序保持设施编号/地址模糊
	Page        int    // 页码，默认 1
	Size        int    // 每页条数，默认 20
}

// IssueInput 创建/更新入参（对齐 miniapp 上报向导；责任人接口不传，库内可空）。
type IssueInput struct {
	Type                    string          `json:"type"`                       // 问题类型 well/road/bridge/forest/transformer（必填）
	ProjectYear             int             `json:"project_year"`               // 项目年度 2020–2023（新建必填）
	OrgID                   uint64          `json:"org_id"`                     // 落点组织 ID，对应 sys_orgs.id（新建必填；更新时 0 表示不改）
	Code                    string          `json:"code"`                       // 设施编号（选填）
	Address                 string          `json:"address"`                    // 定位地址（必填）
	Lat                     float64         `json:"lat"`                        // 纬度
	Lng                     float64         `json:"lng"`                        // 经度
	PlanDate                string          `json:"plan_date"`                  // 计划整改完成日 YYYY-MM-DD；需整改时必填
	ReporterSignatureFileID string          `json:"reporter_signature_file_id"` // 排查电子签名 file_id（新建必填）
	ReportUserID            uint64          `json:"report_user_id"`             // 上报人用户ID：app端由登录用户注入；后台创建必填
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

// RectifyItem 单条分项整改。
type RectifyItem struct {
	Type      model.QuizType `json:"type"`       // 排查项类型枚举，见 model.QuizType
	Note      string         `json:"note"`       // 整改说明（必填）
	FileUUIDs []string       `json:"file_uuids"` // 整改照片 file_id 列表（必填）
}

// RectifyInput 整改入参。
type RectifyInput struct {
	RectifyList []RectifyItem `json:"rectify_list"` // 分项整改列表；可含重复 type；不能为空
}

// ReassignInput 管理端重新指派整改人。
type ReassignInput struct {
	AssigneeUser uint64 `json:"assignee_user"` // 整改责任人用户 ID（必填，须为启用账号）
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

// MarshalJSON 保留基础业务字段，并将类型扩展与整改附件展开为 JSON 对象。
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

// List 管理端基础列表；编号搜索仅在该入口扩大，小程序待办保持原语义。
func (s *IssueService) List(ctx context.Context, q IssueQuery) ([]IssueVO, int64, error) {
	q.Page, q.Size = NormalizePagination(q.Page, q.Size, 0)
	db := s.applyAdminIssueFilters(s.db(ctx).Model(&model.Issue{}), q)
	var err error
	db, err = s.applyOrgSubtreeFilter(ctx, db, q.OrgID)
	if err != nil {
		return nil, 0, err
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}
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

func (s *IssueService) applyAdminIssueFilters(db *gorm.DB, q IssueQuery) *gorm.DB {
	keyword := strings.TrimSpace(q.Keyword)
	q.Keyword = ""
	db = s.applyIssueFilters(db, q)
	if keyword != "" {
		like := "%" + keyword + "%"
		// 一个括号组避免 OR 绕过类型、年度、状态及组织条件。
		db = db.Where("(issue_key LIKE ? OR code LIKE ? OR address LIKE ?)", like, like, like)
	}
	return db
}

func (s *IssueService) applyIssueFilters(db *gorm.DB, q IssueQuery) *gorm.DB {
	if q.Type != "" && q.Type != "all" {
		db = db.Where("type = ?", q.Type)
	}
	if q.Status != "" && q.Status != "all" {
		db = db.Where("status = ?", q.Status)
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

// orgSubtreeIDs 从扁平组织列表计算 rootID 及其全部下属（含自身）。
func orgSubtreeIDs(orgs []model.SysOrg, rootID uint64) []uint64 {
	children := map[uint64][]uint64{}
	for _, o := range orgs {
		children[o.ParentID] = append(children[o.ParentID], o.ID)
	}
	seen := map[uint64]struct{}{rootID: {}}
	queue := []uint64{rootID}
	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		for _, c := range children[id] {
			if _, ok := seen[c]; ok {
				continue
			}
			seen[c] = struct{}{}
			queue = append(queue, c)
		}
	}
	ids := make([]uint64, 0, len(seen))
	for id := range seen {
		ids = append(ids, id)
	}
	return ids
}

// issueTodoOrderSQL 待办排序：new > pending > done，同状态按 id 降序。
func issueTodoOrderSQL() string {
	return "FIELD(status,'new','pending','done') ASC, id DESC"
}

func (s *IssueService) applyOrgSubtreeFilter(ctx context.Context, db *gorm.DB, orgID uint64) (*gorm.DB, error) {
	if orgID == 0 {
		return db, nil
	}
	var orgs []model.SysOrg
	if err := s.db(ctx).Find(&orgs).Error; err != nil {
		return nil, err
	}
	ids := orgSubtreeIDs(orgs, orgID)
	return db.Where("org_id IN ?", ids), nil
}

// ListTodos 小程序待办：status 空或 all 查全部；排序 new > pending > done。
// 权限范围为登录用户组织及下属（用户 OrgID=0 不限）；query org_id>0 再与该组织子树取交集。
func (s *IssueService) ListTodos(ctx context.Context, q IssueQuery) ([]IssueVO, int64, error) {
	if q.Status == "all" {
		q.Status = ""
	}
	if q.Page <= 0 {
		q.Page = 1
	}
	if q.Size <= 0 {
		q.Size = 20
	}
	user, err := database.UserFromContext(ctx)
	if err != nil {
		return nil, 0, err
	}
	db := s.applyIssueFilters(s.db(ctx).Model(&model.Issue{}), q)
	db, err = s.applyOrgSubtreeFilter(ctx, db, user.OrgID)
	if err != nil {
		return nil, 0, err
	}
	db, err = s.applyOrgSubtreeFilter(ctx, db, q.OrgID)
	if err != nil {
		return nil, 0, err
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var list []model.Issue
	if err := db.Order(issueTodoOrderSQL()).Offset((q.Page - 1) * q.Size).Limit(q.Size).Find(&list).Error; err != nil {
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

func (s *IssueService) MineStats(userID uint64) (map[string]int64, error) {
	var reported, pending, done int64
	if err := s.DB.Model(&model.Issue{}).Where("created_id = ?", userID).Count(&reported).Error; err != nil {
		return nil, err
	}
	if err := s.DB.Model(&model.Issue{}).Where(
		"(created_id = ? OR assignee_user = ?) AND status = ?", userID, userID, model.IssueStatusNew,
	).Count(&pending).Error; err != nil {
		return nil, err
	}
	if err := s.DB.Model(&model.Issue{}).Where(
		"(created_id = ? OR assignee_user = ?) AND status = ?", userID, userID, model.IssueStatusDone,
	).Count(&done).Error; err != nil {
		return nil, err
	}
	return map[string]int64{"reported": reported, "pending": pending, "done": done}, nil
}

func (s *IssueService) ListMine(scope string, userID uint64, page, size int) ([]IssueVO, int64, error) {
	if page <= 0 {
		page = 1
	}
	if size <= 0 {
		size = 20
	}
	db := s.DB.Model(&model.Issue{})
	switch scope {
	case "reported":
		db = db.Where("created_id = ?", userID)
	case "pending":
		db = db.Where("(created_id = ? OR assignee_user = ?) AND status = ?", userID, userID, model.IssueStatusNew)
	case "done":
		db = db.Where("(created_id = ? OR assignee_user = ?) AND status = ?", userID, userID, model.IssueStatusDone)
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

// requireOrgID 校验 org_id 必填且 sys_orgs 中存在（不含已软删）。
func (s *IssueService) requireOrgID(ctx context.Context, orgID uint64) error {
	if orgID == 0 {
		return errors.New("请选择组织")
	}
	var o model.SysOrg
	if err := s.db(ctx).First(&o, orgID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errors.New("组织不存在")
		}
		return err
	}
	return nil
}

func (s *IssueService) Create(ctx context.Context, in IssueInput) (*IssueVO, error) {
	typ := strings.TrimSpace(in.Type)
	if !model.IssueType(typ).Valid() {
		return nil, errors.New("问题类型无效")
	}
	if !model.ProjectYear(in.ProjectYear).Valid() {
		return nil, errors.New("请选择项目年度")
	}
	if err := s.requireOrgID(ctx, in.OrgID); err != nil {
		return nil, err
	}
	if strings.TrimSpace(in.Address) == "" {
		return nil, errors.New("请填写定位地址")
	}
	if strings.TrimSpace(in.ReporterSignatureFileID) == "" {
		return nil, errors.New("请提交电子签名")
	}
	if in.ReportUserID == 0 {
		return nil, errors.New("请传入上报人report_user_id")
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
		OrgID:                   in.OrgID,
		Code:                    in.Code,
		Address:                 in.Address,
		Lat:                     in.Lat,
		Lng:                     in.Lng,
		PlanDate:                in.PlanDate,
		Status:                  string(status),
		ReporterSignatureFileID: in.ReporterSignatureFileID,
		ReportUserID:            in.ReportUserID,
		TypeExt:                 ext,
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

	orgID := in.OrgID
	if orgID == 0 {
		orgID = item.OrgID
	}
	if err := s.requireOrgID(ctx, orgID); err != nil {
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
		"type": typ, "project_year": year, "org_id": orgID,
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

func assertAppAssignee(item *model.Issue, userID uint64) error {
	if item.AssigneeUser != 0 && item.AssigneeUser != userID {
		return errors.New("该问题已由他人认领整改")
	}
	return nil
}

// Rectify 提交分项整改：写入 rectify_list 各条记录；覆盖全部需整改 type 则 done，否则 pending。
// lockAssignee 为 true 时（App）校验已认领人。
func (s *IssueService) Rectify(ctx context.Context, id uint64, in RectifyInput, lockAssignee bool) (*IssueVO, error) {
	user, err := database.UserFromContext(ctx)
	if err != nil {
		return nil, err
	}
	var item model.Issue
	if err := s.db(ctx).First(&item, id).Error; err != nil {
		return nil, err
	}
	if lockAssignee {
		if err := assertAppAssignee(&item, user.ID); err != nil {
			return nil, err
		}
	}
	if err := rectifyGate(item.Status, true); err != nil {
		return nil, err
	}
	if len(in.RectifyList) == 0 {
		return nil, errors.New("请至少提交一项整改")
	}
	if s.Attach == nil {
		return nil, errors.New("附件服务未初始化")
	}

	type prepared struct {
		typ   model.QuizType
		note  string
		photo string
	}
	prep := make([]prepared, 0, len(in.RectifyList))
	for i, it := range in.RectifyList {
		if !it.Type.Valid() {
			return nil, fmt.Errorf("第 %d 项整改类型无效", i+1)
		}
		note := strings.TrimSpace(it.Note)
		if note == "" {
			return nil, fmt.Errorf("请填写%s的整改说明", it.Type)
		}
		clean, ensErr := s.Attach.EnsureFiles(ctx, it.FileUUIDs)
		if ensErr != nil {
			return nil, fmt.Errorf("%s照片: %w", it.Type, ensErr)
		}
		b, mErr := json.Marshal(clean)
		if mErr != nil {
			return nil, mErr
		}
		prep = append(prep, prepared{typ: it.Type, note: note, photo: string(b)})
	}

	need := neededQuizTypes(item.Type, item.TypeExt)
	covered := map[model.QuizType]struct{}{}
	var hist []model.IssueRectifyRecord
	if err := s.db(ctx).Where("issue_id = ?", id).Find(&hist).Error; err != nil {
		return nil, err
	}
	for _, r := range hist {
		t := model.QuizType(r.QuizType)
		if t.Valid() {
			covered[t] = struct{}{}
		}
	}
	for _, p := range prep {
		covered[p.typ] = struct{}{}
	}
	st := model.IssueStatusPending
	if rectifyTypesCovered(need, covered) {
		st = model.IssueStatusDone
	}

	err = s.db(ctx).Transaction(func(tx *gorm.DB) error {
		for _, p := range prep {
			rec := model.IssueRectifyRecord{
				IssueID: id, QuizType: string(p.typ), Note: p.note, PhotoFileIDs: p.photo,
			}
			if err := tx.Create(&rec).Error; err != nil {
				return err
			}
		}
		return tx.Model(&model.Issue{}).Where("id = ?", id).Updates(map[string]interface{}{
			"status":        st,
			"assignee_user": user.ID,
		}).Error
	})
	if err != nil {
		return nil, err
	}
	return s.Get(id)
}

// ReRectify 重新整改：done → pending；不删历史记录、不改 assignee_user。
func (s *IssueService) ReRectify(ctx context.Context, id uint64, lockAssignee bool) (*IssueVO, error) {
	var item model.Issue
	if err := s.db(ctx).First(&item, id).Error; err != nil {
		return nil, err
	}
	if lockAssignee {
		user, err := database.UserFromContext(ctx)
		if err != nil {
			return nil, err
		}
		if err := assertAppAssignee(&item, user.ID); err != nil {
			return nil, err
		}
	}
	need := neededQuizTypes(item.Type, item.TypeExt)
	if err := reRectifyGate(item.Status, len(need) > 0); err != nil {
		return nil, err
	}
	if err := s.db(ctx).Model(&item).Update("status", model.IssueStatusPending).Error; err != nil {
		return nil, err
	}
	return s.Get(id)
}

// Reassign 管理端重新指派整改人：只改 assignee_user，不改 status、不删整改记录。
func (s *IssueService) Reassign(ctx context.Context, id uint64, in ReassignInput) (*IssueVO, error) {
	if in.AssigneeUser == 0 {
		return nil, errors.New("请指定整改人")
	}
	var user model.SysUser
	if err := s.db(ctx).First(&user, in.AssigneeUser).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("整改人不存在")
		}
		return nil, err
	}
	if user.Status != 1 {
		return nil, errors.New("整改人已停用")
	}
	var item model.Issue
	if err := s.db(ctx).First(&item, id).Error; err != nil {
		return nil, err
	}
	if err := s.db(ctx).Model(&item).Update("assignee_user", in.AssigneeUser).Error; err != nil {
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

// Stats 返回工作台全局计数；遵循软删除及原状态口径，任何计数失败均不返回部分统计。
func (s *IssueService) Stats() (map[string]interface{}, error) {
	var total, statusNew, statusPending, done int64
	if err := s.DB.Model(&model.Issue{}).Count(&total).Error; err != nil {
		return nil, err
	}
	if err := s.DB.Model(&model.Issue{}).Where("status = ?", model.IssueStatusNew).Count(&statusNew).Error; err != nil {
		return nil, err
	}
	if err := s.DB.Model(&model.Issue{}).Where("status = ?", model.IssueStatusPending).Count(&statusPending).Error; err != nil {
		return nil, err
	}
	if err := s.DB.Model(&model.Issue{}).Where("status = ?", model.IssueStatusDone).Count(&done).Error; err != nil {
		return nil, err
	}
	byType := map[string]int64{}
	for _, t := range []string{"well", "road", "bridge", "forest", "transformer"} {
		var c int64
		if err := s.DB.Model(&model.Issue{}).Where("type = ?", t).Count(&c).Error; err != nil {
			return nil, err
		}
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

func (s *IssueService) applyLedgerDate(q *gorm.DB, from, to string) *gorm.DB {
	if from != "" {
		q = q.Where("DATE(created_at) >= ?", from)
	}
	if to != "" {
		q = q.Where("DATE(created_at) <= ?", to)
	}
	return q
}

func (s *IssueService) filterLedgerOrg(q *gorm.DB, orgID uint64) (*gorm.DB, error) {
	return s.applyOrgSubtreeFilter(context.Background(), q, orgID)
}

// LedgerStreet 按落点组织与问题类型聚合；无记录仍返回 rows: []，批量补齐组织名称。
func (s *IssueService) LedgerStreet(streetOrgID uint64, from, to string) (interface{}, error) {
	q, err := s.filterLedgerOrg(s.applyLedgerDate(s.DB.Model(&model.Issue{}), from, to), streetOrgID)
	if err != nil {
		return nil, err
	}
	type row struct {
		OrgID   uint64  `json:"org_id"`            // 落点组织 ID
		Type    string  `json:"type"`              // 问题类型
		Total   int64   `json:"total"`             // 条数
		Pending int64   `json:"pending"`           // new+pending
		Done    int64   `json:"done"`              // done
		OrgName *string `json:"org_name" gorm:"-"` // 当前组织名称；关联缺失为 null
		OrgPath *string `json:"org_path" gorm:"-"` // 可解析组织路径；关联缺失为 null
	}
	list := make([]row, 0)
	err = q.Select("org_id, type, COUNT(*) as total, SUM(CASE WHEN status IN ('new','pending') THEN 1 ELSE 0 END) as pending, SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) as done").
		Group("org_id, type").Scan(&list).Error
	if err != nil {
		return nil, err
	}
	orgIDs := make([]uint64, 0, len(list))
	for _, item := range list {
		orgIDs = append(orgIDs, item.OrgID)
	}
	names, err := loadAdminDisplayNames(s.DB, nil, orgIDs, nil)
	if err != nil {
		return nil, err
	}
	for i := range list {
		list[i].OrgName, list[i].OrgPath = names.orgDisplay(list[i].OrgID)
	}
	return ginH{"rows": list, "street_org_id": streetOrgID}, nil
}

// LedgerSurvey 按问题类型聚合；无记录返回空数组，查询失败不包装为成功。
func (s *IssueService) LedgerSurvey(streetOrgID uint64, from, to string) (interface{}, error) {
	q, err := s.filterLedgerOrg(s.applyLedgerDate(s.DB.Model(&model.Issue{}), from, to), streetOrgID)
	if err != nil {
		return nil, err
	}
	type row struct {
		Type    string `json:"type"`    // 问题类型
		Total   int64  `json:"total"`   // 条数
		Pending int64  `json:"pending"` // new+pending
		Done    int64  `json:"done"`    // done
	}
	list := make([]row, 0)
	err = q.Select("type, COUNT(*) as total, SUM(CASE WHEN status IN ('new','pending') THEN 1 ELSE 0 END) as pending, SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) as done").
		Group("type").Scan(&list).Error
	if err != nil {
		return nil, err
	}
	return ginH{"rows": list, "street_org_id": streetOrgID}, nil
}

type ginH map[string]interface{}
