package migrate

import (
	"gorm.io/gorm"

	"gbnt/backend/internal/model"
	"gbnt/backend/internal/perm"
)

// SyncSysAPIs 将 Registry upsert 到 sys_apis，并禁用已移除项。
func SyncSysAPIs(db *gorm.DB) error {
	regKeys := map[string]struct{}{}
	for _, e := range perm.Registry {
		regKeys[apiRegKey(e.Method, e.Path)] = struct{}{}
		var row model.SysAPI
		err := db.Unscoped().Where("method = ? AND path = ?", e.Method, e.Path).First(&row).Error
		if err == gorm.ErrRecordNotFound {
			row = model.SysAPI{
				Method:  e.Method,
				Path:    e.Path,
				Name:    e.Name,
				Module:  e.Module,
				Action:  e.Action,
				Sort:    e.Sort,
				Enabled: true,
			}
			if err := db.Create(&row).Error; err != nil {
				return err
			}
			continue
		}
		if err != nil {
			return err
		}
		if err := db.Unscoped().Model(&row).Updates(map[string]interface{}{
			"name": e.Name, "module": e.Module, "action": e.Action, "sort": e.Sort, "enabled": true, "is_delete": 0,
		}).Error; err != nil {
			return err
		}
	}
	var all []model.SysAPI
	if err := db.Unscoped().Find(&all).Error; err != nil {
		return err
	}
	for _, a := range all {
		if _, ok := regKeys[apiRegKey(a.Method, a.Path)]; !ok {
			_ = db.Model(&model.SysAPI{}).Where("id = ?", a.ID).Update("enabled", false).Error
		}
	}
	return nil
}

func apiRegKey(method, path string) string {
	return method + "\x00" + path
}
