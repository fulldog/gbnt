package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"
	"unicode/utf8"

	"gbnt/apps/server/internal/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// IssueUpdateInput 管理端编辑契约；指针区分未提交与显式赋值，防止局部修改清空旧记录。
type IssueUpdateInput struct {
	Type                    *string         `json:"type"`                       // 问题类型；切换类型必须提供完整 type_ext，且不能已有整改历史
	ProjectYear             *int            `json:"project_year"`               // 项目年度 2020–2023；省略保留
	OrgID                   *uint64         `json:"org_id"`                     // 行政区划 ID；省略保留
	Code                    *string         `json:"code"`                       // 设施编号；新版不能为空
	Address                 *string         `json:"address"`                    // 地址；提交时不能为空
	Lat                     *float64        `json:"lat"`                        // 纬度 -90～90；省略保留
	Lng                     *float64        `json:"lng"`                        // 经度 -180～180；省略保留
	PlanDate                *string         `json:"plan_date"`                  // 整改计划日 YYYY-MM-DD；空字符串显式清除
	ReporterName            *string         `json:"reporter_name"`              // 上报人姓名快照；空字符串清除
	ReporterPhone           *string         `json:"reporter_phone"`             // 上报联系电话；空字符串清除
	ReportUserID            *uint64         `json:"report_user_id"`             // 上报账号关联；0 解除关联，姓名快照独立保留
	AssigneeUser            *uint64         `json:"assignee_user"`              // 责任人；省略保留；待整改/整改中不允许为 0；非 0 须启用；用户 org_id=0 不限组织，否则须与表单组织同枝
	ReporterSignatureFileID *string         `json:"reporter_signature_file_id"` // 新签名附件 ID；省略保留原签名，不允许清空
	TypeExt                 json.RawMessage `json:"type_ext"`                   // 当前类型完整表单；省略保留，旧版字段兼容保留
	Status                  *string         `json:"status"`                     // 兼容旧调用方显式状态更新；普通编辑不提交该字段
	ExpectedUpdatedAt       *time.Time      `json:"expected_updated_at"`        // 编辑时详情的更新时间；不匹配拒绝覆盖，旧客户端可省略
}

func validateReporterSnapshot(name, phone string) error {
	if utf8.RuneCountInString(strings.TrimSpace(name)) > 128 {
		return errors.New("上报人姓名不能超过 128 字")
	}
	return ValidateOptionalCNPhone(strings.TrimSpace(phone))
}

