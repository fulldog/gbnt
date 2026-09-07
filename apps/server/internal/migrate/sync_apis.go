package migrate

import (
	"gorm.io/gorm"

	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/perm"
)

func flagTinyint(v bool) int {
	if v {
		return 1
	}
	return 0
}

// sysAPIAttrs 用 map 写入，保证 is_jwt/is_rbac=0 不会被 GORM 当零值省略。
func sysAPIAttrs(e perm.Entry) map[string]interface{} {
	return map[string]interface{}{
		"method":    e.Method,
		"path":      e.Path,
		"name":      e.Name,
		"module":    e.Module,
		"action":    e.Action,
		"sort":      e.Sort,
		"enabled":   1,
		"is_jwt":    flagTinyint(e.IsJWT),
		"is_rbac":   flagTinyint(e.IsRBAC),
		"is_delete": 0,
	}
}

func sysAPIUpsertFields(e perm.Entry) map[string]interface{} {
	return map[string]interface{}{
		"name": e.Name, "module": e.Module, "action": e.Action, "sort": e.Sort,
		"enabled": 1, "is_delete": 0,
		"is_jwt": flagTinyint(e.IsJWT), "is_rbac": flagTinyint(e.IsRBAC),
	}
}

// SyncSysAPIs 将 Registry upsert 到 sys_apis，并禁用已移除项。
// is_jwt / is_rbac：公开 0/0、登录即可 1/0、角色授权 1/1、管理端登录 0/1。
func SyncSysAPIs(db *gorm.DB) error {
	regKeys := map[string]struct{}{}
	for _, e := range perm.Registry {
		regKeys[apiRegKey(e.Method, e.Path)] = struct{}{}
		var row model.SysAPI
		err := db.Unscoped().Where("method = ? AND path = ?", e.Method, e.Path).First(&row).Error
		if err == gorm.ErrRecordNotFound {
			// 必须用 map + 整型 0/1：struct bool false 即使用 Select 也会因 default 标签被跳过。
			if err := db.Unscoped().Model(&model.SysAPI{}).Create(sysAPIAttrs(e)).Error; err != nil {
				return err
			}
			continue
		}
		if err != nil {
			return err
		}
		if err := db.Unscoped().Model(&row).Updates(sysAPIUpsertFields(e)).Error; err != nil {
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
