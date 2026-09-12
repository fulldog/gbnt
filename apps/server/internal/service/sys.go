package service

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"gbnt/apps/server/internal/cachex"
	"gbnt/apps/server/internal/database"
	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/perm"
)

const cacheKeySysOrgs = "sys_orgs:list"

// SysService 系统配置：组织/用户/角色。

type SysService struct {
	DB *gorm.DB

	Perm *perm.Service
	// Cache 进程内缓存；组织列表键 sys_orgs:list，后台改树后删除。
	Cache *cachex.Store
}

// ErrOrgNotFound 指定组织不存在或已删除。
var ErrOrgNotFound = errors.New("组织不存在")

func (s *SysService) db(ctx context.Context) *gorm.DB {

	if ctx == nil {

		return s.DB

	}

	return s.DB.WithContext(ctx)

}

// ListOrgs 返回扁平组织列表；命中进程内缓存则不查库，后台改树后失效。
func (s *SysService) ListOrgs() ([]model.SysOrg, error) {
	if v, ok := s.Cache.Get(cacheKeySysOrgs); ok {
		if list, ok := v.([]model.SysOrg); ok {
			return cloneSysOrgs(list), nil
		}
	}
	var list []model.SysOrg
	if err := s.DB.Order("sort ASC, id ASC").Find(&list).Error; err != nil {
		return nil, err
	}
	s.storeOrgList(list)
	return cloneSysOrgs(list), nil
}

func (s *SysService) storeOrgList(list []model.SysOrg) {
	s.Cache.Set(cacheKeySysOrgs, cloneSysOrgs(list), cachex.NoExpiration)
}

func (s *SysService) invalidateOrgListCache() {
	s.Cache.Delete(cacheKeySysOrgs)
}

func cloneSysOrgs(list []model.SysOrg) []model.SysOrg {
	out := make([]model.SysOrg, len(list))
	copy(out, list)
	return out
}

// OrgTreeNode 组织树节点。
type OrgTreeNode struct {
	ID             uint64        `json:"id"`               // 组织主键
	Name           string        `json:"name"`             // 组织名称
	Type           model.OrgType `json:"type"`             // root/district/street/village
	ParentID       uint64        `json:"parent_id"`        // 上级组织 ID，根为 0
	Sort           int           `json:"sort"`             // 排序号
	WithinOrgScope bool          `json:"within_org_scope"` // 是否属于当前账号组织及下级；小程序返回的祖先路径节点可为 false
	Children       []OrgTreeNode `json:"children"`         // 子组织
}

// AdminOrgVO 管理端组织列表项；完整树继续可见，写操作范围由 WithinOrgScope 提示。
type AdminOrgVO struct {
	model.SysOrg
	WithinOrgScope bool `json:"within_org_scope"` // 是否可操作该组织
}

// UserInput 创建/更新用户入参。
type UserInput struct {
	Username string `json:"username"` // 登录账号（新建必填）
	Password string `json:"password"` // 明文密码（新建空则=账户名且不套复杂度；有值则须 6～14 位字母+数字）
	Name     string `json:"name"`     // 姓名
	Phone    string `json:"phone"`    // 手机号（选填；有值须为中国大陆 11 位）
	OrgID    uint64 `json:"org_id"`   // 所属组织 ID
	RoleID   uint64 `json:"role_id"`  // 角色 ID
	Sort     *int32 `json:"sort"`     // 排序整数，越小越靠前；空则新建默认 100、编辑保留原值，支持 0
	Status   *int   `json:"status"`   // 1 启用 / 0 禁用；空则新建默认 1
}

// OrgCreateInput 新增组织。
// parent_id=0 创建根节点；否则挂在上级之下，类型由上级逐级推导。
type OrgCreateInput struct {
	Name     string `json:"name"`      // 组织名称（必填）
	ParentID uint64 `json:"parent_id"` // 上级组织 ID；0 表示新增根节点
	Sort     int    `json:"sort"`      // 排序号，越小越靠前；0 表示追加到末尾
}

// OrgUpdateInput 编辑组织：仅允许改名称。
type OrgUpdateInput struct {
	Name string `json:"name"` // 组织名称（必填）
}

// RoleAPIsInput 覆盖角色 API 授权。
type RoleAPIsInput struct {
	APIIDs []uint64 `json:"api_ids" binding:"required"` // 授权的 API 主键列表
}

