package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"gbnt/backend/internal/model"
)

// QuizBool 是/否排查项（入参仅 value/desc/files；att_id 由服务端 Bind 后回填）。
type QuizBool struct {
	Value bool     `json:"value"`            // 是=true / 否=false
	Desc  string   `json:"desc"`             // 说明；判定为需整改时必填
	Files []string `json:"files"`            // 现场照片 file_id 列表；判定为需整改时必填
	AttID string   `json:"att_id,omitempty"` // 服务端 Bind 回填的关联组 ID；入参不要求
}

// WellExt 机井扩展。
type WellExt struct {
	BuildKind     model.FacilityBuildKind `json:"build_kind"`     // 新建/配套 new|match
	WaterOut      *QuizBool               `json:"water_out"`      // 机井是否出水（正向：否=需整改）
	PipeOk        *QuizBool               `json:"pipe_ok"`        // 管道是否按要求连接
	WiringOk      *QuizBool               `json:"wiring_ok"`      // 走线是否规范
	BoxOk         *QuizBool               `json:"box_ok"`         // 配电箱是否完好
	CoverOk       *QuizBool               `json:"cover_ok"`       // 井台、井盖是否完整
	TransformerOk *QuizBool               `json:"transformer_ok"` // 变压器是否完好
	OutletTotal   *int                    `json:"outlet_total"`   // 出水口总数 ≥0
	OutletDamaged *int                    `json:"outlet_damaged"` // 出水口损坏数量；≤总数，>0 则需整改
	CasingTotal   *int                    `json:"casing_total"`   // 护筒总数 ≥0
	CasingDamaged *int                    `json:"casing_damaged"` // 护筒损坏数量；≤总数，>0 则需整改
	KeeperName    string                  `json:"keeper_name"`    // 井长及分管负责人（选填）
	KeeperPhone   string                  `json:"keeper_phone"`   // 联系电话（选填）
}

// RoadExt 道路扩展。
type RoadExt struct {
	Length      *float64  `json:"length"`       // 长度（千米）≥0
	Width       *float64  `json:"width"`        // 宽度（米）≥0
	Thickness   *float64  `json:"thickness"`    // 厚度（米）≥0
	HasShoulder *QuizBool `json:"has_shoulder"` // 是否有路肩（正向）
	HasAsh      *QuizBool `json:"has_ash"`      // 是否有灰土层（正向）
	TreeSurvive *float64  `json:"tree_survive"` // 林网存活数量（棵）≥0
	KeeperName  string    `json:"keeper_name"`  // 负责人（选填）
	KeeperPhone string    `json:"keeper_phone"` // 电话（选填）
}

// BridgeExt 桥涵闸扩展。
type BridgeExt struct {
	Kind         model.BridgeKind `json:"kind"`          // 设施类型 bridge|culvert|gate
	Length       *float64         `json:"length"`        // 长度（米）≥0
	Width        *float64         `json:"width"`         // 宽度（米）≥0
	NeedsRectify *QuizBool        `json:"needs_rectify"` // 是否需要整改（负向：是=需整改）
	KeeperName   string           `json:"keeper_name"`   // 负责人（选填）
	KeeperPhone  string           `json:"keeper_phone"`  // 电话（选填）
}

// ForestExt 林网扩展。
type ForestExt struct {
	HandoverCount *float64  `json:"handover_count"` // 移交株数 ≥0
	ExistingCount *float64  `json:"existing_count"` // 现有株数 ≥0
	SurviveRate   *float64  `json:"survive_rate"`   // 存活率 0–100
	BrokenBelt    *QuizBool `json:"broken_belt"`    // 林带是否断带（负向）
	DeadTrees     *QuizBool `json:"dead_trees"`     // 是否有枯死木（负向）
	Pest          *QuizBool `json:"pest"`           // 是否发现病虫害（负向）
	KeeperName    string    `json:"keeper_name"`    // 负责人（选填）
	KeeperPhone   string    `json:"keeper_phone"`   // 电话（选填）
}

