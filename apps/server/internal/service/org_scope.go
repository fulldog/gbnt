package service

import (
	"context"
	"errors"

	"gorm.io/gorm"

	"gbnt/apps/server/internal/database"
	"gbnt/apps/server/internal/model"
)

// ErrOrgScopeForbidden 表示目标组织不在当前登录用户所属组织及其下级范围内。
var ErrOrgScopeForbidden = errors.New("超出当前账号的组织管理范围")

// ErrRoleAssignmentForbidden 表示目标人员角色超出当前账号可分配的权限集合。
var ErrRoleAssignmentForbidden = errors.New("超出当前账号的角色分配范围")

// OrgScope 是一次请求内解析出的组织范围。普通账号只能操作 RootID 及其全部下级；超级管理员不受限制。
type OrgScope struct {
	RootID  uint64
	All     bool
	allowed map[uint64]struct{}
}

// ResolveOrgScope 根据请求上下文中的当前用户解析组织子树。普通账号 org_id=0 时返回空范围，不解释为全局权限。
func ResolveOrgScope(ctx context.Context, db *gorm.DB) (*OrgScope, error) {
	user, err := database.UserFromContext(ctx)
	if err != nil {
		return nil, err
	}
	scope := &OrgScope{RootID: user.OrgID, All: user.IsSuperAdmin, allowed: map[uint64]struct{}{}}
	if scope.All || user.OrgID == 0 {
		return scope, nil
	}
	var orgs []model.SysOrg
	if err := db.WithContext(ctx).Select("id", "parent_id").Find(&orgs).Error; err != nil {
		return nil, err
	}
	for _, id := range orgSubtreeIDs(orgs, user.OrgID) {
		scope.allowed[id] = struct{}{}
	}
	// 已删除或失效的所属组织不能凭空形成只包含 root_id 的可写范围。
	found := false
	for _, org := range orgs {
		if org.ID == user.OrgID {
			found = true
			break
		}
	}
	if !found {
		scope.allowed = map[uint64]struct{}{}
	}
	return scope, nil
}

// Allows 判断目标组织是否在范围内。0 永远不是可操作组织。
func (s *OrgScope) Allows(orgID uint64) bool {
	if s == nil || orgID == 0 {
		return false
	}
	if s.All {
		return true
	}
	_, ok := s.allowed[orgID]
	return ok
}

// Require 要求目标组织在范围内。
func (s *OrgScope) Require(orgID uint64) error {
	if !s.Allows(orgID) {
		return ErrOrgScopeForbidden
	}
	return nil
}

// displayOrgScope 用于已由 JWT/RBAC 保护的读取接口生成界面提示。内部无登录上下文的旧测试按空范围处理。
func displayOrgScope(ctx context.Context, db *gorm.DB) (*OrgScope, error) {
	scope, err := ResolveOrgScope(ctx, db)
	if errors.Is(err, database.ErrUnauth) {
		return &OrgScope{allowed: map[uint64]struct{}{}}, nil
	}
	return scope, err
}

// requireOrgScopeIfAuthenticated 为正式 HTTP 写入口补充组织校验，同时保留无用户上下文的内部维护调用兼容性。
// 所有正式写路由均已由 JWT 中间件保护，因此 HTTP 请求不会走无上下文分支。
func requireOrgScopeIfAuthenticated(ctx context.Context, db *gorm.DB, orgIDs ...uint64) error {
	scope, err := ResolveOrgScope(ctx, db)
	if errors.Is(err, database.ErrUnauth) {
		return nil
	}
	if err != nil {
		return err
	}
	for _, orgID := range orgIDs {
		if err := scope.Require(orgID); err != nil {
			return err
		}
	}
	return nil
}

// requireUserOrgScopeIfAuthenticated 要求被选择的人员也属于当前账号组织范围；0 表示未关联人员并跳过。
func requireUserOrgScopeIfAuthenticated(ctx context.Context, db *gorm.DB, userID uint64) error {
	if userID == 0 {
		return nil
	}
	scope, err := ResolveOrgScope(ctx, db)
	if errors.Is(err, database.ErrUnauth) {
		return nil
	}
	if err != nil {
		return err
	}
	// 超级管理员已拥有全局范围，无需为范围判断额外查询目标人员；
	// 人员是否存在、是否满足业务组织关系仍由原有业务校验负责。
	if scope.All {
		return nil
	}
	var user model.SysUser
	if err := db.WithContext(ctx).Select("id", "org_id").First(&user, userID).Error; err != nil {
		return err
	}
	return scope.Require(user.OrgID)
}

// requireAssignableRoleIfAuthenticated 阻止普通工作人员管理员创建或修改出权限高于自身的账号。
func (s *SysService) requireAssignableRoleIfAuthenticated(ctx context.Context, roleID uint64) error {
	user, err := database.UserFromContext(ctx)
	if errors.Is(err, database.ErrUnauth) {
		return nil
	}
	if err != nil {
		return err
	}
	if roleID == 0 {
		return ErrRoleAssignmentForbidden
	}
	var role model.SysRole
	if err := s.db(ctx).Select("id").First(&role, roleID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrRoleAssignmentForbidden
		}
		return err
	}
	if s.Perm == nil {
		return ErrRoleAssignmentForbidden
	}
	allowed, err := s.Perm.CanAssignRole(user.RoleID, user.IsSuperAdmin, roleID)
	if err != nil {
		return err
	}
	if !allowed {
		return ErrRoleAssignmentForbidden
	}
	return nil
}

func (s *SysService) roleWithinAssignmentScope(ctx context.Context, roleID uint64) (bool, error) {
	user, err := database.UserFromContext(ctx)
	if errors.Is(err, database.ErrUnauth) {
		return true, nil
	}
	if err != nil {
		return false, err
	}
	if roleID == 0 || s.Perm == nil {
		return false, nil
	}
	return s.Perm.CanAssignRole(user.RoleID, user.IsSuperAdmin, roleID)
}

// scopeOrgTree 仅保留权限根节点的祖先路径、权限根节点及其下级，供小程序选择器使用。
func scopeOrgTree(nodes []OrgTreeNode, scope *OrgScope) []OrgTreeNode {
	out := make([]OrgTreeNode, 0, len(nodes))
	for _, source := range nodes {
		node := source
		node.WithinOrgScope = scope.Allows(node.ID)
		children := scopeOrgTree(node.Children, scope)
		if node.WithinOrgScope || len(children) > 0 {
			node.Children = children
			out = append(out, node)
		}
	}
	return out
}