// ListOrgTree 返回完整组织树（根节点 parent_id=0）。
func (s *SysService) ListOrgTree() ([]OrgTreeNode, error) {
	list, err := s.ListOrgs()
	if err != nil {
		return nil, err
	}
	return BuildOrgTree(list), nil
}

// ListAdminOrgs 返回当前账号可见组织列表并标注可操作范围；账号 org_id=0 时全部可见。
func (s *SysService) ListAdminOrgs(ctx context.Context) ([]AdminOrgVO, error) {
	list, err := s.ListOrgs()
	if err != nil {
		return nil, err
	}
	visibleScope, err := resolveVisibleOrgScope(ctx, s.db(ctx))
	if err != nil {
		return nil, err
	}
	scope, err := displayOrgScope(ctx, s.db(ctx))
	if err != nil {
		return nil, err
	}
	out := make([]AdminOrgVO, 0, len(list))
	for _, org := range list {
		if !visibleScope.Allows(org.ID) {
			continue
		}
		out = append(out, AdminOrgVO{SysOrg: org, WithinOrgScope: scope.Allows(org.ID)})
	}
	return out, nil
}

// ListScopedOrgTree 返回当前账号权限根节点的祖先路径及完整下级，供小程序上报和筛选使用。
func (s *SysService) ListScopedOrgTree(ctx context.Context) ([]OrgTreeNode, error) {
	tree, err := s.ListOrgTree()
	if err != nil {
		return nil, err
	}
	scope, err := ResolveOrgScope(ctx, s.db(ctx))
	if err != nil {
		return nil, err
	}
	if !scope.All && !scope.Allows(scope.RootID) {
		return nil, ErrOrgScopeForbidden
	}
	return scopeOrgTree(tree, scope), nil
}

// BuildOrgTree 将扁平组织列表组装为树。
func BuildOrgTree(list []model.SysOrg) []OrgTreeNode {
	byParent := make(map[uint64][]model.SysOrg)
	for _, o := range list {
		byParent[o.ParentID] = append(byParent[o.ParentID], o)
	}
	var build func(parentID uint64) []OrgTreeNode
	build = func(parentID uint64) []OrgTreeNode {
		nodes := byParent[parentID]
		out := make([]OrgTreeNode, 0, len(nodes))
		for _, o := range nodes {
			children := build(o.ID)
			if children == nil {
				children = []OrgTreeNode{}
			}
			out = append(out, OrgTreeNode{
				ID: o.ID, Name: o.Name, Type: o.Type, ParentID: o.ParentID, Sort: o.Sort, Children: children,
			})
		}
		return out
	}
	tree := build(0)
	if tree == nil {
		return []OrgTreeNode{}
	}
	return tree
}

// ListOrgSubtree 校验组织存在后返回完整组织树（含该节点的全部上级与下级，以及树中其它节点）。
func (s *SysService) ListOrgSubtree(orgID uint64) ([]OrgTreeNode, error) {
	if orgID == 0 {
		return nil, ErrOrgNotFound
	}
	tree, err := s.ListOrgTree()
	if err != nil {
		return nil, err
	}
	if FindOrgSubtree(tree, orgID) == nil {
		return nil, ErrOrgNotFound
	}
	return tree, nil
}

// FindOrgSubtree 在组织树中定位 id 对应节点（含其 children）；未找到返回 nil。
func FindOrgSubtree(tree []OrgTreeNode, id uint64) *OrgTreeNode {
	for i := range tree {
		if tree[i].ID == id {
			n := tree[i]
			return &n
		}
		if found := FindOrgSubtree(tree[i].Children, id); found != nil {
			return found
		}
	}
	return nil
}

