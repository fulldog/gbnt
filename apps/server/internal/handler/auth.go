package handler

import (
	"strings"

	"github.com/gin-gonic/gin"

	"gbnt/apps/server/internal/database"
	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/service"
	"gbnt/apps/server/pkg/response"
)

func (d *Deps) registerAuth(api *gin.RouterGroup) {
	auth := api.Group("/auth")
	{
		auth.GET("/captcha", d.GetCaptcha)
		auth.POST("/login", d.Login)
		auth.GET("/me", d.Me)
		auth.PUT("/password", d.ChangePassword)
		auth.POST("/logout", d.Logout)
	}
}

// LoginReq 管理端登录请求（图形验证码）。
type LoginReq struct {
	Username  string `json:"username" binding:"required"` // 登录账号
	Password  string `json:"password" binding:"required"` // 登录密码
	CaptchaID string `json:"captcha_id"`                  // 图形验证码会话 ID；captcha.enabled=false 时可省略
	Captcha   string `json:"captcha"`                     // 图形验证码答案；captcha.enabled=false 时可省略
}

// GetCaptcha GET /api/auth/captcha — 图形验证码（公开），返回 captcha_id / image_base64。
func (d *Deps) GetCaptcha(c *gin.Context) {
	if d.Captcha == nil {
		response.Fail(c, 500, response.CodeServer, "验证码服务未初始化")
		return
	}
	out, err := d.Captcha.CreateImage()
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, out)
}

// Login POST /api/auth/login — 账密 + 图形验证码登录（公开），返回 token / expires_at / user。
func (d *Deps) Login(c *gin.Context) {
	var req LoginReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	if d.Cfg != nil && d.Cfg.Captcha.Enabled {
		if err := d.Captcha.VerifyImage(req.CaptchaID, req.Captcha); err != nil {
			response.Fail(c, 400, response.CodeBadReq, err.Error())
			return
		}
	}
	user, token, exp, err := d.Auth.Login(req.Username, req.Password)
	if err != nil {
		response.Fail(c, 401, response.CodeUnauth, err.Error())
		return
	}
	c.Request = c.Request.WithContext(database.WithUser(c.Request.Context(), service.UserInfoFromModel(user)))
	d.OpLog.Mark(c, "登录", user.Username)
	response.OK(c, gin.H{
		"token":      token,
		"expires_at": exp,
		"user":       d.userPayload(user),
	})
}

func (d *Deps) userPayload(u *model.SysUser) gin.H {
	if u == nil {
		return nil
	}
	out := gin.H{
		"id":             u.ID,
		"username":       u.Username,
		"name":           u.Name,
		"phone":          u.Phone,
		"org_id":         u.OrgID,
		"role_id":        u.RoleID,
		"is_super_admin": u.IsSuperAdmin,
	}
	d.fillAPIs(out, u.RoleID, u.IsSuperAdmin)
	return out
}

func (d *Deps) userInfoPayload(info *database.UserInfo) gin.H {
	if info == nil {
		return nil
	}
	out := gin.H{
		"id":             info.ID,
		"username":       info.Username,
		"name":           info.Name,
		"phone":          info.Phone,
		"org_id":         info.OrgID,
		"role_id":        info.RoleID,
		"is_super_admin": info.IsSuperAdmin,
	}
	d.fillAPIs(out, info.RoleID, info.IsSuperAdmin)
	return out
}

func (d *Deps) fillAPIs(out gin.H, roleID uint64, isSuperAdmin bool) {
	if d.Perm == nil {
		return
	}
	if isSuperAdmin {
		out["apis"] = "*"
		return
	}
	ids, err := d.Perm.ListAPIIDsForRole(roleID)
	if err != nil {
		out["apis"] = []uint64{}
		return
	}
	out["apis"] = ids
}

// Me GET /api/auth/me — 当前用户（含 role_id、apis；超管 apis="*"）。
func (d *Deps) Me(c *gin.Context) {
	info, err := database.UserFromContext(c.Request.Context())
	if err != nil {
		response.Fail(c, 401, response.CodeUnauth, err.Error())
		return
	}
	response.OK(c, d.userInfoPayload(info))
}

// ChangePassword PUT /api/auth/password — 本人改密（JWT，不做 RBAC）。
func (d *Deps) ChangePassword(c *gin.Context) {
	user, err := userFromCtx(c)
	if err != nil {
		response.Fail(c, 401, response.CodeUnauth, err.Error())
		return
	}
	var req service.ChangePasswordReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	if err := d.Auth.ChangePassword(c.Request.Context(), user.ID, req.OldPassword, req.NewPassword, req.ConfirmPassword); err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	d.OpLog.Mark(c, "修改密码", user.Username)
	response.OK(c, nil)
}

// Logout POST /api/auth/logout — 退出登录：当前 token jti 入黑名单（JWT，不做 RBAC）。
func (d *Deps) Logout(c *gin.Context) {
	auth := c.GetHeader("Authorization")
	raw := strings.TrimPrefix(auth, "Bearer ")
	if err := d.Auth.Logout(raw); err != nil {
		response.Fail(c, 401, response.CodeUnauth, err.Error())
		return
	}
	if user, err := userFromCtx(c); err == nil {
		d.OpLog.Mark(c, "退出登录", user.Username)
	}
	response.OK(c, nil)
}
