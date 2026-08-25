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
