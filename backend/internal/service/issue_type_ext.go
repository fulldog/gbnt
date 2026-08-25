package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

// 上报 type_ext JSON 与 demo/miniapp/report.html 类型专有字段对齐（snake_case）。
// 是/否题为 JSON bool：true=是，false=否；缺省（null/未传）视为未填。
// 整改措施 / 计划完成日在顶层 measures、plan_date，不放进 type_ext。

// WellExt 机井扩展。
type WellExt struct {
	BuildKind     string `json:"build_kind"`     // 新建/配套 new|match
	WaterOut      *bool  `json:"water_out"`      // 机井是否出水（≥5分钟）
	PipeOk        *bool  `json:"pipe_ok"`        // 管道是否按要求连接
	WiringOk      *bool  `json:"wiring_ok"`      // 走线是否规范
	BoxOk         *bool  `json:"box_ok"`         // 配电箱是否完好
	CoverOk       *bool  `json:"cover_ok"`       // 井台、井盖是否完整
	OutletTotal   *int   `json:"outlet_total"`   // 出水口总数
	OutletDamaged *int   `json:"outlet_damaged"` // 出水口损坏数量
	CasingTotal   *int   `json:"casing_total"`   // 护筒总数
	CasingDamaged *int   `json:"casing_damaged"` // 护筒损坏数量
	KeeperName    string `json:"keeper_name"`    // 井长及分管负责人（选填）
	KeeperPhone   string `json:"keeper_phone"`   // 联系电话（选填）
}

// RoadExt 道路扩展。
type RoadExt struct {
	Length      *float64 `json:"length"`       // 长度（千米）
	Width       *float64 `json:"width"`        // 宽度（米）
	Thickness   *float64 `json:"thickness"`    // 厚度（米）
	HasShoulder *bool    `json:"has_shoulder"` // 是否有路肩
	HasAsh      *bool    `json:"has_ash"`      // 是否有灰土层
	TreeSurvive *float64 `json:"tree_survive"` // 林网存活数量（棵）
	KeeperName  string   `json:"keeper_name"`  // 负责人（选填）
	KeeperPhone string   `json:"keeper_phone"` // 电话（选填）
}

// BridgeExt 桥涵闸扩展。
type BridgeExt struct {
	Kind        string   `json:"kind"`         // 设施类型 bridge|culvert|gate
	Length      *float64 `json:"length"`       // 长度（米）
	Width       *float64 `json:"width"`        // 宽度（米）
	KeeperName  string   `json:"keeper_name"`  // 负责人（选填）
	KeeperPhone string   `json:"keeper_phone"` // 电话（选填）
}

// ForestExt 林网扩展。
type ForestExt struct {
	HandoverCount *float64 `json:"handover_count"` // 移交株数
	ExistingCount *float64 `json:"existing_count"` // 现有株数
	SurviveRate   *float64 `json:"survive_rate"`   // 存活率 0–100
	BrokenBelt    *bool    `json:"broken_belt"`    // 林带是否断带
	DeadTrees     *bool    `json:"dead_trees"`     // 是否有枯死木
	Pest          *bool    `json:"pest"`           // 是否发现病虫害
	KeeperName    string   `json:"keeper_name"`    // 负责人（选填）
	KeeperPhone   string   `json:"keeper_phone"`   // 电话（选填）
}

// TransformerExt 变压器扩展。
type TransformerExt struct {
	Capacity    *float64 `json:"capacity"`     // 容量（kVA）
	Model       string   `json:"model"`        // 型号（选填）
	Voltage     string   `json:"voltage"`      // 电压等级 10kv|0.4kv
	Powered     *bool    `json:"powered"`      // 是否通电
	DeviceOk    *bool    `json:"device_ok"`    // 设备是否完好
	CabinetOk   *bool    `json:"cabinet_ok"`   // 配电设施是否完好
	IllegalWire *bool    `json:"illegal_wire"` // 是否私拉乱接
	KeeperName  string   `json:"keeper_name"`  // 负责人（选填）
	KeeperPhone string   `json:"keeper_phone"` // 电话（选填）
}

