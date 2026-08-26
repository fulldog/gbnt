package migrate

import (
	"fmt"

	"gorm.io/gorm"
)

var devTables = []string{
	"attachments",
	"op_logs",
	"issue_rectify_records",
	"issues",
	"sys_role_apis",
	"sys_apis",
	"sys_users",
	"sys_roles",
	"sys_orgs",
}

func resetDev(db *gorm.DB) error {
	if err := db.Exec("SET FOREIGN_KEY_CHECKS=0").Error; err != nil {
		return fmt.Errorf("disable fk checks: %w", err)
	}
	defer db.Exec("SET FOREIGN_KEY_CHECKS=1")

	m := db.Migrator()
	for _, table := range devTables {
		if !m.HasTable(table) {
			continue
		}
		if err := db.Exec("TRUNCATE TABLE `" + table + "`").Error; err != nil {
			return fmt.Errorf("truncate %s: %w", table, err)
		}
	}
	return nil
}
