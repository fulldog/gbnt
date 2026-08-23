// Package service 业务逻辑层。
package service

import (
	"errors"
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"gbnt/backend/internal/model"
	"gbnt/backend/pkg/jwtutil"
)

// AuthService 鉴权。
type AuthService struct {
	DB  *gorm.DB
	JWT *jwtutil.Manager
}

// Login 校验账密并签发 JWT。
func (s *AuthService) Login(username, password string) (*model.SysUser, string, time.Time, error) {
	var user model.SysUser
	if err := s.DB.Where("username = ? AND status = 1", username).First(&user).Error; err != nil {
		return nil, "", time.Time{}, errors.New("账号或密码不正确")
	}
	if bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(password)) != nil {
		return nil, "", time.Time{}, errors.New("账号或密码不正确")
	}
	token, exp, err := s.JWT.Sign(user.ID, user.Username, user.Name, user.OrgKey, user.Role)
	if err != nil {
		return nil, "", time.Time{}, err
	}
	return &user, token, exp, nil
}

// GetByID 按 ID 取用户。
func (s *AuthService) GetByID(id uint64) (*model.SysUser, error) {
	var user model.SysUser
	if err := s.DB.First(&user, id).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

// OpLogService 操作日志。
type OpLogService struct {
	DB *gorm.DB
}

// Push 写入一条操作日志。
func (s *OpLogService) Push(userID uint64, username, action, detail, path, traceID, ip string) error {
	return s.DB.Create(&model.OpLog{
		UserID:   userID,
		Username: username,
		Action:   action,
		Detail:   detail,
		Path:     path,
		TraceID:  traceID,
		IP:       ip,
	}).Error
}

// List 分页查询。
func (s *OpLogService) List(keyword string, page, size int) ([]model.OpLog, int64, error) {
	q := s.DB.Model(&model.OpLog{})
	if keyword != "" {
		like := "%" + keyword + "%"
		q = q.Where("action LIKE ? OR detail LIKE ? OR username LIKE ?", like, like, like)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var list []model.OpLog
	err := q.Order("id DESC").Offset((page - 1) * size).Limit(size).Find(&list).Error
	return list, total, err
}
