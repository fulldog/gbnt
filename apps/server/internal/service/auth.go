// Package service 业务逻辑层。
package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"gbnt/apps/server/internal/apperr"
	"gbnt/apps/server/internal/cachex"
	"gbnt/apps/server/internal/database"
	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/pkg/jwtutil"
)

// AuthService 鉴权。
type AuthService struct {
	DB    *gorm.DB
	JWT   *jwtutil.Manager
	Deny  *jwtutil.DenyList
	Cache *cachex.Store
}

// ErrMiniappSuperAdmin 超级管理员禁止登录小程序（与 apperr 同一哨兵，errors.Is 互通）。
var ErrMiniappSuperAdmin = apperr.ErrMiniappSuperAdmin

// Login 校验账密并签发管理后台 JWT。
// [PRD] 仅递增 token_ver，踢掉该账号其它管理后台会话；不影响小程序。
func (s *AuthService) Login(ctx context.Context, username, password string) (*model.SysUser, string, time.Time, error) {
	user, err := s.authenticate(ctx, username, password)
	if err != nil {
		return nil, "", time.Time{}, err
	}
	return s.issueLoginToken(user, jwtutil.ClientWeb)
}

// LoginMiniapp 小程序登录：账密通过后拒绝超级管理员；仅递增 app_token_ver，不影响管理后台。
func (s *AuthService) LoginMiniapp(ctx context.Context, username, password string) (*model.SysUser, string, time.Time, error) {
	user, err := s.authenticate(ctx, username, password)
	if err != nil {
		return nil, "", time.Time{}, err
	}
	if user.IsSuperAdmin {
		return nil, "", time.Time{}, ErrMiniappSuperAdmin
	}
	return s.issueLoginToken(user, jwtutil.ClientApp)
}

func (s *AuthService) authenticate(ctx context.Context, username, password string) (*model.SysUser, error) {
	var user model.SysUser
	if err := s.DB.WithContext(ctx).Where("username = ? AND status = 1", username).First(&user).Error; err != nil {
		return nil, errors.New("账号或密码不正确")
	}
	if bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(password)) != nil {
		return nil, errors.New("账号或密码不正确")
	}
	if err := s.checkRoleActive(ctx, user.RoleID); err != nil {
		return nil, err
	}
	return &user, nil
}

func (s *AuthService) issueLoginToken(user *model.SysUser, client string) (*model.SysUser, string, time.Time, error) {
	client = jwtutil.NormalizeClient(client)
	if err := s.bumpLoginTokenVer(user, client); err != nil {
		return nil, "", time.Time{}, err
	}
	ver := user.TokenVer
	if client == jwtutil.ClientApp {
		ver = user.AppTokenVer
	}
	token, exp, err := s.JWT.Sign(user.ID, ver, client)
	if err != nil {
		return nil, "", time.Time{}, err
	}
	s.invalidateUserInfo(user.ID)
	return user, token, exp, nil
}

// bumpLoginTokenVer 事务内递增对应端令牌版本并写回 user，供签发使用。
func (s *AuthService) bumpLoginTokenVer(user *model.SysUser, client string) error {
	if user == nil || user.ID == 0 {
		return errors.New("账号或密码不正确")
	}
	column := "token_ver"
	if jwtutil.NormalizeClient(client) == jwtutil.ClientApp {
		column = "app_token_ver"
	}
	return s.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&model.SysUser{}).Where("id = ?", user.ID).Update(column, gorm.Expr(column+" + 1")).Error; err != nil {
			return err
		}
		var ver int
		if err := tx.Model(&model.SysUser{}).Where("id = ?", user.ID).Select(column).Scan(&ver).Error; err != nil {
			return err
		}
		if column == "app_token_ver" {
			user.AppTokenVer = ver
		} else {
			user.TokenVer = ver
		}
		return nil
	})
}

func invalidateAllSessions(updates map[string]interface{}) map[string]interface{} {
	if updates == nil {
		updates = map[string]interface{}{}
	}
	updates["token_ver"] = gorm.Expr("token_ver + 1")
	updates["app_token_ver"] = gorm.Expr("app_token_ver + 1")
	return updates
}

// ChangePasswordReq 本人修改密码。
type ChangePasswordReq struct {
	OldPassword     string `json:"old_password"`     // 原密码（必填）
	NewPassword     string `json:"new_password"`     // 新密码（必填；6～14 位，仅字母和数字且须同时包含，区分大小写）
	ConfirmPassword string `json:"confirm_password"` // 确认新密码（必填；须与 new_password 一致）
}

