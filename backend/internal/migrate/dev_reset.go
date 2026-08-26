package migrate

import (
	"fmt"

	"gorm.io/gorm"
)

// resetDev 开发模式：删除当前库全部业务表，由后续 AutoMigrate 按模型重建。
// 不保留历史数据，也不维护 DROP COLUMN 迁移。
func resetDev(db *gorm.DB) error {
	if err := db.Exec("SET FOREIGN_KEY_CHECKS=0").Error; err != nil {
		return fmt.Errorf("disable fk checks: %w", err)
	}
	defer db.Exec("SET FOREIGN_KEY_CHECKS=1")

	var names []string
	if err := db.Raw(
		"SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'",
	).Scan(&names).Error; err != nil {
		return fmt.Errorf("list tables: %w", err)
	}
	for _, table := range names {
		if err := db.Exec("DROP TABLE IF EXISTS `" + table + "`").Error; err != nil {
			return fmt.Errorf("drop %s: %w", table, err)
		}
	}
	return nil
}