func requireBool(p *bool, label string) error {
	if p == nil {
		return fmt.Errorf("请选择%s", label)
	}
	return nil
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

func validateWellExt(raw json.RawMessage) (string, error) {
	ext, err := decodeExt[WellExt](raw)
	if err != nil {
		return "", err
	}
	switch ext.BuildKind {
	case "new", "match":
	default:
		return "", errors.New("请选择新建/配套")
	}
	if err := requireBool(ext.WaterOut, "机井是否出水"); err != nil {
		return "", err
	}
	if err := requireBool(ext.PipeOk, "管道是否按要求连接"); err != nil {
		return "", err
	}
	if err := requireBool(ext.WiringOk, "走线是否规范"); err != nil {
		return "", err
	}
	if err := requireBool(ext.BoxOk, "配电箱是否完好"); err != nil {
		return "", err
	}
	if err := requireBool(ext.CoverOk, "井台、井盖是否完整"); err != nil {
		return "", err
	}
	if err := requireIntGE0(ext.OutletTotal, "出水口总数"); err != nil {
		return "", err
	}
	if err := requireIntGE0(ext.OutletDamaged, "出水口损坏数量"); err != nil {
		return "", err
	}
	if *ext.OutletDamaged > *ext.OutletTotal {
		return "", errors.New("出水口损坏数量不能大于总数")
	}
	if err := requireIntGE0(ext.CasingTotal, "护筒总数"); err != nil {
		return "", err
	}
	if err := requireIntGE0(ext.CasingDamaged, "护筒损坏数量"); err != nil {
		return "", err
	}
	if *ext.CasingDamaged > *ext.CasingTotal {
		return "", errors.New("护筒损坏数量不能大于总数")
	}
	return marshalExt(ext)
}

func validateRoadExt(raw json.RawMessage) (string, error) {
	ext, err := decodeExt[RoadExt](raw)
	if err != nil {
		return "", err
	}
	if err := requireFloatGE0(ext.Length, "道路长度"); err != nil {
		return "", err
	}
	if err := requireFloatGE0(ext.Width, "道路宽度"); err != nil {
		return "", err
	}
	if err := requireFloatGE0(ext.Thickness, "道路厚度"); err != nil {
		return "", err
	}
	if err := requireBool(ext.HasShoulder, "是否有路肩"); err != nil {
		return "", err
	}
	if err := requireBool(ext.HasAsh, "是否有灰土层"); err != nil {
		return "", err
	}
	if err := requireFloatGE0(ext.TreeSurvive, "林网树木存活数量"); err != nil {
		return "", err
	}
	return marshalExt(ext)
}

func validateBridgeExt(raw json.RawMessage) (string, error) {
	ext, err := decodeExt[BridgeExt](raw)
	if err != nil {
		return "", err
	}
	switch ext.Kind {
	case "bridge", "culvert", "gate":
	default:
		return "", errors.New("请选择设施类型（桥/涵/闸）")
	}
	if err := requireFloatGE0(ext.Length, "长度"); err != nil {
		return "", err
	}
	if err := requireFloatGE0(ext.Width, "宽度"); err != nil {
		return "", err
	}
	return marshalExt(ext)
}

func validateForestExt(raw json.RawMessage) (string, error) {
	ext, err := decodeExt[ForestExt](raw)
	if err != nil {
		return "", err
	}
	if err := requireFloatGE0(ext.HandoverCount, "移交株数"); err != nil {
		return "", err
	}
	if err := requireFloatGE0(ext.ExistingCount, "现有株数"); err != nil {
		return "", err
	}
	if err := requireFloatGE0(ext.SurviveRate, "存活率"); err != nil {
		return "", err
	}
	if *ext.SurviveRate > 100 {
		return "", errors.New("存活率应在 0–100 之间")
	}
	if err := requireBool(ext.BrokenBelt, "林带是否断带"); err != nil {
		return "", err
	}
	if err := requireBool(ext.DeadTrees, "是否有枯死木"); err != nil {
		return "", err
	}
	if err := requireBool(ext.Pest, "是否发现病虫害"); err != nil {
		return "", err
	}
	return marshalExt(ext)
}

func validateTransformerExt(raw json.RawMessage) (string, error) {
	ext, err := decodeExt[TransformerExt](raw)
	if err != nil {
		return "", err
	}
	if err := requireFloatGE0(ext.Capacity, "变压器容量"); err != nil {
		return "", err
	}
	switch ext.Voltage {
	case "10kv", "0.4kv":
	default:
		return "", errors.New("请选择电压等级")
	}
	if err := requireBool(ext.Powered, "是否通电"); err != nil {
		return "", err
	}
	if err := requireBool(ext.DeviceOk, "设备是否完好"); err != nil {
		return "", err
	}
	if err := requireBool(ext.CabinetOk, "配电设施是否完好"); err != nil {
		return "", err
	}
	if err := requireBool(ext.IllegalWire, "是否私拉乱接"); err != nil {
		return "", err
	}
	return marshalExt(ext)
}

func validateTypeExt(typ string, raw json.RawMessage) (string, error) {
	switch typ {
	case "well":
		return validateWellExt(raw)
	case "road":
		return validateRoadExt(raw)
	case "bridge":
		return validateBridgeExt(raw)
	case "forest":
		return validateForestExt(raw)
	case "transformer":
		return validateTransformerExt(raw)
	default:
		return "", errors.New("问题类型无效")
	}
}

// validateIssueCreate 对齐 report.html / m-report.js 提交校验。
func validateIssueCreate(in IssueInput) (string, error) {
	typ := strings.TrimSpace(in.Type)
	if typ == "" {
		return "", errors.New("请选择问题类型")
	}
	if strings.TrimSpace(in.Street) == "" || strings.TrimSpace(in.Village) == "" {
		return "", errors.New("请选择行政区划")
	}
	if strings.TrimSpace(in.ProjectName) == "" {
		return "", errors.New("请填写项目名称")
	}
	if strings.TrimSpace(in.Description) == "" {
		return "", errors.New("请填写问题描述")
	}
	if strings.TrimSpace(in.Address) == "" && strings.TrimSpace(in.LocationText) == "" {
		return "", errors.New("请填写定位地址")
	}
	if strings.TrimSpace(in.Measures) == "" {
		return "", errors.New("请填写整改措施")
	}
	if strings.TrimSpace(in.PlanDate) == "" {
		return "", errors.New("请选择计划整改完成时间")
	}
	if strings.TrimSpace(in.AssigneeName) == "" {
		return "", errors.New("请填写整改责任人")
	}
	if strings.TrimSpace(in.AssigneePhone) == "" {
		return "", errors.New("请填写整改联系电话")
	}
	if len(in.FileUUIDs) == 0 {
		return "", errors.New("请至少上传 1 张图片")
	}
	return validateTypeExt(typ, in.TypeExt)
}
