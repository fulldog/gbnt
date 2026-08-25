package migrate

import (
	"fmt"
	"strings"

	"gorm.io/gorm"

	"gbnt/backend/internal/model"
)

// ensureSchema GORM AutoMigrate + 表注释；并删除已废弃的字典表/列。
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
		&model.IssueRectifyRecord{},
		&model.OpLog{},
		&model.Attachment{},
		&model.AttachmentRefItem{},
	); err != nil {
		return err
	}
	if err := dropLegacyIssueColumns(db); err != nil {
		return err
	}
	return applyTableComments(db)
}

// dropLegacyIssueColumns 删除已从 Issue 模型移除的列（AutoMigrate 不会 DROP）。
// 保留 assignee_name / assignee_phone（接口不传，库内可空）。
func dropLegacyIssueColumns(db *gorm.DB) error {
	m := db.Migrator()
	if !m.HasTable(&model.Issue{}) {
		return nil
	}
	for _, col := range []string{
		"project_name",
		"location_text",
		"description",
		"measures",
		"reporter_name",
		"reporter_phone",
	} {
		if !m.HasColumn(&model.Issue{}, col) {
			continue
		}
		if err := m.DropColumn(&model.Issue{}, col); err != nil {
			return fmt.Errorf("drop issues.%s: %w", col, err)
		}
	}
	return nil
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
