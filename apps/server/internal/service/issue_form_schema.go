package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"

	"gbnt/apps/server/internal/model"
)

// IssueExtMetadata 记录表单版本；未提供版本的旧小程序继续使用原校验与整改规则。
type IssueExtMetadata struct {
	SchemaVersion   int        `json:"schema_version,omitempty"`   // 0/1 为旧版，2 为原型对齐后的五类表单
	LegacyChecklist []QuizBool `json:"legacy_checklist,omitempty"` // 已退出当前表单的历史题项，保留答案和附件
}

func issueExtVersion(raw json.RawMessage) int {
	var meta IssueExtMetadata
	if json.Unmarshal(raw, &meta) != nil {
		return -1
	}
	return meta.SchemaVersion
}

func formChecklistSpecsFor(typ string) []quizSpec {
	switch model.IssueType(typ) {
	case model.IssueTypeWell:
		return wellChecklistSpecs[:5]
	case model.IssueTypeRoad:
		return []quizSpec{{model.QuizHasShoulder, "是否有路肩", false}, {model.QuizHasAsh, "是否有灰土层", false}, {model.QuizHasRoadDamage, "是否有道路损坏", true}}
	case model.IssueTypeBridge:
		return []quizSpec{{model.QuizNeedsRectify, "是否有淤堵与损坏", true}}
	default:
		return checklistSpecsFor(typ)
	}
}

func cleanFormFiles(ids []string) []string {
	out := []string{}
	seen := map[string]bool{}
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id != "" && !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}

func (s *IssueService) formFiles(ctx context.Context, ids []string, minimum int, label string) ([]string, error) {
	clean := cleanFormFiles(ids)
	if len(clean) < minimum {
		return nil, fmt.Errorf("%s至少需要 %d 张照片", label, minimum)
	}
	if len(clean) > 6 {
		return nil, fmt.Errorf("%s最多 6 张照片", label)
	}
	if len(clean) > 0 && s.Attach != nil {
		return s.Attach.EnsureFiles(ctx, clean)
	}
	return clean, nil
}