// TransformerExt 变压器扩展。
type TransformerExt struct {
	Capacity    *float64                 `json:"capacity"`     // 容量（kVA）≥0
	Model       string                   `json:"model"`        // 型号（选填）
	Voltage     model.TransformerVoltage `json:"voltage"`      // 电压等级 10kv|0.4kv
	Powered     *QuizBool                `json:"powered"`      // 是否通电（正向）
	DeviceOk    *QuizBool                `json:"device_ok"`    // 设备是否完好（正向）
	CabinetOk   *QuizBool                `json:"cabinet_ok"`   // 配电设施是否完好（正向）
	IllegalWire *QuizBool                `json:"illegal_wire"` // 是否私拉乱接（负向）
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

func (s *IssueService) bindQuizBool(ctx context.Context, q *QuizBool, label string, negative bool) (indicatesIssue bool, err error) {
	if q == nil {
		return true, fmt.Errorf("请选择%s", label)
	}
	indicatesIssue = quizIndicatesIssue(q, negative)
	if indicatesIssue {
		if strings.TrimSpace(q.Desc) == "" {
			return true, fmt.Errorf("请填写%s的说明", label)
		}
		if len(q.Files) == 0 {
			return true, fmt.Errorf("请上传%s的现场照片", label)
		}
	}
	if len(q.Files) > 0 {
		if s.Attach == nil {
			return indicatesIssue, errors.New("附件服务未初始化")
		}
		attID, _, bindErr := s.Attach.Bind(ctx, q.Files)
		if bindErr != nil {
			return indicatesIssue, fmt.Errorf("%s照片: %w", label, bindErr)
		}
		q.AttID = attID
	}
	return indicatesIssue, nil
}

func (s *IssueService) normalizeWellExt(ctx context.Context, raw json.RawMessage) (string, bool, error) {
	ext, err := decodeExt[WellExt](raw)
	if err != nil {
		return "", false, err
	}
	if !ext.BuildKind.Valid() {
		return "", false, errors.New("请选择新建/配套")
	}
	needs := false
	for _, item := range []struct {
		q     *QuizBool
		label string
	}{
		{ext.WaterOut, "机井是否出水"},
		{ext.PipeOk, "管道是否按要求连接"},
		{ext.WiringOk, "走线是否规范"},
		{ext.BoxOk, "配电箱是否完好"},
		{ext.CoverOk, "井台、井盖是否完整"},
		{ext.TransformerOk, "变压器是否完好"},
	} {
		issue, e := s.bindQuizBool(ctx, item.q, item.label, false)
		if e != nil {
			return "", false, e
		}
		if issue {
			needs = true
		}
	}
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
	needs := false
	for _, item := range []struct {
		q     *QuizBool
		label string
	}{
		{ext.HasShoulder, "是否有路肩"},
		{ext.HasAsh, "是否有灰土层"},
	} {
		issue, e := s.bindQuizBool(ctx, item.q, item.label, false)
		if e != nil {
			return "", false, e
		}
		if issue {
			needs = true
		}
	}
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
	issue, e := s.bindQuizBool(ctx, ext.NeedsRectify, "是否需要整改", true)
	if e != nil {
		return "", false, e
	}
	canon, err := marshalExt(ext)
	return canon, issue, err
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
	needs := false
	for _, item := range []struct {
		q     *QuizBool
		label string
	}{
		{ext.BrokenBelt, "林带是否断带"},
		{ext.DeadTrees, "是否有枯死木"},
		{ext.Pest, "是否发现病虫害"},
	} {
		issue, e := s.bindQuizBool(ctx, item.q, item.label, true)
		if e != nil {
			return "", false, e
		}
		if issue {
			needs = true
		}
	}
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
	needs := false
	for _, item := range []struct {
		q        *QuizBool
		label    string
		negative bool
	}{
		{ext.Powered, "是否通电", false},
		{ext.DeviceOk, "设备是否完好", false},
		{ext.CabinetOk, "配电设施是否完好", false},
		{ext.IllegalWire, "是否私拉乱接", true},
	} {
		issue, e := s.bindQuizBool(ctx, item.q, item.label, item.negative)
		if e != nil {
			return "", false, e
		}
		if issue {
			needs = true
		}
	}
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

// validateTypeExt 仅结构校验（更新用，不重新 Bind 时可先规范化）。
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
