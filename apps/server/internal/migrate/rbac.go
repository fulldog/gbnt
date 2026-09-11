package migrate

import (
	"gorm.io/gorm"

	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/perm"
)

// ensureSeedRoles 仅写入管理员角色；不播种街道/村级等其它角色。
func ensureSeedRoles(db *gorm.DB) error {
	code := "admin"
	role := model.SysRole{
		Base:   model.Base{ID: perm.SuperAdminRoleID},
		Name:   "管理员",
		Desc:   "全部权限",
		Status: 1,
		Code:   &code,
	}
	var exist model.SysRole
	if err := db.First(&exist, role.ID).Error; err == nil {
		return nil
	}
	return db.Create(&role).Error
}
