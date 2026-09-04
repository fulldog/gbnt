package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"gbnt/apps/server/internal/model"
)

// QuizBool 是/否排查项（checklist 元素；files 为 file_id 列表，入库 JSON；回显另填 photos）。
type QuizBool struct {
	Type    model.QuizType `json:"type"`             // 排查项类型枚举，见 model.QuizType
	Value   bool           `json:"value"`            // 是=true / 否=false
	Desc    string         `json:"desc"`             // 说明；判定为需整改时必填
	MustImg bool           `json:"mustImg"`          // 是否必填现场照片；true 时 files 长度须 >0
	Files   []string       `json:"files"`            // 现场照片 file_id 列表；mustImg=true 时必填
	Photos  []FileItem     `json:"photos,omitempty"` // 回显：file_id + 相对路径；入参忽略
}

type quizSpec struct {
	Type     model.QuizType
	Label    string
	Negative bool
}

var (
	wellChecklistSpecs = []quizSpec{
		{model.QuizWaterOut, "机井是否出水", false},
		{model.QuizPipeOk, "管道是否按要求连接", false},
		{model.QuizWiringOk, "走线是否规范", false},
		{model.QuizBoxOk, "配电箱是否完好", false},
		{model.QuizCoverOk, "井台、井盖是否完整", false},
		{model.QuizTransformerOk, "变压器是否完好", false},
	}
	roadChecklistSpecs = []quizSpec{
		{model.QuizHasShoulder, "是否有路肩", false},
		{model.QuizHasAsh, "是否有灰土层", false},
	}
	bridgeChecklistSpecs = []quizSpec{
		{model.QuizNeedsRectify, "是否需要整改", true},
	}
	forestChecklistSpecs = []quizSpec{
		{model.QuizBrokenBelt, "林带是否断带", true},
		{model.QuizDeadTrees, "是否有枯死木", true},
		{model.QuizPest, "是否发现病虫害", true},
	}
	transformerChecklistSpecs = []quizSpec{
		{model.QuizPowered, "是否通电", false},
		{model.QuizDeviceOk, "设备是否完好", false},
		{model.QuizCabinetOk, "配电设施是否完好", false},
		{model.QuizIllegalWire, "是否私拉乱接", true},
	}
)

// WellExt 机井扩展。
type WellExt struct {
	BuildKind     model.FacilityBuildKind `json:"build_kind"`     // 新建/配套 new|match
	Checklist     []QuizBool              `json:"checklist"`      // 是/否排查清单，type 见 well 子集
	OutletTotal   *int                    `json:"outlet_total"`   // 出水口总数 ≥0
	OutletDamaged *int                    `json:"outlet_damaged"` // 出水口损坏数量；≤总数，>0 则需整改
	CasingTotal   *int                    `json:"casing_total"`   // 护筒总数 ≥0
	CasingDamaged *int                    `json:"casing_damaged"` // 护筒损坏数量；≤总数，>0 则需整改
	KeeperName    string                  `json:"keeper_name"`    // 井长及分管负责人（选填）
	KeeperPhone   string                  `json:"keeper_phone"`   // 联系电话（选填）
}

// RoadExt 道路扩展。
type RoadExt struct {
	Length      *float64   `json:"length"`       // 长度（千米）≥0
	Width       *float64   `json:"width"`        // 宽度（米）≥0
	Thickness   *float64   `json:"thickness"`    // 厚度（米）≥0
	Checklist   []QuizBool `json:"checklist"`    // 是/否排查清单，type=has_shoulder|has_ash
	TreeSurvive *float64   `json:"tree_survive"` // 林网存活数量（棵）≥0
	KeeperName  string     `json:"keeper_name"`  // 负责人（选填）
	KeeperPhone string     `json:"keeper_phone"` // 电话（选填）
}

// BridgeExt 桥涵闸扩展。
type BridgeExt struct {
	Kind        model.BridgeKind `json:"kind"`         // 设施类型 bridge|culvert|gate
	Length      *float64         `json:"length"`       // 长度（米）≥0
	Width       *float64         `json:"width"`        // 宽度（米）≥0
	Checklist   []QuizBool       `json:"checklist"`    // 是/否排查清单，type=needs_rectify
	KeeperName  string           `json:"keeper_name"`  // 负责人（选填）
	KeeperPhone string           `json:"keeper_phone"` // 电话（选填）
}

// ForestExt 林网扩展。
type ForestExt struct {
	HandoverCount *float64   `json:"handover_count"` // 移交株数 ≥0
	ExistingCount *float64   `json:"existing_count"` // 现有株数 ≥0
	SurviveRate   *float64   `json:"survive_rate"`   // 存活率 0–100
	Checklist     []QuizBool `json:"checklist"`      // 是/否排查清单，type=broken_belt|dead_trees|pest
	KeeperName    string     `json:"keeper_name"`    // 负责人（选填）
	KeeperPhone   string     `json:"keeper_phone"`   // 电话（选填）
}

