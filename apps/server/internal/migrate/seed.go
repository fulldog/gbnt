package migrate

import (
	"errors"
	"os"
	"strings"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"gbnt/apps/server/internal/model"
)

// bootstrapSeed 写入组织架构、API 目录与 admin 用户；不播种角色、授权或业务数据。
func bootstrapSeed(db *gorm.DB) error {
	if _, _, err := seedDemoOrgs(db); err != nil {
		return err
	}
	if err := SyncSysAPIs(db); err != nil {
		return err
	}
	return seedAdmin(db, true)
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
	if _, _, err := seedDemoOrgs(db); err != nil {
		return err
	}
	if err := SyncSysAPIs(db); err != nil {
		return err
	}
	return seedAdmin(db, false)
}

func adminSeedPassword(dev bool) (string, error) {
	if p := strings.TrimSpace(os.Getenv("GBNT_BOOTSTRAP_ADMIN_PASSWORD")); p != "" {
		return p, nil
	}
	if dev {
		return "admin", nil
	}
	return "", errors.New("空库初始化须设置环境变量 GBNT_BOOTSTRAP_ADMIN_PASSWORD")
}

// seedAdmin 写入超级管理员；开发重建默认 admin/admin，release 空库须用环境变量指定密码。
func seedAdmin(db *gorm.DB, dev bool) error {
	var userCount int64
	_ = db.Model(&model.SysUser{}).Count(&userCount)
	if userCount > 0 {
		return nil
	}
	plain, err := adminSeedPassword(dev)
	if err != nil {
		return err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(plain), bcrypt.DefaultCost)
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
