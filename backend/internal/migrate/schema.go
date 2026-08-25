package migrate

import (
	"fmt"
	"strings"

	"gorm.io/gorm"

	"gbnt/backend/internal/model"
)

// ensureSchema GORM AutoMigrate + 表注释；并删除已废弃的字典表。
func ensureSchema(db *gorm.DB) error {
	if err := dropLegacyDictTables(db); err != nil {
		return err
	}
	if err := db.AutoMigrate(
		&model.SysOrg{},
		&model.SysUser{},
		&model.SysRole{},
		&model.SysAPI{},
		&model.SysRoleAPI{},
		&model.Issue{},
		&model.OpLog{},
		&model.Attachment{},
		&model.AttachmentRefItem{},
	); err != nil {
		return err
	}
	return applyTableComments(db)
}

func dropLegacyDictTables(db *gorm.DB) error {
	m := db.Migrator()
	for _, table := range []string{"sys_dict_items", "sys_dict_fields", "sys_dict_types"} {
		if !m.HasTable(table) {
			continue
		}
		if err := m.DropTable(table); err != nil {
			return fmt.Errorf("drop legacy %s: %w", table, err)
		}
	}
	return nil
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
