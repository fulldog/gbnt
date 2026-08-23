// Package jwtutil 签发与解析 JWT。
package jwtutil

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Claims 业务声明。
type Claims struct {
	UserID   uint64 `json:"user_id"`
	Username string `json:"username"`
	Name     string `json:"name"`
	OrgID    string `json:"org_id"`
	Role     string `json:"role"`
	jwt.RegisteredClaims
}

// Manager JWT 管理器。
type Manager struct {
	secret []byte
	expire time.Duration
}

// New 创建 Manager。
func New(secret string, expireHours int) *Manager {
	if expireHours <= 0 {
		expireHours = 72
	}
	return &Manager{
		secret: []byte(secret),
		expire: time.Duration(expireHours) * time.Hour,
	}
}

// Sign 签发 access token。
func (m *Manager) Sign(userID uint64, username, name, orgID, role string) (string, time.Time, error) {
	exp := time.Now().Add(m.expire)
	claims := Claims{
		UserID:   userID,
		Username: username,
		Name:     name,
		OrgID:    orgID,
		Role:     role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(exp),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	s, err := t.SignedString(m.secret)
	return s, exp, err
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
