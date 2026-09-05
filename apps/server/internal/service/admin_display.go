package service

import (
	"context"
	"encoding/json"
	"sort"
	"strings"

	"gbnt/apps/server/internal/model"
	"gorm.io/gorm"
)

// AdminIssueVO 管理端问题读取视图；保留基础字段，关联不存在时名称固定输出 null。
type AdminIssueVO struct {
	IssueVO
	ReportUserName   *string `json:"report_user_name"`   // 当前上报人姓名，空姓名回退账号；缺失为 null
	AssigneeUserName *string `json:"assignee_user_name"` // 当前责任人姓名，空姓名回退账号；未指派或缺失为 null
	OrgName          *string `json:"org_name"`           // 当前组织名称；缺失为 null
	OrgPath          *string `json:"org_path"`           // 可解析祖先及本组织，以「 / 」分隔；缺失为 null
}

// MarshalJSON 显式合并基础视图，避免匿名嵌入 IssueVO 后其序列化方法吞掉管理端名称字段。
func (v AdminIssueVO) MarshalJSON() ([]byte, error) {
	base, err := v.IssueVO.MarshalJSON()
	if err != nil {
		return nil, err
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(base, &fields); err != nil {
		return nil, err
	}
	for name, value := range map[string]*string{
		"report_user_name": v.ReportUserName, "assignee_user_name": v.AssigneeUserName,
		"org_name": v.OrgName, "org_path": v.OrgPath,
	} {
		encoded, err := json.Marshal(value)
		if err != nil {
			return nil, err
		}
		fields[name] = encoded
	}
	return json.Marshal(fields)
}

// AdminUserVO 管理端工作人员列表；不改变写入接口及完整用户模型。
type AdminUserVO struct {
	model.SysUser
	OrgName  *string `json:"org_name"`  // 当前组织名称；未设置或缺失为 null
	OrgPath  *string `json:"org_path"`  // 可解析组织路径；未设置或缺失为 null
	RoleName *string `json:"role_name"` // 当前角色名称；未设置或缺失为 null，超管身份另看 is_super_admin
}

type adminDisplayNames struct {
	users map[uint64]string
	orgs  map[uint64]model.SysOrg
	roles map[uint64]string
}

// NormalizePagination 统一实际查询与响应页码；maxSize 为 0 时保留现有列表大小语义。
func NormalizePagination(page, size, maxSize int) (int, int) {
	if page <= 0 {
		page = 1
	}
	if size <= 0 {
		size = 20
	}
	if maxSize > 0 && size > maxSize {
		size = maxSize
	}
	return page, size
}

func uniqueNonzeroIDs(ids []uint64) []uint64 {
	seen := make(map[uint64]bool, len(ids))
	for _, id := range ids {
		if id != 0 {
			seen[id] = true
		}
	}
	out := make([]uint64, 0, len(seen))
	for id := range seen {
		out = append(out, id)
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}

func nullableName(names map[uint64]string, id uint64) *string {
	name, exists := names[id]
	if !exists {
		return nil
	}
	return &name
}

func displayUserName(name, username string) string {
	if strings.TrimSpace(name) == "" {
		return username
	}
	return name
}

// loadAdminDisplayNames 仅批量查询本页关联和必要祖先，遵循软删除；任何查询失败均向上返回。
func loadAdminDisplayNames(db *gorm.DB, userIDs, orgIDs, roleIDs []uint64) (*adminDisplayNames, error) {
	names := &adminDisplayNames{users: map[uint64]string{}, orgs: map[uint64]model.SysOrg{}, roles: map[uint64]string{}}
	if ids := uniqueNonzeroIDs(userIDs); len(ids) > 0 {
		var users []model.SysUser
		if err := db.Select("id", "name", "username").Where("id IN ?", ids).Find(&users).Error; err != nil {
			return nil, err
		}
		for _, user := range users {
			names.users[user.ID] = displayUserName(user.Name, user.Username)
		}
	}
	// 按层获取祖先；去重也阻止坏数据的父子环导致无限查询。
	requested := map[uint64]bool{}
	for pending := uniqueNonzeroIDs(orgIDs); len(pending) > 0; {
		for _, id := range pending {
			requested[id] = true
		}
		var orgs []model.SysOrg
		if err := db.Select("id", "name", "parent_id").Where("id IN ?", pending).Find(&orgs).Error; err != nil {
			return nil, err
		}
		next := []uint64{}
		for _, org := range orgs {
			names.orgs[org.ID] = org
			if org.ParentID != 0 && !requested[org.ParentID] {
				next = append(next, org.ParentID)
			}
		}
		pending = uniqueNonzeroIDs(next)
	}
	if ids := uniqueNonzeroIDs(roleIDs); len(ids) > 0 {
		var roles []model.SysRole
		if err := db.Select("id", "name").Where("id IN ?", ids).Find(&roles).Error; err != nil {
			return nil, err
		}
		for _, role := range roles {
			names.roles[role.ID] = role.Name
		}
	}
	return names, nil
}

func (n *adminDisplayNames) orgDisplay(id uint64) (*string, *string) {
	org, exists := n.orgs[id]
	if !exists {
		return nil, nil
	}
	parts := []string{}
	seen := map[uint64]bool{}
	for current := id; current != 0 && !seen[current]; {
		seen[current] = true
		node, ok := n.orgs[current]
		if !ok {
			break
		}
		parts = append(parts, node.Name)
		current = node.ParentID
	}
	for i, j := 0, len(parts)-1; i < j; i, j = i+1, j-1 {
		parts[i], parts[j] = parts[j], parts[i]
	}
	path := strings.Join(parts, " / ")
	return &org.Name, &path
}

func enrichAdminIssues(db *gorm.DB, list []IssueVO) ([]AdminIssueVO, error) {
	userIDs, orgIDs := []uint64{}, []uint64{}
	for _, issue := range list {
		userIDs = append(userIDs, issue.ReportUserID, issue.AssigneeUser)
		orgIDs = append(orgIDs, issue.OrgID)
	}
	names, err := loadAdminDisplayNames(db, userIDs, orgIDs, nil)
	if err != nil {
		return nil, err
	}
	out := make([]AdminIssueVO, 0, len(list))
	for _, issue := range list {
		orgName, orgPath := names.orgDisplay(issue.OrgID)
		out = append(out, AdminIssueVO{IssueVO: issue, ReportUserName: nullableName(names.users, issue.ReportUserID),
			AssigneeUserName: nullableName(names.users, issue.AssigneeUser), OrgName: orgName, OrgPath: orgPath})
	}
	return out, nil
}

// ListAdmin 按管理端筛选分页后批量补全名称，不扩大小程序读取契约。
func (s *IssueService) ListAdmin(ctx context.Context, q IssueQuery) ([]AdminIssueVO, int64, error) {
	list, total, err := s.List(ctx, q)
	if err != nil {
		return nil, 0, err
	}
	out, err := enrichAdminIssues(s.db(ctx), list)
	return out, total, err
}

// GetAdmin 管理端详情读取；写入及小程序仍使用原基础 Get。
func (s *IssueService) GetAdmin(ctx context.Context, id uint64) (*AdminIssueVO, error) {
	item, err := s.Get(id)
	if err != nil {
		return nil, err
	}
	out, err := enrichAdminIssues(s.db(ctx), []IssueVO{*item})
	if err != nil {
		return nil, err
	}
	return &out[0], nil
}

// ListAdminUsers 批量补全本页工作人员的组织与角色名称，不要求调用组织/角色管理列表。
func (s *SysService) ListAdminUsers(ctx context.Context, orgID uint64, keyword string, page, size int) ([]AdminUserVO, int64, error) {
	list, total, err := s.ListUsers(orgID, keyword, page, size)
	if err != nil {
		return nil, 0, err
	}
	orgIDs, roleIDs := []uint64{}, []uint64{}
	for _, user := range list {
		orgIDs = append(orgIDs, user.OrgID)
		roleIDs = append(roleIDs, user.RoleID)
	}
	names, err := loadAdminDisplayNames(s.db(ctx), nil, orgIDs, roleIDs)
	if err != nil {
		return nil, 0, err
	}
	out := make([]AdminUserVO, 0, len(list))
	for _, user := range list {
		orgName, orgPath := names.orgDisplay(user.OrgID)
		out = append(out, AdminUserVO{SysUser: user, OrgName: orgName, OrgPath: orgPath, RoleName: nullableName(names.roles, user.RoleID)})
	}
	return out, total, nil
}