func (s *SysService) CreateOrg(ctx context.Context, in OrgCreateInput) (*model.SysOrg, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return nil, errors.New("组织名称必填")
	}

	var (
		parentID  uint64
		childType model.OrgType
	)
	if in.ParentID == 0 {
		scope, err := ResolveOrgScope(ctx, s.db(ctx))
		if err != nil && !errors.Is(err, database.ErrUnauth) {
			return nil, err
		}
		if err == nil && !scope.All {
			return nil, ErrOrgScopeForbidden
		}
		// 允许新增根节点
		parentID = 0
		childType = model.OrgTypeRoot
	} else {
		if err := requireOrgScopeIfAuthenticated(ctx, s.db(ctx), in.ParentID); err != nil {
			return nil, err
		}
		// 非根：只能挂在已有上级下，按 root→district→street→village 逐级推导
		var parent model.SysOrg
		if err := s.db(ctx).First(&parent, in.ParentID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, errors.New("上级组织不存在")
			}
			return nil, err
		}
		next, ok := model.ChildOrgType(parent.Type)
		if !ok {
			return nil, errors.New("村为末级节点，不能再向下新增")
		}
		parentID = in.ParentID
		childType = next
	}

	sort := in.Sort
	if sort == 0 {
		var maxSort sql.NullInt64
		_ = s.db(ctx).Model(&model.SysOrg{}).Where("parent_id = ?", parentID).
			Select("MAX(sort)").Scan(&maxSort)
		if maxSort.Valid {
			sort = int(maxSort.Int64) + 1
		} else {
			sort = 1
		}
	}
	o := &model.SysOrg{
		ParentID: parentID,
		Name:     name,
		Type:     childType,
		Sort:     sort,
	}
	if err := s.db(ctx).Create(o).Error; err != nil {
		return nil, err
	}
	s.invalidateOrgListCache()
	return o, nil
}

func (s *SysService) UpdateOrg(ctx context.Context, id uint64, in OrgUpdateInput) (*model.SysOrg, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return nil, errors.New("组织名称必填")
	}
	if err := requireOrgScopeIfAuthenticated(ctx, s.db(ctx), id); err != nil {
		return nil, err
	}
	var o model.SysOrg
	if err := s.db(ctx).First(&o, id).Error; err != nil {
		return nil, err
	}
	if err := s.db(ctx).Model(&o).Update("name", name).Error; err != nil {
		return nil, err
	}
	o.Name = name
	s.invalidateOrgListCache()
	return &o, nil
}

func (s *SysService) DeleteOrg(ctx context.Context, id uint64) error {
	scope, err := ResolveOrgScope(ctx, s.db(ctx))
	if err != nil && !errors.Is(err, database.ErrUnauth) {
		return err
	}
	if err == nil {
		if err := scope.Require(id); err != nil {
			return err
		}
		if !scope.All && scope.RootID == id {
			return errors.New("不能删除当前账号所属组织")
		}
	}
	var o model.SysOrg
	if err := s.db(ctx).First(&o, id).Error; err != nil {
		return err
	}
	if o.Type == model.OrgTypeRoot || o.ParentID == 0 {
		return errors.New("根节点不可删除")
	}
	var childCount int64
	if err := s.db(ctx).Model(&model.SysOrg{}).Where("parent_id = ?", id).Count(&childCount).Error; err != nil {
		return err
	}
	if childCount > 0 {
		return errors.New("请先删除下级组织")
	}
	var userCount int64
	if err := s.db(ctx).Model(&model.SysUser{}).Where("org_id = ?", id).Count(&userCount).Error; err != nil {
		return err
	}
	if userCount > 0 {
		return errors.New("该组织仍有关联工作人员，无法删除")
	}
	var issueCount int64
	if err := s.db(ctx).Model(&model.Issue{}).Where("org_id = ?", id).Count(&issueCount).Error; err != nil {
		return err
	}
	if issueCount > 0 {
		return errors.New("该组织仍有关联整改记录，无法删除")
	}
	if err := s.db(ctx).Delete(&model.SysOrg{}, id).Error; err != nil {
		return err
	}
	s.invalidateOrgListCache()
	return nil
}

// ListUsers 查询工作人员基础分页；排序在分页前执行，计数失败立即返回。
func (s *SysService) ListUsers(orgID uint64, keyword string, page, size int) ([]model.SysUser, int64, error) {
	page, size = NormalizePagination(page, size, 0)
	q := s.userListQuery(orgID, keyword)
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	list := make([]model.SysUser, 0)
	err := q.Order(userListOrder).Offset((page - 1) * size).Limit(size).Find(&list).Error
	return list, total, err
}