// Update 行锁内更新基础信息、设施属性、清单及签名；不删除历史，不自动改变整改轮次或状态。
func (s *IssueService) Update(ctx context.Context, id uint64, in IssueUpdateInput) (*IssueVO, error) {
	err := issueWriteTransaction(ctx, s.DB, false, func(tx *gorm.DB) error {
		var item model.Issue
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&item, id).Error; err != nil {
			return err
		}
		if in.ExpectedUpdatedAt != nil && !in.ExpectedUpdatedAt.Equal(item.UpdatedAt) {
			return errors.New("记录已被更新，请重新打开编辑后再保存")
		}
		local := &IssueService{DB: tx, Attach: s.Attach}
		typ, orgID := item.Type, item.OrgID
		if in.Type != nil {
			typ = strings.TrimSpace(*in.Type)
		}
		if !model.IssueType(typ).Valid() {
			return errors.New("问题类型无效")
		}
		if in.OrgID != nil {
			orgID = *in.OrgID
		}
		if err := requireOrgScopeIfAuthenticated(ctx, tx, item.OrgID, orgID); err != nil {
			return err
		}
		if in.OrgID != nil {
			if err := local.requireOrgID(ctx, orgID); err != nil {
				return err
			}
		}
		updates := map[string]interface{}{}
		if in.Type != nil {
			updates["type"] = typ
		}
		if in.OrgID != nil {
			updates["org_id"] = orgID
		}
		if in.ProjectYear != nil {
			if !model.ProjectYear(*in.ProjectYear).Valid() {
				return errors.New("请选择项目年度")
			}
			updates["project_year"] = *in.ProjectYear
		}
		if typ != item.Type {
			if len(in.TypeExt) == 0 {
				return errors.New("切换问题类型须填写新类型的完整表单")
			}
			var count int64
			if err := tx.Model(&model.IssueRectifyRecord{}).Where("issue_id = ?", id).Count(&count).Error; err != nil {
				return err
			}
			if count > 0 {
				return errors.New("该记录已有整改历史，不能跨类型保存；请保留原类型编辑")
			}
		}
		if in.Code != nil {
			if issueExtVersion(json.RawMessage(item.TypeExt)) == 2 && strings.TrimSpace(*in.Code) == "" {
				return errors.New("请填写设施编号")
			}
			updates["code"] = strings.TrimSpace(*in.Code)
		}
		if in.Address != nil {
			if strings.TrimSpace(*in.Address) == "" {
				return errors.New("请填写地址")
			}
			updates["address"] = strings.TrimSpace(*in.Address)
		}
		for name, value := range map[string]*float64{"lat": in.Lat, "lng": in.Lng} {
			if value == nil {
				continue
			}
			limit := 180.0
			if name == "lat" {
				limit = 90
			}
			if math.IsNaN(*value) || math.IsInf(*value, 0) || math.Abs(*value) > limit {
				return errors.New("经纬度无效")
			}
			updates[name] = *value
		}
		plan := item.PlanDate
		if in.PlanDate != nil {
			plan = strings.TrimSpace(*in.PlanDate)
			if plan != "" {
				if _, err := time.Parse("2006-01-02", plan); err != nil {
					return errors.New("整改计划日期无效")
				}
			}
			updates["plan_date"] = plan
		}
		if len(in.TypeExt) > 0 {
			raw := in.TypeExt
			if typ == item.Type {
				var err error
				raw, err = mergeIssueFormHistory(item.TypeExt, raw, typ)
				if err != nil {
					return err
				}
				if issueExtVersion(json.RawMessage(item.TypeExt)) == 2 && issueExtVersion(raw) != 2 {
					return errors.New("新版排查表单不能降级保存，请刷新后重试")
				}
			}
			ext, needs, err := local.normalizeTypeExt(ctx, typ, raw)
			if err != nil {
				return err
			}
			if needs && plan == "" {
				return errors.New("请选择整改计划日期")
			}
			if issueExtVersion(raw) == 2 {
				code := item.Code
				if in.Code != nil {
					code = *in.Code
				}
				if strings.TrimSpace(code) == "" {
					return errors.New("请填写设施编号")
				}
			}
			updates["type_ext"] = ext
		} else if in.PlanDate != nil && plan == "" {
			needs := len(neededQuizTypes(item.Type, item.TypeExt)) > 0
			if item.Type == string(model.IssueTypeWell) {
				var ext WellExt
				if err := json.Unmarshal([]byte(item.TypeExt), &ext); err != nil {
					return errors.New("原排查记录格式无效，无法清除整改计划日期")
				}
				needs = needs || (ext.OutletDamaged != nil && *ext.OutletDamaged > 0) || (ext.CasingDamaged != nil && *ext.CasingDamaged > 0)
			}
			if needs {
				return errors.New("请选择整改计划日期")
			}
		}
		name, phone := item.ReporterName, item.ReporterPhone
		if in.ReporterName != nil {
			name = strings.TrimSpace(*in.ReporterName)
			updates["reporter_name"] = name
		}
		if in.ReporterPhone != nil {
			phone = strings.TrimSpace(*in.ReporterPhone)
			updates["reporter_phone"] = phone
		}
		if err := validateReporterSnapshot(name, phone); err != nil {
			return err
		}
		if in.ReportUserID != nil {
			if err := requireUserOrgScopeIfAuthenticated(ctx, tx, *in.ReportUserID); err != nil {
				return err
			}
			updates["report_user_id"] = *in.ReportUserID
		}
		assignee := item.AssigneeUser
		if in.AssigneeUser != nil {
			assignee = *in.AssigneeUser
		}
		status := item.Status
		if in.Status != nil {
			status = *in.Status
		}
		// 新建、导入以及后续编辑都不能把待处理工单保存成无人负责。
		if (status == string(model.IssueStatusNew) || status == string(model.IssueStatusPending)) && assignee == 0 {
			return errors.New("请指定整改人")
		}
		if in.AssigneeUser != nil || orgID != item.OrgID {
			if err := local.requireAssigneeInFormOrg(ctx, assignee, orgID); err != nil {
				return err
			}
		}
		if in.AssigneeUser != nil {
			if err := requireUserOrgScopeIfAuthenticated(ctx, tx, assignee); err != nil {
				return err
			}
			updates["assignee_user"] = assignee
		}
		if in.ReporterSignatureFileID != nil {
			sig := strings.TrimSpace(*in.ReporterSignatureFileID)
			if sig == "" {
				return errors.New("请完成电子签名")
			}
			if s.Attach != nil {
				if _, err := s.Attach.EnsureFiles(ctx, []string{sig}); err != nil {
					return fmt.Errorf("电子签名: %w", err)
				}
			}
			updates["reporter_signature_file_id"] = sig
		}
		if in.Status != nil {
			if !model.IssueStatus(*in.Status).Valid() {
				return errors.New("状态无效")
			}
			updates["status"] = *in.Status
		}
		if len(updates) == 0 {
			return nil
		}
		if in.Code != nil || orgID != item.OrgID || typ != item.Type {
			code := item.Code
			if in.Code != nil {
				code = *in.Code
			}
			code, err := model.NormalizeFacilityCode(code)
			if err != nil {
				return err
			}
			if err := lockIssueOrgs(tx, item.OrgID, orgID); err != nil {
				return err
			}
			if err := requireAvailableCode(tx, orgID, typ, code, item.ID); err != nil {
				return err
			}
			updates["code"], updates["code_key"] = code, code
		}
		return tx.Model(&item).Updates(updates).Error
	})
	if err != nil {
		return nil, err
	}
	return s.Get(id)
}
