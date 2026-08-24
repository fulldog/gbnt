// Package service 业务逻辑层。
package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"gbnt/backend/internal/database"
	"gbnt/backend/internal/model"
	"gbnt/backend/pkg/jwtutil"
	"gbnt/backend/pkg/response"
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
	token, exp, err := s.JWT.Sign(user.ID)
	if err != nil {
		return nil, "", time.Time{}, err
	}
	return &user, token, exp, nil
}

// UserInfoFromModel 将 SysUser 转为上下文 UserInfo。
func UserInfoFromModel(u *model.SysUser) *database.UserInfo {
	if u == nil {
		return nil
	}
	return &database.UserInfo{
		ID:       u.ID,
		Username: u.Username,
		Name:     u.Name,
		Phone:    u.Phone,
		OrgID:    u.OrgKey,
		Role:     u.Role,
	}
}

// LoadActiveUserInfo 按 user_id 查库，仅 status=1 视为有效登录用户。
func (s *AuthService) LoadActiveUserInfo(ctx context.Context, id uint64) (*database.UserInfo, error) {
	if id == 0 {
		return nil, database.ErrUnauth
	}
	var user model.SysUser
	if err := s.DB.WithContext(ctx).Where("id = ? AND status = 1", id).First(&user).Error; err != nil {
		return nil, database.ErrUnauth
	}
	return UserInfoFromModel(&user), nil
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

const (
	ctxOpAction = "op_action"
	ctxOpDetail = "op_detail"
	maxOpBody   = 16384
)

// Mark 标记本请求的操作文案，由中间件在响应后写入 OpLog（含 request/response）。
func (s *OpLogService) Mark(c *gin.Context, action, detail string) {
	if c == nil {
		return
	}
	c.Set(ctxOpAction, action)
	c.Set(ctxOpDetail, detail)
}

// Persist 写入操作日志（含脱敏后的请求/响应体）。
func (s *OpLogService) Persist(c *gin.Context, req, resp string) error {
	if c == nil || s == nil || s.DB == nil {
		return nil
	}
	action, _ := c.Get(ctxOpAction)
	detail, _ := c.Get(ctxOpDetail)
	act, _ := action.(string)
	det, _ := detail.(string)
	if act == "" {
		act = c.Request.Method
	}
	uid := uint64(0)
	uname := ""
	if u, err := database.UserFromContext(c.Request.Context()); err == nil {
		uid = u.ID
		uname = u.Username
	}
	tid, _ := c.Get(response.CtxTraceID)
	traceID, _ := tid.(string)
	return s.DB.WithContext(c.Request.Context()).Create(&model.OpLog{
		UserID:   uid,
		Username: uname,
		Action:   act,
		Detail:   det,
		Path:     c.Request.URL.Path,
		TraceID:  traceID,
		IP:       c.ClientIP(),
		Request:  clipOpBody(req),
		Response: clipOpBody(resp),
	}).Error
}

func clipOpBody(s string) string {
	s = strings.TrimSpace(s)
	if len(s) <= maxOpBody {
		return s
	}
	return s[:maxOpBody] + "..."
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
