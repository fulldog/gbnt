package service

import (
	"context"
	"encoding/json"

	"gbnt/apps/server/internal/database"
)

// MiniappIssueVO 小程序问题视图，仅补充该问题的关联名称；不暴露人员目录或扩展读取范围。
// 与管理端单独定义公开契约；内部复用相同的最小字段批量查询。
type MiniappIssueVO struct {
	AdminIssueVO
	DisplayWarning string `json:"display_warning,omitempty"` // 仅写入已成功但名称暂不可读时返回，提醒刷新而非重复提交
}

// MarshalJSON 保留基础问题、附件与轮次字段，显式展开小程序关联名称。
func (v MiniappIssueVO) MarshalJSON() ([]byte, error) {
	base, err := v.AdminIssueVO.MarshalJSON()
	if err != nil || v.DisplayWarning == "" {
		return base, err
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(base, &fields); err != nil {
		return nil, err
	}
	fields["display_warning"], _ = json.Marshal(v.DisplayWarning)
	return json.Marshal(fields)
}

// MiniappUserDisplay 小程序本人展示字段；失效组织和角色固定返回 null。
type MiniappUserDisplay struct {
	OrgName  *string `json:"org_name"`  // 当前组织名称；未设置或已删除为 null
	OrgPath  *string `json:"org_path"`  // 可解析的组织路径；未设置或已删除为 null
	RoleName *string `json:"role_name"` // 当前角色名称；未设置或已删除为 null，超管身份仍看 is_super_admin
}

// MiniappUserNames 读取当前登录用户已有组织、角色关联；不返回密码、令牌版本等模型字段。
func (s *AuthService) MiniappUserNames(ctx context.Context, user *database.UserInfo) (*MiniappUserDisplay, error) {
	if user == nil {
		return nil, database.ErrUnauth
	}
	names, err := loadAdminDisplayNames(s.DB.WithContext(ctx), nil, []uint64{user.OrgID}, []uint64{user.RoleID})
	if err != nil {
		return nil, err
	}
	orgName, orgPath := names.orgDisplay(user.OrgID)
	return &MiniappUserDisplay{OrgName: orgName, OrgPath: orgPath, RoleName: nullableName(names.roles, user.RoleID)}, nil
}

// MiniappIssueViews 仅对已获准读取/写入的结果批量补充名称；不改变调用方原有组织、本人等筛选。
func (s *IssueService) MiniappIssueViews(ctx context.Context, list []IssueVO) ([]MiniappIssueVO, error) {
	items, err := enrichAdminIssues(s.db(ctx), list)
	if err != nil {
		return nil, err
	}
	out := make([]MiniappIssueVO, 0, len(items))
	for _, item := range items {
		out = append(out, MiniappIssueVO{AdminIssueVO: item})
	}
	return out, nil
}

// GetMiniapp 保持原详情读取规则，基础读取成功后补充小程序展示字段。
func (s *IssueService) GetMiniapp(ctx context.Context, id uint64) (*MiniappIssueVO, error) {
	item, err := s.Get(id)
	if err != nil {
		return nil, err
	}
	out, err := s.MiniappIssueViews(ctx, []IssueVO{*item})
	if err != nil {
		return nil, err
	}
	return &out[0], nil
}
