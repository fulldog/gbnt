// Package config 加载 YAML 与环境变量覆盖。
package config

import (
	"fmt"
	"strings"

	"github.com/spf13/viper"
)

// Config 应用全局配置。
type Config struct {
	Server  ServerConfig  `mapstructure:"server"`
	MySQL   MySQLConfig   `mapstructure:"mysql"`
	Migrate MigrateConfig `mapstructure:"migrate"`
	JWT     JWTConfig     `mapstructure:"jwt"`
	Log     LogConfig     `mapstructure:"log"`
	Upload  UploadConfig  `mapstructure:"upload"`
}

type ServerConfig struct {
	Addr string `mapstructure:"addr"`
	Mode string `mapstructure:"mode"`
}

type MySQLConfig struct {
	DSN     string `mapstructure:"dsn"`
	MaxIdle int    `mapstructure:"max_idle"`
	MaxOpen int    `mapstructure:"max_open"`
}

// MigrateConfig 启动时数据库迁移控制。
type MigrateConfig struct {
	Enabled bool `mapstructure:"enabled"` // 是否 AutoMigrate
	Seed    bool `mapstructure:"seed"`    // 是否写种子（需 Enabled）
}

type JWTConfig struct {
	Secret           string `mapstructure:"secret"`
	ExpireHours      int    `mapstructure:"expire_hours"`
	RenewBeforeHours int    `mapstructure:"renew_before_hours"` // 剩余不足此时长则滑动续期
}

type LogConfig struct {
	Dir        string `mapstructure:"dir"`
	MaxSizeMB  int    `mapstructure:"max_size_mb"`
	MaxBackups int    `mapstructure:"max_backups"`
	MaxAgeDays int    `mapstructure:"max_age_days"`
	Level      string `mapstructure:"level"`
	SlowSQLMs  int    `mapstructure:"slow_sql_ms"`
}

type UploadConfig struct {
	Root        string `mapstructure:"root"`
	ChunkSize   int64  `mapstructure:"chunk_size"`
	MaxFileSize int64  `mapstructure:"max_file_size"`
	Font        string `mapstructure:"font"` // 水印中文字体 ttf/otf/ttc；空则探测系统字体
}

// Load 从 configs/config.yaml 读取，并用 GBNT_ 前缀环境变量覆盖。
func Load(path string) (*Config, error) {
	v := viper.New()
	v.SetConfigFile(path)
	v.SetEnvPrefix("GBNT")
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.AutomaticEnv()
	// 未配置时默认开启迁移与种子（生产可在 yaml / 环境变量显式关闭）
	v.SetDefault("migrate.enabled", true)
	v.SetDefault("migrate.seed", true)

	if err := v.ReadInConfig(); err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}

	var c Config
	if err := v.Unmarshal(&c); err != nil {
		return nil, fmt.Errorf("unmarshal config: %w", err)
	}

	// 环境变量直接覆盖常用项
	if dsn := v.GetString("MYSQL_DSN"); dsn != "" {
		c.MySQL.DSN = dsn
	}
	if secret := v.GetString("JWT_SECRET"); secret != "" {
		c.JWT.Secret = secret
	}
	if addr := v.GetString("SERVER_ADDR"); addr != "" {
		c.Server.Addr = addr
	}
	// 迁移开关可用环境变量覆盖：GBNT_MIGRATE_ENABLED / GBNT_MIGRATE_SEED
	if v.IsSet("MIGRATE_ENABLED") {
		c.Migrate.Enabled = v.GetBool("MIGRATE_ENABLED")
	}
	if v.IsSet("MIGRATE_SEED") {
		c.Migrate.Seed = v.GetBool("MIGRATE_SEED")
	}
	if c.Log.SlowSQLMs <= 0 {
		c.Log.SlowSQLMs = 200
	}
	if c.Log.MaxSizeMB <= 0 {
		c.Log.MaxSizeMB = 100
	}
	if c.JWT.ExpireHours <= 0 {
		c.JWT.ExpireHours = 72
	}
	if c.JWT.RenewBeforeHours <= 0 {
		// 默认在有效期最后 1/3 窗口内续期
		c.JWT.RenewBeforeHours = c.JWT.ExpireHours / 3
		if c.JWT.RenewBeforeHours < 1 {
			c.JWT.RenewBeforeHours = 1
		}
	}
	if c.JWT.RenewBeforeHours >= c.JWT.ExpireHours {
		c.JWT.RenewBeforeHours = c.JWT.ExpireHours / 2
		if c.JWT.RenewBeforeHours < 1 {
			c.JWT.RenewBeforeHours = 1
		}
	}
	return &c, nil
}
