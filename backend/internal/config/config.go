// Package config 加载 YAML 与环境变量覆盖。
package config

import (
	"fmt"
	"strings"

	"github.com/spf13/viper"
)

// Config 应用全局配置。
type Config struct {
	Server ServerConfig `mapstructure:"server"`
	MySQL  MySQLConfig  `mapstructure:"mysql"`
	JWT    JWTConfig    `mapstructure:"jwt"`
	Log    LogConfig    `mapstructure:"log"`
	Upload UploadConfig `mapstructure:"upload"`
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

type JWTConfig struct {
	Secret      string `mapstructure:"secret"`
	ExpireHours int    `mapstructure:"expire_hours"`
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
}

// Load 从 configs/config.yaml 读取，并用 GBNT_ 前缀环境变量覆盖。
func Load(path string) (*Config, error) {
	v := viper.New()
	v.SetConfigFile(path)
	v.SetEnvPrefix("GBNT")
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.AutomaticEnv()

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
	if c.Log.SlowSQLMs <= 0 {
		c.Log.SlowSQLMs = 200
	}
	if c.Log.MaxSizeMB <= 0 {
		c.Log.MaxSizeMB = 100
	}
	return &c, nil
}
