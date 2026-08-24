package service

import (
	"context"

	"errors"

	"strings"

	"golang.org/x/crypto/bcrypt"

	"gorm.io/gorm"

	"gbnt/backend/internal/model"

	"gbnt/backend/internal/perm"
)

// SysService 系统配置：组织/用户/角色/字典。

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
	ID       uint64        `json:"id"`
	Name     string        `json:"name"`
	ParentID uint64        `json:"parent_id"`
	Sort     int           `json:"sort"`
	Children []OrgTreeNode `json:"children"`
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
				ID: o.ID, Name: o.Name, ParentID: o.ParentID, Sort: o.Sort, Children: children,
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

func (s *SysService) CreateOrg(ctx context.Context, o *model.SysOrg) error {

	if strings.TrimSpace(o.Name) == "" {

		return errors.New("组织名称必填")

	}

	return s.db(ctx).Create(o).Error

}

func (s *SysService) UpdateOrg(ctx context.Context, o *model.SysOrg) error {

	return s.db(ctx).Model(&model.SysOrg{}).Where("id = ?", o.ID).Updates(map[string]interface{}{

		"name": o.Name, "sort": o.Sort, "parent_id": o.ParentID,
	}).Error

}

func (s *SysService) DeleteOrg(ctx context.Context, id uint64) error {

	var o model.SysOrg

	if err := s.db(ctx).First(&o, id).Error; err != nil {

		return err

	}

	if o.ParentID == 0 {

		return errors.New("根节点不可删除")

	}

	return s.db(ctx).Delete(&model.SysOrg{}, id).Error

}

// UserInput 创建/更新用户入参。

type UserInput struct {
	Username string `json:"username"`

	Password string `json:"password"`

	Name string `json:"name"`

	Phone string `json:"phone"`

	OrgID uint64 `json:"org_id"`

	RoleID uint64 `json:"role_id"`

	Status *int `json:"status"`
}

func (s *SysService) ListUsers(orgID uint64, keyword string, page, size int) ([]model.SysUser, int64, error) {

	q := s.DB.Model(&model.SysUser{})

	if orgID > 0 {

		q = q.Where("org_id = ?", orgID)

	}

	if keyword != "" {

		like := "%" + keyword + "%"

		q = q.Where("username LIKE ? OR name LIKE ? OR phone LIKE ?", like, like, like)

	}

	var total int64

	_ = q.Count(&total).Error

	var list []model.SysUser

	err := q.Order("id DESC").Offset((page - 1) * size).Limit(size).Find(&list).Error

	return list, total, err

}

func (s *SysService) CreateUser(ctx context.Context, in UserInput) (*model.SysUser, error) {

	if in.Username == "" || in.Password == "" {

		return nil, errors.New("username 与 password 必填")

	}

	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)

	if err != nil {

		return nil, err

	}

	u := &model.SysUser{

		Username: in.Username,

		Password: string(hash),

		Name: in.Name,

		Phone: in.Phone,

		OrgID: in.OrgID,

		RoleID: in.RoleID,

		Status: 1,
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

	}

	if err := s.db(ctx).Model(&u).Updates(updates).Error; err != nil {

		return nil, err

	}

	_ = s.db(ctx).First(&u, id)

	return &u, nil

}

func (s *SysService) DeleteUser(ctx context.Context, id uint64) error {

	return s.db(ctx).Delete(&model.SysUser{}, id).Error

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

func (s *SysService) ListDictTypes() ([]model.SysDictType, error) {

	var list []model.SysDictType

	err := s.DB.Order("sort ASC").Find(&list).Error

	return list, err

}

func (s *SysService) ListDictFields(typeCode string) ([]model.SysDictField, error) {

	q := s.DB.Model(&model.SysDictField{})

	if typeCode != "" {

		q = q.Where("type_code = ?", typeCode)

	}

	var list []model.SysDictField

	err := q.Order("sort ASC").Find(&list).Error

	return list, err

}

func (s *SysService) ListDictItems(fieldID uint64) ([]model.SysDictItem, error) {

	q := s.DB.Model(&model.SysDictItem{})

	if fieldID > 0 {

		q = q.Where("field_id = ?", fieldID)

	}

	var list []model.SysDictItem

	err := q.Order("sort ASC").Find(&list).Error

	return list, err

}

func (s *SysService) CreateDictItem(ctx context.Context, item *model.SysDictItem) error {

	return s.db(ctx).Create(item).Error

}

func (s *SysService) UpdateDictItem(ctx context.Context, item *model.SysDictItem) error {

	return s.db(ctx).Model(&model.SysDictItem{}).Where("id = ?", item.ID).Updates(map[string]interface{}{

		"label": item.Label, "value": item.Value, "sort": item.Sort,
	}).Error

}

func (s *SysService) DeleteDictItem(ctx context.Context, id uint64) error {

	return s.db(ctx).Delete(&model.SysDictItem{}, id).Error

}
