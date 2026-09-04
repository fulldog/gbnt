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
	Captcha CaptchaConfig `mapstructure:"captcha"`
	RBAC    RBACConfig    `mapstructure:"rbac"`
	CORS    CORSConfig    `mapstructure:"cors"`
}

type ServerConfig struct {
	Addr string `mapstructure:"addr"` // 监听地址，如 :8080
	Mode string `mapstructure:"mode"` // debug / release
}

// CORSConfig HTTP 跨域。enabled=true 时允许浏览器跨 Origin 调 API 与读续期响应头。
type CORSConfig struct {
	Enabled          bool     `mapstructure:"enabled"`           // 是否启用；默认 true
	AllowOrigins     []string `mapstructure:"allow_origins"`     // 允许的 Origin 列表；空或含 * 表示允许任意
	AllowCredentials bool     `mapstructure:"allow_credentials"` // 是否允许凭证；默认 true
	MaxAge           int      `mapstructure:"max_age"`           // 预检缓存秒数；默认 86400
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
	ChunkSize   int64  `mapstructure:"chunk_size"` // 预留：分片上传未实现
	MaxFileSize int64  `mapstructure:"max_file_size"`
	Font        string `mapstructure:"font"` // 水印中文字体 ttf/otf/ttc；空则探测系统字体
}

// CaptchaConfig 登录人机验证（Web 图形码 / App 滑动）。
type CaptchaConfig struct {
	Enabled          bool `mapstructure:"enabled"`
	Length           int  `mapstructure:"length"`
	TTLSeconds       int  `mapstructure:"ttl_seconds"`
	Width            int  `mapstructure:"width"`
	Height           int  `mapstructure:"height"`
	SliderTTLSeconds int  `mapstructure:"slider_ttl_seconds"`
	PassTTLSeconds   int  `mapstructure:"pass_ttl_seconds"`
	SliderMinMs      int  `mapstructure:"slider_min_ms"`
	SliderMaxMs      int  `mapstructure:"slider_max_ms"`
}

// RBACConfig 接口权限。
type RBACConfig struct {
	Enabled bool `mapstructure:"enabled"`
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
	v.SetDefault("captcha.enabled", true)
	v.SetDefault("captcha.length", 4)
	v.SetDefault("captcha.ttl_seconds", 300)
	v.SetDefault("captcha.width", 120)
	v.SetDefault("captcha.height", 40)
	v.SetDefault("captcha.slider_ttl_seconds", 300)
	v.SetDefault("captcha.pass_ttl_seconds", 180)
	v.SetDefault("captcha.slider_min_ms", 300)
	v.SetDefault("captcha.slider_max_ms", 8000)
	v.SetDefault("rbac.enabled", true)
	v.SetDefault("cors.enabled", true)
	v.SetDefault("cors.allow_credentials", true)
	v.SetDefault("cors.max_age", 86400)

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
	if v.IsSet("CORS_ENABLED") {
		c.CORS.Enabled = v.GetBool("CORS_ENABLED")
	} else if !v.InConfig("cors.enabled") {
		c.CORS.Enabled = true
	}
	if !v.InConfig("cors.allow_credentials") && !v.IsSet("cors.allow_credentials") {
		c.CORS.AllowCredentials = true
	}
	normalizeCORS(&c.CORS)
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
	normalizeCaptcha(&c.Captcha)
	return &c, nil
}

func normalizeCORS(c *CORSConfig) {
	if c.MaxAge <= 0 {
		c.MaxAge = 86400
	}
}

func normalizeCaptcha(c *CaptchaConfig) {
	if c.Length <= 0 {
		c.Length = 4
	}
	if c.TTLSeconds <= 0 {
		c.TTLSeconds = 300
	}
	if c.Width <= 0 {
		c.Width = 120
	}
	if c.Height <= 0 {
		c.Height = 40
	}
	if c.SliderTTLSeconds <= 0 {
		c.SliderTTLSeconds = 300
	}
	if c.PassTTLSeconds <= 0 {
		c.PassTTLSeconds = 180
	}
	if c.SliderMinMs <= 0 {
		c.SliderMinMs = 300
	}
	if c.SliderMaxMs <= 0 {
		c.SliderMaxMs = 8000
	}
	if c.SliderMinMs >= c.SliderMaxMs {
		c.SliderMinMs = 300
		c.SliderMaxMs = 8000
	}
}
