// Package migrate AutoMigrate + 版本化 SQL。
package migrate

import (
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"gbnt/backend/internal/model"
)

// Options 迁移选项。
type Options struct {
	Seed bool // 是否在空库写入种子
}

// Auto 执行自动迁移；opts.Seed 为 true 时写入种子。
func Auto(db *gorm.DB, opts Options) error {
	if err := db.AutoMigrate(
		&model.SchemaMigration{},
		&model.SysOrg{},
		&model.SysUser{},
		&model.SysRole{},
		&model.SysRolePerm{},
		&model.SysDictType{},
		&model.SysDictField{},
		&model.SysDictItem{},
		&model.Issue{},
		&model.OpLog{},
		&model.Attachment{},
		&model.AttachmentRefItem{},
	); err != nil {
		return err
	}
	if err := dropLegacyAttach(db); err != nil {
		return err
	}
	if !opts.Seed {
		return nil
	}
	return seed(db)
}

func dropLegacyAttach(db *gorm.DB) error {
	m := db.Migrator()
	for _, name := range []string{"attachment_chunks", "attachment_refs"} {
		if m.HasTable(name) {
			if err := m.DropTable(name); err != nil {
				return err
			}
		}
	}
	att := &model.Attachment{}
	for _, col := range []string{"uploader_id", "chunk_size", "total_chunks", "uploaded_bits", "uuid"} {
		if m.HasColumn(att, col) {
			if err := m.DropColumn(att, col); err != nil {
				return err
			}
		}
	}
	item := &model.AttachmentRefItem{}
	for _, col := range []string{"ref_uuid", "file_uuid", "sort"} {
		if m.HasColumn(item, col) {
			if err := m.DropColumn(item, col); err != nil {
				return err
			}
		}
	}
	return nil
}

func seed(db *gorm.DB) error {
	var n int64
	db.Model(&model.SysUser{}).Count(&n)
	if n > 0 {
		return nil
	}

	orgs := []model.SysOrg{
		{OrgKey: "org-gov", ParentID: 0, Name: "聊城经济技术开发区管委会", Type: "gov", Sort: 1},
		{OrgKey: "org-agri", ParentID: 0, Name: "农业农村局", Type: "bureau", Sort: 2},
		{OrgKey: "org-jgt", ParentID: 0, Name: "蒋官屯街道", Type: "street", Sort: 3},
		{OrgKey: "org-lg", ParentID: 0, Name: "李官屯新村", Type: "village", Remark: "village", Sort: 4},
	}
	// 修正 parent：先插入再按 key 关联
	for i := range orgs {
		if err := db.Create(&orgs[i]).Error; err != nil {
			return err
		}
	}
	var gov, street model.SysOrg
	_ = db.Where("org_key = ?", "org-gov").First(&gov).Error
	_ = db.Where("org_key = ?", "org-jgt").First(&street).Error
	_ = db.Model(&model.SysOrg{}).Where("org_key = ?", "org-agri").Update("parent_id", gov.ID).Error
	_ = db.Model(&model.SysOrg{}).Where("org_key = ?", "org-jgt").Update("parent_id", gov.ID).Error
	_ = db.Model(&model.SysOrg{}).Where("org_key = ?", "org-lg").Update("parent_id", street.ID).Error

	hash, err := bcrypt.GenerateFromPassword([]byte("123456"), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	admin := model.SysUser{
		Username: "admin",
		Password: string(hash),
		Name:     "李强",
		Phone:    "13800000000",
		OrgKey:   "org-gov",
		Role:     "admin",
		Status:   1,
	}
	if err := db.Create(&admin).Error; err != nil {
		return err
	}

	role := model.SysRole{Code: "admin", Name: "管理员", Desc: "全部权限"}
	if err := db.Create(&role).Error; err != nil {
		return err
	}

	dictTypes := []model.SysDictType{
		{Code: "well", Name: "机井", Sort: 1},
		{Code: "road", Name: "道路", Sort: 2},
		{Code: "bridge", Name: "桥涵", Sort: 3},
		{Code: "forest", Name: "林网", Sort: 4},
		{Code: "transformer", Name: "变压器", Sort: 5},
	}
	for i := range dictTypes {
		if err := db.Create(&dictTypes[i]).Error; err != nil {
			return err
		}
	}

	_ = db.Create(&model.SchemaMigration{Version: "v1_init", AppliedAt: time.Now()}).Error
	return nil
}
