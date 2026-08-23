package service

import (
	"errors"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"gbnt/backend/internal/model"
)

// SysService 系统配置：组织/用户/角色/字典。
type SysService struct {
	DB *gorm.DB
}

func (s *SysService) ListOrgs() ([]model.SysOrg, error) {
	var list []model.SysOrg
	err := s.DB.Order("sort ASC, id ASC").Find(&list).Error
	return list, err
}

func (s *SysService) CreateOrg(o *model.SysOrg) error {
	if o.OrgKey == "" || o.Name == "" {
		return errors.New("org_key 与 name 必填")
	}
	return s.DB.Create(o).Error
}

func (s *SysService) UpdateOrg(o *model.SysOrg) error {
	return s.DB.Model(&model.SysOrg{}).Where("id = ?", o.ID).Updates(map[string]interface{}{
		"name": o.Name, "type": o.Type, "remark": o.Remark, "sort": o.Sort, "parent_id": o.ParentID,
	}).Error
}

func (s *SysService) DeleteOrg(id uint64) error {
	var o model.SysOrg
	if err := s.DB.First(&o, id).Error; err != nil {
		return err
	}
	if o.OrgKey == "org-gov" {
		return errors.New("根节点不可删除")
	}
	// 软删：is_delete=1
	return s.DB.Delete(&model.SysOrg{}, id).Error
}

// UserInput 创建/更新用户入参。
type UserInput struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Name     string `json:"name"`
	Phone    string `json:"phone"`
	OrgID    string `json:"org_id"`
	Role     string `json:"role"`
	Status   *int   `json:"status"`
}

func (s *SysService) ListUsers(orgID, keyword string, page, size int) ([]model.SysUser, int64, error) {
	q := s.DB.Model(&model.SysUser{})
	if orgID != "" {
		q = q.Where("org_key = ?", orgID)
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

func (s *SysService) CreateUser(in UserInput) (*model.SysUser, error) {
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
		Name:     in.Name,
		Phone:    in.Phone,
		OrgKey:   in.OrgID,
		Role:     in.Role,
		Status:   1,
	}
	if in.Status != nil {
		u.Status = *in.Status
	}
	if err := s.DB.Create(u).Error; err != nil {
		return nil, err
	}
	return u, nil
}

func (s *SysService) UpdateUser(id uint64, in UserInput) (*model.SysUser, error) {
	var u model.SysUser
	if err := s.DB.First(&u, id).Error; err != nil {
		return nil, err
	}
	updates := map[string]interface{}{
		"name": in.Name, "phone": in.Phone, "org_key": in.OrgID, "role": in.Role,
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
	if err := s.DB.Model(&u).Updates(updates).Error; err != nil {
		return nil, err
	}
	_ = s.DB.First(&u, id)
	return &u, nil
}

func (s *SysService) DeleteUser(id uint64) error {
	// 软删：is_delete=1
	return s.DB.Delete(&model.SysUser{}, id).Error
}

func (s *SysService) ListRoles() ([]model.SysRole, error) {
	var list []model.SysRole
	err := s.DB.Order("id ASC").Find(&list).Error
	return list, err
}

func (s *SysService) CreateRole(r *model.SysRole) error {
	return s.DB.Create(r).Error
}

func (s *SysService) UpdateRole(r *model.SysRole) error {
	return s.DB.Model(&model.SysRole{}).Where("id = ?", r.ID).Updates(map[string]interface{}{
		"name": r.Name, "desc": r.Desc,
	}).Error
}

func (s *SysService) DeleteRole(id uint64) error {
	// 软删：is_delete=1
	return s.DB.Delete(&model.SysRole{}, id).Error
}

func (s *SysService) GetRolePerms(code string) ([]model.SysRolePerm, error) {
	var list []model.SysRolePerm
	err := s.DB.Where("role_code = ?", code).Find(&list).Error
	return list, err
}

func (s *SysService) SetRolePerms(code string, perms []model.SysRolePerm) error {
	return s.DB.Transaction(func(tx *gorm.DB) error {
		// 软删原权限（is_delete=1），避免唯一索引冲突时再复活或新建
		if err := tx.Where("role_code = ?", code).Delete(&model.SysRolePerm{}).Error; err != nil {
			return err
		}
		for i := range perms {
			perms[i].RoleCode = code
			var old model.SysRolePerm
			err := tx.Unscoped().
				Where("role_code = ? AND path = ? AND action = ?", code, perms[i].Path, perms[i].Action).
				First(&old).Error
			if err == nil {
				// 复活软删记录
				if err := tx.Unscoped().Model(&old).Update("is_delete", 0).Error; err != nil {
					return err
				}
				continue
			}
			perms[i].ID = 0
			perms[i].IsDelete = 0
			if err := tx.Create(&perms[i]).Error; err != nil {
				return err
			}
		}
		return nil
	})
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

func (s *SysService) CreateDictItem(item *model.SysDictItem) error {
	return s.DB.Create(item).Error
}

func (s *SysService) UpdateDictItem(item *model.SysDictItem) error {
	return s.DB.Model(&model.SysDictItem{}).Where("id = ?", item.ID).Updates(map[string]interface{}{
		"label": item.Label, "value": item.Value, "sort": item.Sort,
	}).Error
}

func (s *SysService) DeleteDictItem(id uint64) error {
	// 软删：is_delete=1
	return s.DB.Delete(&model.SysDictItem{}, id).Error
}
