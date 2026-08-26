package migrate

import (
	"fmt"
	"strings"

	"gorm.io/gorm"

	"gbnt/backend/internal/model"
)

// ensureSchema 按当前模型 AutoMigrate 并写表注释。开发模式已整库删表，此处不写历史列 DROP。
func ensureSchema(db *gorm.DB) error {
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