// ListVisibleUsers 查询当前登录用户可见组织范围内的工作人员；显式组织筛选包含其下级。
func (s *SysService) ListVisibleUsers(ctx context.Context, orgID uint64, keyword string, page, size int) ([]model.SysUser, int64, error) {
	page, size = NormalizePagination(page, size, 0)
	q, err := s.visibleUserListQuery(ctx, orgID, keyword)
	if err != nil {
		return nil, 0, err
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	list := make([]model.SysUser, 0)
	err = q.Order(userListOrder).Offset((page - 1) * size).Limit(size).Find(&list).Error
	return list, total, err
}

// ListUsersByOrgID 按行政区划 org_id 返回用户列表（不分页）。
func (s *SysService) ListUsersByOrgID(orgID uint64) ([]model.SysUser, error) {
	if orgID == 0 {
		return nil, errors.New("org_id 必填")
	}
	var list []model.SysUser
	err := s.DB.Model(&model.SysUser{}).Where("org_id = ?", orgID).Order(userListOrder).Find(&list).Error
	return list, err
}

// ListVisibleUsersByOrgID 返回当前账号可见范围与指定组织子树交集内的工作人员。
func (s *SysService) ListVisibleUsersByOrgID(ctx context.Context, orgID uint64) ([]model.SysUser, error) {
	if orgID == 0 {
		return nil, errors.New("org_id 必填")
	}
	q, err := s.visibleUserListQuery(ctx, orgID, "")
	if err != nil {
		return nil, err
	}
	var list []model.SysUser
	err = q.Order(userListOrder).Find(&list).Error
	return list, err
}

func (s *SysService) CreateUser(ctx context.Context, in UserInput) (*model.SysUser, error) {
	if err := requireOrgScopeIfAuthenticated(ctx, s.db(ctx), in.OrgID); err != nil {
		return nil, err
	}
	if err := s.requireAssignableRoleIfAuthenticated(ctx, in.RoleID); err != nil {
		return nil, err
	}
	if in.Username == "" {
		return nil, errors.New("username 必填")
	}
	if err := ValidateOptionalCNPhone(in.Phone); err != nil {
		return nil, err
	}
	pwd := strings.TrimSpace(in.Password)
	if pwd == "" {
		pwd = in.Username // 初始化密码=账户名
	} else if err := ValidateSetPassword(pwd); err != nil {
		return nil, err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(pwd), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	u := &model.SysUser{
		Username:     in.Username,
		Password:     string(hash),
		Name:         in.Name,
		Phone:        in.Phone,
		OrgID:        in.OrgID,
		RoleID:       in.RoleID,
		Sort:         in.Sort,
		Status:       1,
		IsSuperAdmin: false, // 超管仅允许一名，由种子初始化
	}
	if in.Status != nil {
		u.Status = *in.Status
	}
	if err := s.db(ctx).Create(u).Error; err != nil {
		return nil, err
	}
	return u, nil
}

func (s *SysService) UpdateUser(ctx context.Context, id uint64, in UserInput) (*model.SysUser, error) {
	var u model.SysUser
	if err := s.db(ctx).First(&u, id).Error; err != nil {
		return nil, err
	}
	if u.IsSuperAdmin {
		return nil, errors.New("超级管理员不可编辑")
	}
	if err := requireOrgScopeIfAuthenticated(ctx, s.db(ctx), u.OrgID, in.OrgID); err != nil {
		return nil, err
	}
	if err := s.requireAssignableRoleIfAuthenticated(ctx, u.RoleID); err != nil {
		return nil, err
	}
	if err := s.requireAssignableRoleIfAuthenticated(ctx, in.RoleID); err != nil {
		return nil, err
	}
	if err := ValidateOptionalCNPhone(in.Phone); err != nil {
		return nil, err
	}
	updates := map[string]interface{}{
		"name": in.Name, "phone": in.Phone, "org_id": in.OrgID, "role_id": in.RoleID,
	}
	if in.Status != nil {
		updates["status"] = *in.Status
	}
	if in.Sort != nil {
		updates["sort"] = *in.Sort
	}
	if in.Password != "" {
		pwd := strings.TrimSpace(in.Password)
		if err := ValidateSetPassword(pwd); err != nil {
			return nil, err
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(pwd), bcrypt.DefaultCost)
		if err != nil {
			return nil, err
		}
		updates["password"] = string(hash)
		updates["token_ver"] = gorm.Expr("token_ver + 1")
		updates["app_token_ver"] = gorm.Expr("app_token_ver + 1")
	}
	if err := s.db(ctx).Model(&u).Updates(updates).Error; err != nil {
		return nil, err
	}
	_ = s.db(ctx).First(&u, id)
	return &u, nil
}

func (s *SysService) DeleteUser(ctx context.Context, id uint64) error {
	var u model.SysUser
	if err := s.db(ctx).First(&u, id).Error; err != nil {
		return err
	}
	if u.IsSuperAdmin {
		return errors.New("超级管理员不可删除")
	}
	if err := requireOrgScopeIfAuthenticated(ctx, s.db(ctx), u.OrgID); err != nil {
		return err
	}
	if err := s.requireAssignableRoleIfAuthenticated(ctx, u.RoleID); err != nil {
		return err
	}
	return s.db(ctx).Delete(&model.SysUser{}, id).Error
}

// ResetPassword 将密码重置为账户名（username），并同时作废管理后台与小程序会话。
func (s *SysService) ResetPassword(ctx context.Context, id uint64) error {
	var u model.SysUser
	if err := s.db(ctx).First(&u, id).Error; err != nil {
		return errors.New("用户不存在")
	}
	if u.Username == "" {
		return errors.New("账户名为空，无法重置")
	}
	if u.IsSuperAdmin {
		return errors.New("超级管理员密码不可由工作人员页面重置")
	}
	if err := requireOrgScopeIfAuthenticated(ctx, s.db(ctx), u.OrgID); err != nil {
		return err
	}
	if err := s.requireAssignableRoleIfAuthenticated(ctx, u.RoleID); err != nil {
		return err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(u.Username), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	return s.db(ctx).Model(&u).Updates(invalidateAllSessions(map[string]interface{}{
		"password": string(hash),
	})).Error
}

func (s *SysService) ListRoles() ([]model.SysRole, error) {

	var list []model.SysRole

	err := s.DB.Order("id ASC").Find(&list).Error

	return list, err

}

// ListAssignableRoles 返回工作人员管理页面可分配的角色，不要求开放角色权限管理模块。
func (s *SysService) ListAssignableRoles(ctx context.Context) ([]model.SysRole, error) {
	roles, err := s.ListRoles()
	if err != nil {
		return nil, err
	}
	out := make([]model.SysRole, 0, len(roles))
	for _, role := range roles {
		allowed, err := s.roleWithinAssignmentScope(ctx, role.ID)
		if err != nil {
			return nil, err
		}
		if allowed {
			out = append(out, role)
		}
	}
	return out, nil
}

func (s *SysService) DeleteRole(ctx context.Context, id uint64) error {

	var cnt int64

	if err := s.db(ctx).Model(&model.SysUser{}).Where("role_id = ?", id).Count(&cnt).Error; err != nil {

		return err

	}

	if cnt > 0 {

		return errors.New("仍有用户绑定该角色，无法删除")

	}

	return s.db(ctx).Delete(&model.SysRole{}, id).Error

}

// ListAPIs 返回 API 目录。

func (s *SysService) ListAPIs() ([]model.SysAPI, error) {

	if s.Perm != nil {

		return s.Perm.ListAllAPIs()

	}

	var list []model.SysAPI

	err := s.DB.Where("enabled = ?", true).Order("sort ASC, id ASC").Find(&list).Error

	return list, err

}

// GetRoleAPIs 返回角色已授权 API id 列表。

func (s *SysService) GetRoleAPIs(roleID uint64) ([]uint64, error) {

	var ids []uint64

	err := s.DB.Model(&model.SysRoleAPI{}).Where("role_id = ?", roleID).Pluck("api_id", &ids).Error

	return ids, err

}

// SetRoleAPIs 覆盖设置角色 API 权限。

func (s *SysService) SetRoleAPIs(ctx context.Context, roleID uint64, apiIDs []uint64) error {
	// 非空切片标记显式更新；空数组表示清空，不能被当作未传权限。
	if apiIDs == nil {
		apiIDs = []uint64{}
	}
	_, err := s.UpdateRole(ctx, roleID, UpdateRoleInput{APIIDs: apiIDs})
	return err
}

func (s *SysService) InvalidateRoleCache(roleID uint64) {

	if s.Perm != nil {

		s.Perm.InvalidateRole(roleID)

	}

}