// ChangePassword 当前登录用户改密：校验旧密码与确认密码后写入新哈希，并同时作废管理后台与小程序会话。
func (s *AuthService) ChangePassword(ctx context.Context, userID uint64, oldPwd, newPwd, confirmPwd string) error {
	oldPwd = strings.TrimSpace(oldPwd)
	newPwd = strings.TrimSpace(newPwd)
	confirmPwd = strings.TrimSpace(confirmPwd)
	if oldPwd == "" {
		return errors.New("请填写原密码")
	}
	if newPwd == "" {
		return errors.New("请填写新密码")
	}
	if confirmPwd == "" {
		return errors.New("请填写确认密码")
	}
	if newPwd != confirmPwd {
		return errors.New("两次输入的新密码不一致")
	}
	if err := ValidateSetPassword(newPwd); err != nil {
		return err
	}
	if oldPwd == newPwd {
		return errors.New("新密码不能与原密码相同")
	}
	var user model.SysUser
	if err := s.DB.WithContext(ctx).First(&user, userID).Error; err != nil {
		return errors.New("用户不存在")
	}
	if bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(oldPwd)) != nil {
		return errors.New("原密码不正确")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(newPwd), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	if err := s.DB.WithContext(ctx).Model(&user).Updates(invalidateAllSessions(map[string]interface{}{
		"password": string(hash),
	})).Error; err != nil {
		return err
	}
	s.invalidateUserInfo(userID)
	return nil
}

// Logout 将当前 token 的 jti 加入黑名单（TTL=剩余有效期）。
func (s *AuthService) Logout(tokenStr string) error {
	tokenStr = strings.TrimSpace(tokenStr)
	if tokenStr == "" {
		return errors.New("未登录或凭证无效")
	}
	claims, err := s.JWT.Parse(tokenStr)
	if err != nil {
		return errors.New("未登录或凭证无效")
	}
	if claims.ID == "" {
		return errors.New("凭证无效")
	}
	if s.Deny != nil {
		s.Deny.Ban(claims.ID, s.JWT.RemainTTL(claims))
	}
	return nil
}

func (s *AuthService) checkRoleActive(ctx context.Context, roleID uint64) error {
	if roleID == 0 {
		return nil // 无角色绑定时不校验角色状态
	}
	var role model.SysRole
	if err := s.DB.WithContext(ctx).First(&role, roleID).Error; err != nil {
		return errors.New("角色已禁用")
	}
	if role.Status != 1 {
		return errors.New("角色已禁用")
	}
	return nil
}

const userInfoCacheTTL = 30 * time.Second

// InvalidateUserInfoCache 用户停用/改密/登录踢线后立刻丢掉 JWT 热路径缓存。
func InvalidateUserInfoCache(store *cachex.Store, userID uint64) {
	if store == nil || userID == 0 {
		return
	}
	store.Delete(fmt.Sprintf("userinfo:%d", userID))
}

func (s *AuthService) invalidateUserInfo(id uint64) {
	InvalidateUserInfoCache(s.Cache, id)
}

// UserInfoFromModel 将 SysUser 转为上下文 UserInfo。
func UserInfoFromModel(u *model.SysUser) *database.UserInfo {
	if u == nil {
		return nil
	}
	return &database.UserInfo{
		ID:           u.ID,
		Username:     u.Username,
		Name:         u.Name,
		Phone:        u.Phone,
		OrgID:        u.OrgID,
		RoleID:       u.RoleID,
		TokenVer:     u.TokenVer,
		AppTokenVer:  u.AppTokenVer,
		IsSuperAdmin: u.IsSuperAdmin,
	}
}

// LoadActiveUserInfo 按 user_id 查库，用户与角色均须 status=1。
func (s *AuthService) LoadActiveUserInfo(ctx context.Context, id uint64) (*database.UserInfo, error) {
	if id == 0 {
		return nil, database.ErrUnauth
	}
	key := fmt.Sprintf("userinfo:%d", id)
	if s.Cache != nil {
		if v, ok := s.Cache.Get(key); ok {
			if info, ok := v.(*database.UserInfo); ok && info != nil {
				copied := *info
				return &copied, nil
			}
		}
	}
	var user model.SysUser
	err := s.DB.WithContext(ctx).Model(&model.SysUser{}).
		Joins("LEFT JOIN sys_roles ON sys_roles.id = sys_users.role_id AND sys_roles.is_delete = 0").
		Where("sys_users.id = ? AND sys_users.status = 1", id).
		Where("sys_users.role_id = 0 OR sys_roles.status = 1").
		First(&user).Error
	if err != nil {
		return nil, database.ErrUnauth
	}
	info := UserInfoFromModel(&user)
	if s.Cache != nil && info != nil {
		copied := *info
		s.Cache.Set(key, &copied, userInfoCacheTTL)
	}
	return info, nil
}

// GetByID 按 ID 取用户。
func (s *AuthService) GetByID(id uint64) (*model.SysUser, error) {
	var user model.SysUser
	if err := s.DB.First(&user, id).Error; err != nil {
		return nil, err
	}
	return &user, nil
}
