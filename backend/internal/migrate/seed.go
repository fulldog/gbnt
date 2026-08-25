package migrate

import (
	"fmt"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"gbnt/backend/internal/model"
	"gbnt/backend/internal/perm"
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

// seedAdmin 写入管理员账号。
func seedAdmin(db *gorm.DB) error {
	_, rootID, err := loadOrgNameIndex(db)
	if err != nil {
		return err
	}
	if rootID == 0 {
		return fmt.Errorf("seed admin: root org not found")
	}

	var userCount int64
	_ = db.Model(&model.SysUser{}).Count(&userCount)
	if userCount > 0 {
		return nil
	}
	hash, err := bcrypt.GenerateFromPassword([]byte("123456"), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	admin := model.SysUser{
		Username: "admin",
		Password: string(hash),
		Name:     "李强",
		Phone:    "13800000000",
		OrgID:    rootID,
		RoleID:   perm.SuperAdminRoleID,
		Status:   1,
	}
	return db.Create(&admin).Error
}
