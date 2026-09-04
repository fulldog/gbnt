package jwtutil

import (
	"time"

	"gbnt/apps/server/internal/cachex"
)

const denyKeyPrefix = "jwt:deny:"

// DenyList 已注销 JWT 的 jti 黑名单（进程内 TTL 缓存）。
type DenyList struct {
	Store *cachex.Store
}

// Ban 将 jti 拉黑至 ttl 结束（通常为 token 剩余有效期）。
func (d *DenyList) Ban(jti string, ttl time.Duration) {
	if d == nil || d.Store == nil || jti == "" || ttl <= 0 {
		return
	}
	d.Store.Set(denyKeyPrefix+jti, 1, ttl)
}

// Denied jti 是否在黑名单中。
func (d *DenyList) Denied(jti string) bool {
	if d == nil || d.Store == nil || jti == "" {
		return false
	}
	_, ok := d.Store.Get(denyKeyPrefix + jti)
	return ok
}
