package migrate

import (
	"fmt"
	"strings"

	"gorm.io/gorm"

	"gbnt/apps/server/internal/model"
)

// projectModels 本项目 GORM 模型（开发模式只删这些表，AutoMigrate 也只建这些表）。
func projectModels() []any {
	return []any{
		&model.SysOrg{},
		&model.SysUser{},
		&model.SysRole{},
		&model.SysAPI{},
		&model.SysRoleAPI{},
		&model.Issue{},
		&model.IssueRectifyRecord{},
		&model.OpLog{},
		&model.Attachment{},
	}
}

// projectTableNames 本项目物理表名。
func projectTableNames() []string {
	names := make([]string, 0, len(projectModels()))
	for _, m := range projectModels() {
		tn, ok := m.(interface{ TableName() string })
		if !ok {
			continue
		}
		if name := tn.TableName(); name != "" {
			names = append(names, name)
		}
	}
	return names
}

// ensureSchema 按当前模型 AutoMigrate 并写表注释。开发模式已按项目表删表，此处不写历史列 DROP。
func ensureSchema(db *gorm.DB) error {
	if err := db.AutoMigrate(projectModels()...); err != nil {
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
