// Package jwtutil 签发与解析 JWT（含滑动续期判断）。
package jwtutil

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Claims 业务声明（仅 user_id，其余用户信息由中间件实时查库）。
type Claims struct {
	UserID uint64 `json:"user_id"`
	jwt.RegisteredClaims
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

// Sign 签发 access token。
func (m *Manager) Sign(userID uint64) (string, time.Time, error) {
	exp := time.Now().Add(m.expire)
	claims := Claims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(exp),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	s, err := t.SignedString(m.secret)
	return s, exp, err
}

// Resign 按已有 claims 重新签发（滑动续期），有效期重新起算。
func (m *Manager) Resign(c *Claims) (string, time.Time, error) {
	if c == nil {
		return "", time.Time{}, errors.New("nil claims")
	}
	return m.Sign(c.UserID)
}

// NeedRenew 是否处于滑动续期窗口（仍有效，但剩余时间 < renewBefore）。
func (m *Manager) NeedRenew(c *Claims) bool {
	if c == nil || c.ExpiresAt == nil {
		return false
	}
	remain := time.Until(c.ExpiresAt.Time)
	return remain > 0 && remain <= m.renewBefore
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
