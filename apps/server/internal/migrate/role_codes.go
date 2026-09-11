package migrate

import (
	"fmt"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/perm"
	"gbnt/apps/server/internal/rolecode"
)

// ensureRoleCodes 增量回填历史英文标识；不改数字主键、名称、状态及任何关联。
func ensureRoleCodes(db *gorm.DB) error {
	return db.Transaction(func(tx *gorm.DB) error {
		var roles []model.SysRole
		// 包含软删除记录；保留其标识，避免历史角色和新角色重用相同ID。
		if err := tx.Unscoped().Clauses(clause.Locking{Strength: "UPDATE"}).Where("code IS NULL OR code = ''").Order("id ASC").Find(&roles).Error; err != nil {
			return err
		}
		for _, role := range roles {
			base := fmt.Sprintf("role-%d", role.ID)
			if role.ID == perm.SuperAdminRoleID {
				base = "admin"
			}
			for suffix := 0; ; suffix++ {
				candidate := base
				if suffix > 0 {
					candidate = fmt.Sprintf("%s-%d", base, suffix)
				}
				err := tx.Unscoped().Model(&model.SysRole{}).Where("id = ?", role.ID).UpdateColumn("code", candidate).Error
				if rolecode.IsDuplicate(err) && suffix < 10000 {
					continue
				}
				if err != nil {
					return fmt.Errorf("回填角色 %d 的英文ID失败: %w", role.ID, err)
				}
				break
			}
		}
		return nil
	})
}