// normalizeIssueFormExt 分类型验证新版完整表单，照片要求由服务端规则决定。
func (s *IssueService) normalizeIssueFormExt(ctx context.Context, typ string, raw json.RawMessage) (string, bool, error) {
	var data map[string]json.RawMessage
	if err := json.Unmarshal(raw, &data); err != nil || data == nil {
		return "", false, errors.New("type_ext 格式无效")
	}
	var answers []struct {
		Type  model.QuizType `json:"type"`  // 当前类型的题目标识，必填且不重复
		Value *bool          `json:"value"` // 未回答不能解释为选择否
	}
	if json.Unmarshal(data["checklist"], &answers) != nil {
		return "", false, errors.New("请填写排查清单")
	}
	var list []QuizBool
	if json.Unmarshal(data["checklist"], &list) != nil {
		return "", false, errors.New("排查清单格式无效")
	}
	specs := formChecklistSpecsFor(typ)
	if len(specs) == 0 || len(list) != len(specs) {
		return "", false, errors.New("排查题目与当前类型不一致")
	}
	byType := map[model.QuizType]QuizBool{}
	for i, answer := range answers {
		if answer.Value == nil {
			return "", false, fmt.Errorf("请选择排查项 %s 的答案", answer.Type)
		}
		if _, exists := byType[answer.Type]; exists {
			return "", false, errors.New("排查题目重复")
		}
		byType[answer.Type] = list[i]
	}
	needs := false
	canonical := []QuizBool{}
	for _, spec := range specs {
		q, exists := byType[spec.Type]
		if !exists {
			return "", false, fmt.Errorf("请选择%s", spec.Label)
		}
		observation := q.Type == model.QuizHasShoulder || q.Type == model.QuizHasAsh
		abnormal := !observation && quizIndicatesIssue(&q, spec.Negative)
		q.Desc = strings.TrimSpace(q.Desc)
		if abnormal && q.Desc == "" {
			return "", false, fmt.Errorf("请填写%s的说明", spec.Label)
		}
		q.MustImg = !observation && (q.Type != model.QuizWiringOk || abnormal)
		minimum := 0
		if q.MustImg {
			minimum = 1
		}
		if q.Type == model.QuizWaterOut && q.Value {
			minimum = 2
		}
		var err error
		q.Files, err = s.formFiles(ctx, q.Files, minimum, spec.Label)
		if err != nil {
			return "", false, err
		}
		q.Photos = nil
		canonical = append(canonical, q)
		needs = needs || abnormal
	}
	data["checklist"], _ = json.Marshal(canonical)
	data["schema_version"] = json.RawMessage("2")
	// 数量、单位和枚举按设施类型独立验证；历史字段不再要求补零。
	for _, field := range []string{"keeper_name", "keeper_phone"} {
		if _, ok := data[field]; !ok {
			data[field] = json.RawMessage(`""`)
		}
	}
	patched, _ := json.Marshal(data)
	validateNumbers := func(fields ...string) error {
		for _, field := range fields {
			var value *float64
			if json.Unmarshal(data[field], &value) != nil || value == nil || *value < 0 {
				return fmt.Errorf("请完整填写有效的设施属性：%s", field)
			}
		}
		return nil
	}
	switch model.IssueType(typ) {
	case model.IssueTypeWell:
		ext, err := decodeExt[WellExt](patched)
		if err != nil {
			return "", false, err
		}
		if !ext.BuildKind.Valid() {
			return "", false, errors.New("请选择新建/配套")
		}
		if err := validateNumbers("outlet_total", "outlet_damaged", "casing_total", "casing_damaged"); err != nil {
			return "", false, err
		}
		if *ext.OutletDamaged > *ext.OutletTotal || *ext.CasingDamaged > *ext.CasingTotal {
			return "", false, errors.New("损坏数量不能大于总数")
		}
		ext.PanoramaFiles, err = s.formFiles(ctx, ext.PanoramaFiles, 1, "全景照片")
		if err != nil {
			return "", false, err
		}
		ext.PanoramaPhotos = nil
		needs = needs || *ext.OutletDamaged > 0 || *ext.CasingDamaged > 0
		canon, err := marshalExt(ext)
		return canon, needs, err
	case model.IssueTypeRoad:
		if err := validateNumbers("length", "width", "thickness"); err != nil {
			return "", false, err
		}
		ext, err := decodeExt[RoadExt](patched)
		if err != nil {
			return "", false, err
		}
		canon, err := marshalExt(ext)
		return canon, needs, err
	case model.IssueTypeBridge:
		if err := validateNumbers("length", "width"); err != nil {
			return "", false, err
		}
		ext, err := decodeExt[BridgeExt](patched)
		if err != nil {
			return "", false, err
		}
		if !ext.Kind.Valid() {
			return "", false, errors.New("请选择桥/涵/闸")
		}
		canon, err := marshalExt(ext)
		return canon, needs, err
	case model.IssueTypeForest:
		if err := validateNumbers("handover_count", "existing_count"); err != nil {
			return "", false, err
		}
		ext, err := decodeExt[ForestExt](patched)
		if err != nil {
			return "", false, err
		}
		if math.Trunc(*ext.HandoverCount) != *ext.HandoverCount || math.Trunc(*ext.ExistingCount) != *ext.ExistingCount {
			return "", false, errors.New("移交株数和现有株数须为非负整数")
		}
		canon, err := marshalExt(ext)
		return canon, needs, err
	case model.IssueTypeTransformer:
		if err := validateNumbers("capacity"); err != nil {
			return "", false, err
		}
		ext, err := decodeExt[TransformerExt](patched)
		if err != nil {
			return "", false, err
		}
		if !ext.Voltage.Valid() || strings.TrimSpace(ext.Model) == "" {
			return "", false, errors.New("请填写型号并选择电压等级")
		}
		canon, err := marshalExt(ext)
		return canon, needs, err
	}
	return "", false, errors.New("问题类型无效")
}

// mergeIssueFormHistory 保留未编辑的历史扩展属性；新版机井退出的题项归档而不删除。
func mergeIssueFormHistory(previous string, incoming json.RawMessage, typ string) (json.RawMessage, error) {
	var old, next map[string]json.RawMessage
	if err := json.Unmarshal(incoming, &next); err != nil || next == nil {
		return nil, errors.New("type_ext 格式无效")
	}
	_ = json.Unmarshal([]byte(previous), &old)
	if old == nil {
		old = map[string]json.RawMessage{}
	}
	if issueExtVersion(incoming) == 2 && typ == string(model.IssueTypeWell) {
		var archive, oldList []QuizBool
		_ = json.Unmarshal(old["legacy_checklist"], &archive)
		_ = json.Unmarshal(old["checklist"], &oldList)
		for _, q := range oldList {
			if q.Type == model.QuizTransformerOk {
				archive = append(archive, q)
			}
		}
		if len(archive) > 0 {
			old["legacy_checklist"], _ = json.Marshal(archive)
		}
	}
	for key, value := range next {
		if key != "legacy_checklist" {
			old[key] = value
		}
	}
	return json.Marshal(old)
}
