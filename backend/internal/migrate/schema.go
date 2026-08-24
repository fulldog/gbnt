package migrate

import (
	"fmt"
	"strings"

	"gorm.io/gorm"

	"gbnt/backend/internal/model"
)

// ensureSchema GORM AutoMigrate + 表注释。
func ensureSchema(db *gorm.DB) error {
	if err := db.AutoMigrate(
		&model.SysOrg{},
		&model.SysUser{},
		&model.SysRole{},
		&model.SysAPI{},
		&model.SysRoleAPI{},
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
	return applyTableComments(db)
}

func applyTableComments(db *gorm.DB) error {
	for table, comment := range model.TableComments() {
		if !db.Migrator().HasTable(table) {
			continue
		}
		sql := fmt.Sprintf("ALTER TABLE `%s` COMMENT='%s'", table, escapeMySQLString(comment))
		if err := db.Exec(sql).Error; err != nil {
			return fmt.Errorf("table comment %s: %w", table, err)
		}
	}
	return nil
}

func escapeMySQLString(s string) string {
	return strings.NewReplacer(`\`, `\\`, `'`, `\'`).Replace(s)
}