// TransformerExt 变压器扩展。
type TransformerExt struct {
	Capacity    *float64                 `json:"capacity"`     // 容量（kVA）≥0
	Model       string                   `json:"model"`        // 型号（选填）
	Voltage     model.TransformerVoltage `json:"voltage"`      // 电压等级 10kv|0.4kv
	Checklist   []QuizBool               `json:"checklist"`    // 是/否排查清单，type=powered|device_ok|cabinet_ok|illegal_wire
	KeeperName  string                   `json:"keeper_name"`  // 负责人（选填）
	KeeperPhone string                   `json:"keeper_phone"` // 电话（选填）
}

func requireIntGE0(p *int, label string) error {
	if p == nil {
		return fmt.Errorf("请填写%s", label)
	}
	if *p < 0 {
		return fmt.Errorf("%s不能为负数", label)
	}
	return nil
}

func requireFloatGE0(p *float64, label string) error {
	if p == nil {
		return fmt.Errorf("请填写%s", label)
	}
	if *p < 0 {
		return fmt.Errorf("%s不能为负数", label)
	}
	return nil
}

func marshalExt(v any) (string, error) {
	b, err := json.Marshal(v)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func decodeExt[T any](raw json.RawMessage) (T, error) {
	var v T
	if len(raw) == 0 || string(raw) == "null" {
		return v, errors.New("type_ext 必填")
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		return v, errors.New("type_ext 格式无效")
	}
	return v, nil
}

// quizIndicatesIssue negative=true 表示「是」为异常（如私拉乱接、需整改）。
func quizIndicatesIssue(q *QuizBool, negative bool) bool {
	if q == nil {
		return true
	}
	if negative {
		return q.Value
	}
	return !q.Value
}

func checklistSpecsFor(typ string) []quizSpec {
	switch model.IssueType(typ) {
	case model.IssueTypeWell:
		return wellChecklistSpecs
	case model.IssueTypeRoad:
		return roadChecklistSpecs
	case model.IssueTypeBridge:
		return bridgeChecklistSpecs
	case model.IssueTypeForest:
		return forestChecklistSpecs
	case model.IssueTypeTransformer:
		return transformerChecklistSpecs
	default:
		return nil
	}
}

// neededQuizTypes 从 type_ext.checklist 取出判定为需整改的 QuizType（不含出水口/护筒损坏等非题项）。
func neededQuizTypes(issueType, typeExt string) []model.QuizType {
	specs := checklistSpecsFor(issueType)
	neg := make(map[model.QuizType]bool, len(specs))
	for _, sp := range specs {
		neg[sp.Type] = sp.Negative
	}
	var ext struct {
		Checklist []QuizBool `json:"checklist"`
	}
	_ = json.Unmarshal([]byte(typeExt), &ext)
	out := make([]model.QuizType, 0)
	seen := map[model.QuizType]struct{}{}
	for i := range ext.Checklist {
		q := &ext.Checklist[i]
		n, ok := neg[q.Type]
		if !ok {
			continue
		}
		if !quizIndicatesIssue(q, n) {
			continue
		}
		if _, dup := seen[q.Type]; dup {
			continue
		}
		seen[q.Type] = struct{}{}
		out = append(out, q.Type)
	}
	return out
}

// rectifyTypesCovered Need 是否都被 Covered 覆盖；Need 为空视为已覆盖。
func rectifyTypesCovered(need []model.QuizType, covered map[model.QuizType]struct{}) bool {
	for _, t := range need {
		if _, ok := covered[t]; !ok {
			return false
		}
	}
	return true
}

func (s *IssueService) bindQuizBool(ctx context.Context, q *QuizBool, label string, negative bool) (indicatesIssue bool, err error) {
	if q == nil {
		return true, fmt.Errorf("请选择%s", label)
	}
	indicatesIssue = quizIndicatesIssue(q, negative)
	if indicatesIssue {
		if strings.TrimSpace(q.Desc) == "" {
			return true, fmt.Errorf("请填写%s的说明", label)
		}
	}
	if q.MustImg && len(q.Files) == 0 {
		return indicatesIssue, fmt.Errorf("请上传%s的现场照片", label)
	}
	if len(q.Files) > 0 {
		if s.Attach != nil {
			clean, ensErr := s.Attach.EnsureFiles(ctx, q.Files)
			if ensErr != nil {
				return indicatesIssue, fmt.Errorf("%s照片: %w", label, ensErr)
			}
			q.Files = clean
		}
		q.Photos = nil
	}
	return indicatesIssue, nil
}

func (s *IssueService) bindChecklist(ctx context.Context, list []QuizBool, specs []quizSpec) ([]QuizBool, bool, error) {
	allowed := make(map[model.QuizType]quizSpec, len(specs))
	for _, sp := range specs {
		allowed[sp.Type] = sp
	}
	byType := make(map[model.QuizType]*QuizBool, len(list))
	for i := range list {
		q := &list[i]
		if !q.Type.Valid() {
			return nil, false, errors.New("排查项类型无效")
		}
		if _, ok := allowed[q.Type]; !ok {
			return nil, false, fmt.Errorf("排查项 %s 不适用于当前问题类型", q.Type)
		}
		if _, ok := byType[q.Type]; ok {
			return nil, false, fmt.Errorf("排查项 %s 重复", q.Type)
		}
		byType[q.Type] = q
	}
	out := make([]QuizBool, 0, len(specs))
	needs := false
	for _, sp := range specs {
		q := byType[sp.Type]
		issue, err := s.bindQuizBool(ctx, q, sp.Label, sp.Negative)
		if err != nil {
			return nil, false, err
		}
		if issue {
			needs = true
		}
		q.Type = sp.Type
		q.Photos = nil
		out = append(out, *q)
	}
	return out, needs, nil
}

func (s *IssueService) normalizeWellExt(ctx context.Context, raw json.RawMessage) (string, bool, error) {
	ext, err := decodeExt[WellExt](raw)
	if err != nil {
		return "", false, err
	}
	if !ext.BuildKind.Valid() {
		return "", false, errors.New("请选择新建/配套")
	}
	list, needs, err := s.bindChecklist(ctx, ext.Checklist, wellChecklistSpecs)
	if err != nil {
		return "", false, err
	}
	ext.Checklist = list
	if err := requireIntGE0(ext.OutletTotal, "出水口总数"); err != nil {
		return "", false, err
	}
	if err := requireIntGE0(ext.OutletDamaged, "出水口损坏数量"); err != nil {
		return "", false, err
	}
	if *ext.OutletDamaged > *ext.OutletTotal {
		return "", false, errors.New("出水口损坏数量不能大于总数")
	}
	if err := requireIntGE0(ext.CasingTotal, "护筒总数"); err != nil {
		return "", false, err
	}
	if err := requireIntGE0(ext.CasingDamaged, "护筒损坏数量"); err != nil {
		return "", false, err
	}
	if *ext.CasingDamaged > *ext.CasingTotal {
		return "", false, errors.New("护筒损坏数量不能大于总数")
	}
	if *ext.OutletDamaged > 0 || *ext.CasingDamaged > 0 {
		needs = true
	}
	canon, err := marshalExt(ext)
	return canon, needs, err
}

func (s *IssueService) normalizeRoadExt(ctx context.Context, raw json.RawMessage) (string, bool, error) {
	ext, err := decodeExt[RoadExt](raw)
	if err != nil {
		return "", false, err
	}
	if err := requireFloatGE0(ext.Length, "道路长度"); err != nil {
		return "", false, err
	}
	if err := requireFloatGE0(ext.Width, "道路宽度"); err != nil {
		return "", false, err
	}
	if err := requireFloatGE0(ext.Thickness, "道路厚度"); err != nil {
		return "", false, err
	}
	if err := requireFloatGE0(ext.TreeSurvive, "林网树木存活数量"); err != nil {
		return "", false, err
	}
	list, needs, err := s.bindChecklist(ctx, ext.Checklist, roadChecklistSpecs)
	if err != nil {
		return "", false, err
	}
	ext.Checklist = list
	canon, err := marshalExt(ext)
	return canon, needs, err
}

func (s *IssueService) normalizeBridgeExt(ctx context.Context, raw json.RawMessage) (string, bool, error) {
	ext, err := decodeExt[BridgeExt](raw)
	if err != nil {
		return "", false, err
	}
	if !ext.Kind.Valid() {
		return "", false, errors.New("请选择设施类型（桥/涵/闸）")
	}
	if err := requireFloatGE0(ext.Length, "长度"); err != nil {
		return "", false, err
	}
	if err := requireFloatGE0(ext.Width, "宽度"); err != nil {
		return "", false, err
	}
	list, needs, err := s.bindChecklist(ctx, ext.Checklist, bridgeChecklistSpecs)
	if err != nil {
		return "", false, err
	}
	ext.Checklist = list
	canon, err := marshalExt(ext)
	return canon, needs, err
}

func (s *IssueService) normalizeForestExt(ctx context.Context, raw json.RawMessage) (string, bool, error) {
	ext, err := decodeExt[ForestExt](raw)
	if err != nil {
		return "", false, err
	}
	if err := requireFloatGE0(ext.HandoverCount, "移交株数"); err != nil {
		return "", false, err
	}
	if err := requireFloatGE0(ext.ExistingCount, "现有株数"); err != nil {
		return "", false, err
	}
	if err := requireFloatGE0(ext.SurviveRate, "存活率"); err != nil {
		return "", false, err
	}
	if *ext.SurviveRate > 100 {
		return "", false, errors.New("存活率应在 0–100 之间")
	}
	list, needs, err := s.bindChecklist(ctx, ext.Checklist, forestChecklistSpecs)
	if err != nil {
		return "", false, err
	}
	ext.Checklist = list
	canon, err := marshalExt(ext)
	return canon, needs, err
}

func (s *IssueService) normalizeTransformerExt(ctx context.Context, raw json.RawMessage) (string, bool, error) {
	ext, err := decodeExt[TransformerExt](raw)
	if err != nil {
		return "", false, err
	}
	if err := requireFloatGE0(ext.Capacity, "变压器容量"); err != nil {
		return "", false, err
	}
	if !ext.Voltage.Valid() {
		return "", false, errors.New("请选择电压等级")
	}
	list, needs, err := s.bindChecklist(ctx, ext.Checklist, transformerChecklistSpecs)
	if err != nil {
		return "", false, err
	}
	ext.Checklist = list
	canon, err := marshalExt(ext)
	return canon, needs, err
}

func (s *IssueService) normalizeTypeExt(ctx context.Context, typ string, raw json.RawMessage) (string, bool, error) {
	switch model.IssueType(typ) {
	case model.IssueTypeWell:
		return s.normalizeWellExt(ctx, raw)
	case model.IssueTypeRoad:
		return s.normalizeRoadExt(ctx, raw)
	case model.IssueTypeBridge:
		return s.normalizeBridgeExt(ctx, raw)
	case model.IssueTypeForest:
		return s.normalizeForestExt(ctx, raw)
	case model.IssueTypeTransformer:
		return s.normalizeTransformerExt(ctx, raw)
	default:
		return "", false, errors.New("问题类型无效")
	}
}

func (s *IssueService) hydrateQuiz(ctx context.Context, q *QuizBool) {
	if q == nil {
		return
	}
	q.Photos = []FileItem{}
	if s.Attach == nil || len(q.Files) == 0 {
		return
	}
	list, err := s.Attach.lookupExisting(ctx, q.Files)
	if err != nil {
		return
	}
	q.Photos = list
}

func (s *IssueService) hydrateChecklist(ctx context.Context, list []QuizBool) {
	for i := range list {
		s.hydrateQuiz(ctx, &list[i])
	}
}

func (s *IssueService) hydrateTypeExt(ctx context.Context, typ, raw string) (json.RawMessage, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "null" {
		return json.RawMessage("{}"), nil
	}
	msg := json.RawMessage(raw)
	var (
		canon string
		err   error
	)
	switch model.IssueType(typ) {
	case model.IssueTypeWell:
		var ext WellExt
		if err = json.Unmarshal(msg, &ext); err != nil {
			return msg, nil
		}
		s.hydrateChecklist(ctx, ext.Checklist)
		canon, err = marshalExt(ext)
	case model.IssueTypeRoad:
		var ext RoadExt
		if err = json.Unmarshal(msg, &ext); err != nil {
			return msg, nil
		}
		s.hydrateChecklist(ctx, ext.Checklist)
		canon, err = marshalExt(ext)
	case model.IssueTypeBridge:
		var ext BridgeExt
		if err = json.Unmarshal(msg, &ext); err != nil {
			return msg, nil
		}
		s.hydrateChecklist(ctx, ext.Checklist)
		canon, err = marshalExt(ext)
	case model.IssueTypeForest:
		var ext ForestExt
		if err = json.Unmarshal(msg, &ext); err != nil {
			return msg, nil
		}
		s.hydrateChecklist(ctx, ext.Checklist)
		canon, err = marshalExt(ext)
	case model.IssueTypeTransformer:
		var ext TransformerExt
		if err = json.Unmarshal(msg, &ext); err != nil {
			return msg, nil
		}
		s.hydrateChecklist(ctx, ext.Checklist)
		canon, err = marshalExt(ext)
	default:
		return msg, nil
	}
	if err != nil {
		return msg, nil
	}
	return json.RawMessage(canon), nil
}

// validateTypeExt 仅结构校验（更新用，不重新 EnsureFiles）。
func validateTypeExt(typ string, raw json.RawMessage) (string, error) {
	s := &IssueService{}
	canon, _, err := s.normalizeTypeExt(context.Background(), typ, raw)
	if err != nil {
		if strings.Contains(err.Error(), "附件服务未初始化") {
			return string(raw), nil
		}
		return "", err
	}
	return canon, nil
}
