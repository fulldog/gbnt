package service

import (
	"context"
	"errors"
	"strings"

	"gbnt/apps/server/internal/model"
	"gorm.io/gorm"
)

// ErrOptionArgument 表示业务候选参数无效，HTTP 入口转换为 400。
var ErrOptionArgument = errors.New("org_id 必填且必须大于 0")

// BusinessOrgOption 业务模块的最小组织候选；不包含系统管理字段。
type BusinessOrgOption struct {
	ID       uint64        `json:"id"`        // 组织 ID，必有
	Name     string        `json:"name"`      // 组织名称，必有
	Type     model.OrgType `json:"type"`      // root/district/street/village
	ParentID uint64        `json:"parent_id"` // 父组织 ID，根为 0
	Sort     int           `json:"sort"`      // 排序号，越小越靠前
}

// BusinessUserOption 业务模块人员候选，不泄露电话、密码或角色信息。
type BusinessUserOption struct {
	ID       uint64 `json:"id"`       // 用户 ID，必有
	Name     string `json:"name"`     // 姓名；空姓名回退账号
	Username string `json:"username"` // 登录账号，用于同名人员区分
}

// BusinessUserOptionQuery 人员候选参数；组织由具体业务入口验证。
type BusinessUserOptionQuery struct {
	Keyword    string // 姓名或账号模糊查询，选填；去除首尾空白
	Page       int    // 页码，默认 1
	Size       int    // 每页条数，默认 20，最大 100
	SelectedID uint64 // 已选人员 ID，选填；只允许同组织启用人员回显
}

// BusinessUserOptionResult 分页候选；已选回显独立于查询页，不改变 total 和分页。
type BusinessUserOptionResult struct {
	List     []BusinessUserOption `json:"list"`     // 本页人员，无记录固定为空数组
	Total    int64                `json:"total"`    // 同组织启用人员经关键字筛选后的数量
	Page     int                  `json:"page"`     // 实际使用页码，至少为 1
	Size     int                  `json:"size"`     // 实际使用每页条数，1–100
	Selected *BusinessUserOption  `json:"selected"` // 合法已选人员；未传、已删除、停用或跨组织为 null
}

// ListBusinessOrgOptions 提供业务授权内的轻量组织选项；本轮保持现有全局业务范围，不引入行级隔离。
func (s *SysService) ListBusinessOrgOptions(ctx context.Context, streetsOnly bool) ([]BusinessOrgOption, error) {
	q := s.db(ctx).Model(&model.SysOrg{})
	if streetsOnly {
		q = q.Where("type = ?", model.OrgTypeStreet)
	}
	list := make([]BusinessOrgOption, 0)
	err := q.Select("id", "name", "type", "parent_id", "sort").Order("sort ASC, id ASC").Find(&list).Error
	return list, err
}

func requireOptionOrg(db *gorm.DB, orgID uint64) error {
	if orgID == 0 {
		return ErrOptionArgument
	}
	var org model.SysOrg
	return db.Select("id").First(&org, orgID).Error
}

func eligibleUserOptions(db *gorm.DB, orgID uint64) *gorm.DB {
	// 候选仅沿用当前同组织启用口径；写入端跨组织规则不在本阶段改变。
	return db.Model(&model.SysUser{}).Where("org_id = ? AND status = ?", orgID, 1)
}

func listBusinessUserOptions(db *gorm.DB, orgID uint64, query BusinessUserOptionQuery) (*BusinessUserOptionResult, error) {
	query.Page, query.Size = NormalizePagination(query.Page, query.Size, 100)
	q := eligibleUserOptions(db, orgID)
	if keyword := strings.TrimSpace(query.Keyword); keyword != "" {
		like := "%" + keyword + "%"
		q = q.Where("(name LIKE ? OR username LIKE ?)", like, like)
	}
	result := &BusinessUserOptionResult{List: []BusinessUserOption{}, Page: query.Page, Size: query.Size}
	if err := q.Count(&result.Total).Error; err != nil {
		return nil, err
	}
	if err := q.Select("id", "name", "username").Order("id DESC").Offset((query.Page - 1) * query.Size).Limit(query.Size).Find(&result.List).Error; err != nil {
		return nil, err
	}
	for i := range result.List {
		result.List[i].Name = displayUserName(result.List[i].Name, result.List[i].Username)
	}
	if query.SelectedID != 0 {
		var selected BusinessUserOption
		// 独立查询不受当前关键字与页码影响，但绝不能越过同组织、启用及软删除条件。
		err := eligibleUserOptions(db, orgID).Select("id", "name", "username").Where("id = ?", query.SelectedID).Take(&selected).Error
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		if err == nil {
			selected.Name = displayUserName(selected.Name, selected.Username)
			result.Selected = &selected
		}
	}
	return result, nil
}

// ListReporterOptions 新建问题的上报人候选；要求目标组织存在，仅返回同组织启用用户。
func (s *SysService) ListReporterOptions(ctx context.Context, orgID uint64, query BusinessUserOptionQuery) (*BusinessUserOptionResult, error) {
	if orgID == 0 {
		return nil, ErrOptionArgument
	}
	if err := requireOptionOrg(s.db(ctx), orgID); err != nil {
		return nil, err
	}
	return listBusinessUserOptions(s.db(ctx), orgID, query)
}

// ListAssigneeOptions 已有问题的同组织启用责任人候选；编辑权限由业务路由的 RBAC 校验。
func (s *IssueService) ListAssigneeOptions(ctx context.Context, issueID uint64, query BusinessUserOptionQuery) (*BusinessUserOptionResult, error) {
	var issue model.Issue
	if err := s.db(ctx).Select("id", "org_id").First(&issue, issueID).Error; err != nil {
		return nil, err
	}
	if err := requireOptionOrg(s.db(ctx), issue.OrgID); err != nil {
		return nil, err
	}
	return listBusinessUserOptions(s.db(ctx), issue.OrgID, query)
}
