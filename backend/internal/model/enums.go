// Package model 枚举与组织类型定义见本文件及 models.go。
package model

// IssueType 问题类型。
type IssueType string

const (
	IssueTypeWell        IssueType = "well"
	IssueTypeRoad        IssueType = "road"
	IssueTypeBridge      IssueType = "bridge"
	IssueTypeForest      IssueType = "forest"
	IssueTypeTransformer IssueType = "transformer"
)

func (t IssueType) Valid() bool {
	switch t {
	case IssueTypeWell, IssueTypeRoad, IssueTypeBridge, IssueTypeForest, IssueTypeTransformer:
		return true
	default:
		return false
	}
}

// ProjectYear 项目年度。
type ProjectYear int

func (y ProjectYear) Valid() bool {
	switch y {
	case 2020, 2021, 2022, 2023:
		return true
	default:
		return false
	}
}

// FacilityBuildKind 机井设施类型：新建/配套。
type FacilityBuildKind string

const (
	FacilityBuildNew   FacilityBuildKind = "new"
	FacilityBuildMatch FacilityBuildKind = "match"
)

func (k FacilityBuildKind) Valid() bool {
	return k == FacilityBuildNew || k == FacilityBuildMatch
}

// BridgeKind 桥涵闸设施类型。
type BridgeKind string

const (
	BridgeKindBridge  BridgeKind = "bridge"
	BridgeKindCulvert BridgeKind = "culvert"
	BridgeKindGate    BridgeKind = "gate"
)

func (k BridgeKind) Valid() bool {
	switch k {
	case BridgeKindBridge, BridgeKindCulvert, BridgeKindGate:
		return true
	default:
		return false
	}
}

// TransformerVoltage 变压器电压等级。
type TransformerVoltage string

const (
	TransformerVoltage10kV TransformerVoltage = "10kv"
	TransformerVoltage04kV TransformerVoltage = "0.4kv"
)

func (v TransformerVoltage) Valid() bool {
	return v == TransformerVoltage10kV || v == TransformerVoltage04kV
}

// QuizType type_ext.checklist 单项类型（按问题类型子集校验）。
type QuizType string

const (
	QuizWaterOut      QuizType = "water_out"      // 机井是否出水（正向）
	QuizPipeOk        QuizType = "pipe_ok"        // 管道是否按要求连接（正向）
	QuizWiringOk      QuizType = "wiring_ok"      // 走线是否规范（正向）
	QuizBoxOk         QuizType = "box_ok"         // 配电箱是否完好（正向）
	QuizCoverOk       QuizType = "cover_ok"       // 井台、井盖是否完整（正向）
	QuizTransformerOk QuizType = "transformer_ok" // 变压器是否完好（正向）
	QuizHasShoulder   QuizType = "has_shoulder"   // 是否有路肩（正向）
	QuizHasAsh        QuizType = "has_ash"        // 是否有灰土层（正向）
	QuizNeedsRectify  QuizType = "needs_rectify"  // 桥涵闸是否需要整改（负向）
	QuizBrokenBelt    QuizType = "broken_belt"    // 林带是否断带（负向）
	QuizDeadTrees     QuizType = "dead_trees"     // 是否有枯死木（负向）
	QuizPest          QuizType = "pest"           // 是否发现病虫害（负向）
	QuizPowered       QuizType = "powered"        // 是否通电（正向）
	QuizDeviceOk      QuizType = "device_ok"      // 设备是否完好（正向）
	QuizCabinetOk     QuizType = "cabinet_ok"     // 配电设施是否完好（正向）
	QuizIllegalWire   QuizType = "illegal_wire"   // 是否私拉乱接（负向）
)

// Valid 是否为已定义的排查项类型。
func (t QuizType) Valid() bool {
	switch t {
	case QuizWaterOut, QuizPipeOk, QuizWiringOk, QuizBoxOk, QuizCoverOk, QuizTransformerOk,
		QuizHasShoulder, QuizHasAsh, QuizNeedsRectify,
		QuizBrokenBelt, QuizDeadTrees, QuizPest,
		QuizPowered, QuizDeviceOk, QuizCabinetOk, QuizIllegalWire:
		return true
	default:
		return false
	}
}

// IssueStatus 排查整改状态。
type IssueStatus string

const (
	IssueStatusNew     IssueStatus = "new"     // 待整改
	IssueStatusPending IssueStatus = "pending" // 整改中
	IssueStatusDone    IssueStatus = "done"    // 已整改
)

func (s IssueStatus) Valid() bool {
	switch s {
	case IssueStatusNew, IssueStatusPending, IssueStatusDone:
		return true
	default:
		return false
	}
}
