// Package migrate 数据库结构迁移与种子数据。
// server.mode=debug|dev 时每次启动仅 DROP 本项目模型表再按模型重建并写入组织、管理员角色、API 目录与 admin 用户；同库其它表不动。release 仅 AutoMigrate + 同步 API + 可选空库种子。
package migrate

import (
	"strings"

	"gorm.io/gorm"
)

// Options 迁移选项。
type Options struct {
	Seed bool // release 模式下空库是否写种子
	Dev  bool // debug/dev：仅 DROP 本项目表后重建并写入组织、管理员角色、API、admin 用户
}

// Auto 执行迁移。
func Auto(db *gorm.DB, opts Options) error {
	if opts.Dev {
		if err := resetDev(db); err != nil {
			return err
		}
	}
	if err := ensureSchema(db); err != nil {
		return err
	}
	if opts.Dev {
		return bootstrapSeed(db)
	}
	if err := SyncSysAPIs(db); err != nil {
		return err
	}
	if opts.Seed {
		return seedIfEmpty(db)
	}
	return nil
}

// IsDevMode 根据 server.mode 判断是否开发模式（debug 或 dev）。
func IsDevMode(mode string) bool {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "debug", "dev":
		return true
	default:
		return false
	}
}
