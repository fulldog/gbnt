package service

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"gbnt/backend/internal/model"
	"gbnt/backend/internal/perm"
)

// SysService 系统配置：组织/用户/角色。

type SysService struct {
	DB *gorm.DB

	Perm *perm.Service
}

func (s *SysService) db(ctx context.Context) *gorm.DB {

	if ctx == nil {

		return s.DB

	}

	return s.DB.WithContext(ctx)

}

func (s *SysService) ListOrgs() ([]model.SysOrg, error) {

	var list []model.SysOrg

	err := s.DB.Order("sort ASC, id ASC").Find(&list).Error

	return list, err

}

// OrgTreeNode 组织树节点。
type OrgTreeNode struct {
	ID       uint64        `json:"id"`        // 组织主键
	Name     string        `json:"name"`      // 组织名称
	Type     model.OrgType `json:"type"`      // root/district/street/village
	ParentID uint64        `json:"parent_id"` // 上级组织 ID，根为 0
	Sort     int           `json:"sort"`      // 排序号
	Children []OrgTreeNode `json:"children"`  // 子组织
}

// UserInput 创建/更新用户入参。
type UserInput struct {
	Username string `json:"username"` // 登录账号（新建必填）
	Password string `json:"password"` // 明文密码（新建空则=账户名；更新时空则不改）
	Name     string `json:"name"`     // 姓名
	Phone    string `json:"phone"`    // 手机号
	OrgID    uint64 `json:"org_id"`   // 所属组织 ID
	RoleID   uint64 `json:"role_id"`  // 角色 ID
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

// RoleInput 创建/更新角色入参。
type RoleInput struct {
	Name   string `json:"name"`   // 角色名称
	Desc   string `json:"desc"`   // 角色说明
	Status int    `json:"status"` // 1 启用 / 0 禁用；新建为 0 时默认 1
}

func (in RoleInput) ToModel(id uint64) *model.SysRole {
	return &model.SysRole{Name: in.Name, Desc: in.Desc, Status: in.Status, Base: model.Base{ID: id}}
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
		// 允许新增根节点
		parentID = 0
		childType = model.OrgTypeRoot
	} else {
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
	return o, nil
}

func (s *SysService) UpdateOrg(ctx context.Context, id uint64, in OrgUpdateInput) (*model.SysOrg, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return nil, errors.New("组织名称必填")
	}
	var o model.SysOrg
	if err := s.db(ctx).First(&o, id).Error; err != nil {
		return nil, err
	}
	if err := s.db(ctx).Model(&o).Update("name", name).Error; err != nil {
		return nil, err
	}
	o.Name = name
	return &o, nil
}

func (s *SysService) DeleteOrg(ctx context.Context, id uint64) error {
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
	return s.db(ctx).Delete(&model.SysOrg{}, id).Error
}

func (s *SysService) ListUsers(orgID uint64, keyword string, page, size int) ([]model.SysUser, int64, error) {
	if page <= 0 {
		page = 1
	}
	if size <= 0 {
		size = 20
	}
	q := s.userListQuery(orgID, keyword)
	var total int64
	_ = q.Count(&total).Error
	var list []model.SysUser
	err := q.Order("id DESC").Offset((page - 1) * size).Limit(size).Find(&list).Error
	return list, total, err
}

// ListUsersByOrgID 按行政区划 org_id 返回用户列表（不分页）。
func (s *SysService) ListUsersByOrgID(orgID uint64) ([]model.SysUser, error) {
	if orgID == 0 {
		return nil, errors.New("org_id 必填")
	}
	var list []model.SysUser
	err := s.DB.Model(&model.SysUser{}).Where("org_id = ?", orgID).Order("id DESC").Find(&list).Error
	return list, err
}

func (s *SysService) CreateUser(ctx context.Context, in UserInput) (*model.SysUser, error) {
	if in.Username == "" {
		return nil, errors.New("username 必填")
	}
	pwd := strings.TrimSpace(in.Password)
	if pwd == "" {
		pwd = in.Username // 初始化密码=账户名
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
	updates := map[string]interface{}{
		"name": in.Name, "phone": in.Phone, "org_id": in.OrgID, "role_id": in.RoleID,
	}
	if in.Status != nil {
		updates["status"] = *in.Status
	}
	if in.Password != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
		if err != nil {
			return nil, err
		}
		updates["password"] = string(hash)
		updates["token_ver"] = gorm.Expr("token_ver + 1")
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
	return s.db(ctx).Delete(&model.SysUser{}, id).Error
}

// ResetPassword 将密码重置为账户名（username），并递增 token_ver。
func (s *SysService) ResetPassword(ctx context.Context, id uint64) error {
	var u model.SysUser
	if err := s.db(ctx).First(&u, id).Error; err != nil {
		return errors.New("用户不存在")
	}
	if u.Username == "" {
		return errors.New("账户名为空，无法重置")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(u.Username), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	return s.db(ctx).Model(&u).Updates(map[string]interface{}{
		"password":  string(hash),
		"token_ver": gorm.Expr("token_ver + 1"),
	}).Error
}

func (s *SysService) ListRoles() ([]model.SysRole, error) {

	var list []model.SysRole

	err := s.DB.Order("id ASC").Find(&list).Error

	return list, err

}

func (s *SysService) CreateRole(ctx context.Context, r *model.SysRole) error {

	if r.Status == 0 {

		r.Status = 1

	}

	return s.db(ctx).Create(r).Error

}

func (s *SysService) UpdateRole(ctx context.Context, r *model.SysRole) error {

	if r.ID == perm.SuperAdminRoleID {

		return errors.New("管理员角色不可编辑")

	}

	updates := map[string]interface{}{

		"name": r.Name, "desc": r.Desc, "status": r.Status,
	}

	return s.db(ctx).Model(&model.SysRole{}).Where("id = ?", r.ID).Updates(updates).Error

}

func (s *SysService) DeleteRole(ctx context.Context, id uint64) error {

	if id == perm.SuperAdminRoleID {

		return errors.New("管理员角色不可删除")

	}

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

	if roleID == perm.SuperAdminRoleID {

		return nil, nil

	}

	var ids []uint64

	err := s.DB.Model(&model.SysRoleAPI{}).Where("role_id = ?", roleID).Pluck("api_id", &ids).Error

	return ids, err

}

// SetRoleAPIs 覆盖设置角色 API 权限。

func (s *SysService) SetRoleAPIs(ctx context.Context, roleID uint64, apiIDs []uint64) error {

	if roleID == perm.SuperAdminRoleID {

		return errors.New("管理员角色不可编辑")

	}

	return s.db(ctx).Transaction(func(tx *gorm.DB) error {

		if err := tx.Unscoped().Where("role_id = ?", roleID).Delete(&model.SysRoleAPI{}).Error; err != nil {

			return err

		}

		for _, aid := range apiIDs {

			row := model.SysRoleAPI{RoleID: roleID, APIID: aid}

			if err := tx.Create(&row).Error; err != nil {

				return err

			}

		}

		return nil

	})

}

func (s *SysService) InvalidateRoleCache(roleID uint64) {

	if s.Perm != nil {

		s.Perm.InvalidateRole(roleID)

	}

}
