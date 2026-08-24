// Package migrate 数据库结构迁移与种子数据。
// server.mode=debug 时每次启动清空业务表并全量初始化；release 模式仅 AutoMigrate + 同步 API + 可选空库种子。
package migrate

import (
	"strings"

	"gorm.io/gorm"
)

// Options 迁移选项。
type Options struct {
	Seed bool // release 模式下空库是否写种子
	Dev  bool // debug 模式：清空并全量初始化
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

// IsDevMode 根据 server.mode 判断是否开发模式。
func IsDevMode(mode string) bool {
	return strings.EqualFold(strings.TrimSpace(mode), "debug")
}
