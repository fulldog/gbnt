package migrate

import (
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"gbnt/apps/server/internal/model"
)

// bootstrapSeed 全量写入组织、角色、API 目录、默认授权与管理员。
func bootstrapSeed(db *gorm.DB) error {
	if _, _, err := seedDemoOrgs(db); err != nil {
		return err
	}
	if err := ensureSeedRoles(db); err != nil {
		return err
	}
	if err := SyncSysAPIs(db); err != nil {
		return err
	}
	if err := seedDefaultRoleAPIs(db); err != nil {
		return err
	}
	return seedAdmin(db)
}

// seedIfEmpty release 模式：仅空库写入种子。
func seedIfEmpty(db *gorm.DB) error {
	var n int64
	if err := db.Model(&model.SysUser{}).Count(&n).Error; err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	return bootstrapSeed(db)
}

// seedAdmin 写入超级管理员：admin/admin，id 自增为 1，is_super_admin=true。
func seedAdmin(db *gorm.DB) error {
	var userCount int64
	_ = db.Model(&model.SysUser{}).Count(&userCount)
	if userCount > 0 {
		return nil
	}
	hash, err := bcrypt.GenerateFromPassword([]byte("admin"), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	admin := model.SysUser{
		Username:     "admin",
		Password:     string(hash),
		Name:         "超级管理员",
		Phone:        "",
		OrgID:        0,
		RoleID:       0,
		Status:       1,
		IsSuperAdmin: true,
	}
	return db.Create(&admin).Error
}
