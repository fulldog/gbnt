package migrate

import (
	"fmt"

	"gorm.io/gorm"
)

// resetDev 开发模式：仅删除本项目模型对应的表，由后续 AutoMigrate 按模型重建。
// 同库中其它业务的表一律保留。不保留本项目历史数据，也不维护 DROP COLUMN 迁移。
func resetDev(db *gorm.DB) error {
	if err := db.Exec("SET FOREIGN_KEY_CHECKS=0").Error; err != nil {
		return fmt.Errorf("disable fk checks: %w", err)
	}
	defer db.Exec("SET FOREIGN_KEY_CHECKS=1")

	for _, table := range projectTableNames() {
		if err := db.Exec("DROP TABLE IF EXISTS `" + table + "`").Error; err != nil {
			return fmt.Errorf("drop %s: %w", table, err)
		}
	}
	return nil
}
