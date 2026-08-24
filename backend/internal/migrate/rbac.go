package migrate

import (
	"gorm.io/gorm"

	"gbnt/backend/internal/model"
	"gbnt/backend/internal/perm"
)

func ensureSeedRoles(db *gorm.DB) error {
	roles := []model.SysRole{
		{Base: model.Base{ID: 1}, Name: "管理员", Desc: "全部权限", Status: 1},
		{Base: model.Base{ID: 2}, Name: "街道管理员", Desc: "本街道排查整改与汇总", Status: 1},
		{Base: model.Base{ID: 3}, Name: "村级工作人员", Desc: "移动端上报与整改", Status: 1},
	}
	for _, r := range roles {
		var exist model.SysRole
		if err := db.First(&exist, r.ID).Error; err == nil {
			continue
		}
		if err := db.Create(&r).Error; err != nil {
			return err
		}
	}
	return nil
}

func seedDefaultRoleAPIs(db *gorm.DB) error {
	var apis []model.SysAPI
	if err := db.Where("enabled = ?", true).Find(&apis).Error; err != nil {
		return err
	}
	byModule := map[string][]uint64{}
	for _, a := range apis {
		byModule[a.Module] = append(byModule[a.Module], a.ID)
	}
	streetModules := []string{
		"web.workbench", "web.rectify", "web.ledger-street", "web.ledger-survey",
	}
	if err := replaceRoleAPIs(db, 2, collectAPIIDs(byModule, streetModules)); err != nil {
		return err
	}
	return replaceRoleAPIs(db, 3, collectAPIIDs(byModule, nil))
}

func collectAPIIDs(byModule map[string][]uint64, modules []string) []uint64 {
	seen := map[uint64]struct{}{}
	var out []uint64
	for _, mod := range modules {
		for _, id := range byModule[mod] {
			if _, ok := seen[id]; ok {
				continue
			}
			seen[id] = struct{}{}
			out = append(out, id)
		}
	}
	return out
}

func replaceRoleAPIs(db *gorm.DB, roleID uint64, apiIDs []uint64) error {
	if roleID == perm.SuperAdminRoleID {
		return nil
	}
	return db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Unscoped().Where("role_id = ?", roleID).Delete(&model.SysRoleAPI{}).Error; err != nil {
			return err
		}
		for _, aid := range apiIDs {
			row := model.SysRoleAPI{RoleID: roleID, APIID: aid}
			if err := tx.Create(&row).Error; err != nil {
				return err
			}
		}
		return nil
	})
}
