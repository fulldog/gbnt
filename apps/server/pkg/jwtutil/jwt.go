// Package jwtutil 签发与解析 JWT（含滑动续期判断）。
package jwtutil

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const (
	// ClientWeb 管理后台会话。
	ClientWeb = "web"
	// ClientApp 小程序会话。
	ClientApp = "app"
)

// Claims 业务声明；用户详情由中间件按 user_id 查库，token_ver 须与对应端版本一致。
type Claims struct {
	UserID   uint64 `json:"user_id"`
	TokenVer int    `json:"token_ver"`
	Client   string `json:"client,omitempty"` // web=管理后台，app=小程序；空视为 web 以兼容旧票
	jwt.RegisteredClaims
}

// NormalizeClient 归一化客户端；未知或空视为管理后台。
func NormalizeClient(client string) string {
	if client == ClientApp {
		return ClientApp
	}
	return ClientWeb
}

// ClientKind 当前票所属端；空 client 视为管理后台。
func (c *Claims) ClientKind() string {
	if c == nil {
		return ClientWeb
	}
	return NormalizeClient(c.Client)
}

// Manager JWT 管理器。
type Manager struct {
	secret      []byte
	expire      time.Duration
	renewBefore time.Duration // 剩余有效期低于此时长则建议续期
}

// New 创建 Manager。
// expireHours：token 总有效期；renewBeforeHours：滑动续期窗口（剩余不足该时长时续期）。
func New(secret string, expireHours, renewBeforeHours int) *Manager {
	if expireHours <= 0 {
		expireHours = 72
	}
	if renewBeforeHours <= 0 {
		renewBeforeHours = expireHours / 3
		if renewBeforeHours < 1 {
			renewBeforeHours = 1
		}
	}
	return &Manager{
		secret:      []byte(secret),
		expire:      time.Duration(expireHours) * time.Hour,
		renewBefore: time.Duration(renewBeforeHours) * time.Hour,
	}
}

// Expire 返回配置的 token 有效期。
func (m *Manager) Expire() time.Duration { return m.expire }

// RenewBefore 返回滑动续期窗口。
func (m *Manager) RenewBefore() time.Duration { return m.renewBefore }

// Sign 签发 access token（含 jti、token_ver 与端标识）。
func (m *Manager) Sign(userID uint64, tokenVer int, client string) (string, time.Time, error) {
	now := time.Now()
	exp := now.Add(m.expire)
	claims := Claims{
		UserID:   userID,
		TokenVer: tokenVer,
		Client:   NormalizeClient(client),
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        uuid.NewString(),
			ExpiresAt: jwt.NewNumericDate(exp),
			IssuedAt:  jwt.NewNumericDate(now),
		},
	}
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	s, err := t.SignedString(m.secret)
	return s, exp, err
}

// Resign 滑动续期：保留 user_id/token_ver，换新 jti 与过期时间。
func (m *Manager) Resign(c *Claims) (string, time.Time, error) {
	if c == nil {
		return "", time.Time{}, errors.New("nil claims")
	}
	return m.Sign(c.UserID, c.TokenVer, c.ClientKind())
}

// NeedRenew 是否处于滑动续期窗口（仍有效，但剩余时间 < renewBefore）。
func (m *Manager) NeedRenew(c *Claims) bool {
	if c == nil || c.ExpiresAt == nil {
		return false
	}
	remain := time.Until(c.ExpiresAt.Time)
	return remain > 0 && remain <= m.renewBefore
}

// RemainTTL 返回 token 剩余有效期；无效或已过期返回 0。
func (m *Manager) RemainTTL(c *Claims) time.Duration {
	if c == nil || c.ExpiresAt == nil {
		return 0
	}
	d := time.Until(c.ExpiresAt.Time)
	if d < 0 {
		return 0
	}
	return d
}

// Parse 解析 token。
func (m *Manager) Parse(tokenStr string) (*Claims, error) {
	t, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		return m.secret, nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := t.Claims.(*Claims)
	if !ok || !t.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}
