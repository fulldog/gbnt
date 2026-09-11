package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/gin-gonic/gin"

	"gbnt/apps/server/internal/database"
	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/perm"
	"gbnt/apps/server/pkg/jwtutil"
	"gbnt/apps/server/pkg/response"
)

func TestJWTAuthSkipsWhenIsJWTFalse(t *testing.T) {
	gin.SetMode(gin.TestMode)
	svc := perm.NewStaticService(nil, []model.SysAPI{
		{Method: http.MethodGet, Path: "/api/health", IsJWT: false, IsRBAC: false},
		{Method: http.MethodPost, Path: "/api/auth/login", IsJWT: false, IsRBAC: true},
	})
	r := gin.New()
	r.Use(JWTAuth(jwtutil.New("jwt-flag-test", 72, 24), nil, nil, svc))
	r.GET("/api/health", func(c *gin.Context) { c.Status(http.StatusOK) })
	r.POST("/api/auth/login", func(c *gin.Context) { c.Status(http.StatusOK) })

	for _, tc := range []struct {
		method, path string
	}{
		{http.MethodGet, "/api/health"},
		{http.MethodPost, "/api/auth/login"},
	} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(tc.method, tc.path, nil))
		if w.Code != http.StatusOK {
			t.Fatalf("%s %s 公开路径应为 200，got %d %s", tc.method, tc.path, w.Code, w.Body.String())
		}
	}
}

func TestJWTAuthRequiresTokenWhenUnindexed(t *testing.T) {
	gin.SetMode(gin.TestMode)
	svc := perm.NewStaticService(nil, nil)
	r := gin.New()
	r.Use(JWTAuth(jwtutil.New("jwt-flag-test", 72, 24), func(context.Context, uint64) (*database.UserInfo, error) {
		return &database.UserInfo{ID: 1, TokenVer: 1}, nil
	}, nil, svc))
	r.GET("/api/known", func(c *gin.Context) { c.Status(http.StatusOK) })

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/known", nil))
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("未入目录默认要 JWT，got %d", w.Code)
	}
}

func TestJWTAuthRejectsStaleTokenVerAfterRelogin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	jm := jwtutil.New("jwt-kick-test", 72, 24)
	oldToken, _, err := jm.Sign(1, 1)
	if err != nil {
		t.Fatal(err)
	}
	newToken, _, err := jm.Sign(1, 2)
	if err != nil {
		t.Fatal(err)
	}
	svc := perm.NewStaticService(nil, []model.SysAPI{
		{Method: http.MethodGet, Path: "/api/me", IsJWT: true, IsRBAC: false},
	})
	var currentVer atomic.Int64
	currentVer.Store(2) // 模拟第二次登录已递增
	r := gin.New()
	r.Use(JWTAuth(jm, func(context.Context, uint64) (*database.UserInfo, error) {
		return &database.UserInfo{ID: 1, TokenVer: int(currentVer.Load())}, nil
	}, nil, svc))
	r.GET("/api/me", func(c *gin.Context) { c.Status(http.StatusOK) })

	oldReq := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	oldReq.Header.Set("Authorization", "Bearer "+oldToken)
	oldW := httptest.NewRecorder()
	r.ServeHTTP(oldW, oldReq)
	var body response.Body
	if err := json.Unmarshal(oldW.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if oldW.Code != http.StatusUnauthorized || body.Message != "账号已在其他设备登录" {
		t.Fatalf("旧 token 应被踢下线: %d %s", oldW.Code, oldW.Body.String())
	}

	newReq := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	newReq.Header.Set("Authorization", "Bearer "+newToken)
	newW := httptest.NewRecorder()
	r.ServeHTTP(newW, newReq)
	if newW.Code != http.StatusOK {
		t.Fatalf("新 token 应通过: %d %s", newW.Code, newW.Body.String())
	}
}

func TestJWTAuthPasswordBumpSameAsKick(t *testing.T) {
	gin.SetMode(gin.TestMode)
	jm := jwtutil.New("jwt-kick-pwd", 72, 24)
	token, _, err := jm.Sign(1, 4)
	if err != nil {
		t.Fatal(err)
	}
	svc := perm.NewStaticService(nil, []model.SysAPI{
		{Method: http.MethodGet, Path: "/api/me", IsJWT: true, IsRBAC: false},
	})
	r := gin.New()
	r.Use(JWTAuth(jm, func(context.Context, uint64) (*database.UserInfo, error) {
		return &database.UserInfo{ID: 1, TokenVer: 5}, nil // 改密后版本升高
	}, nil, svc))
	r.GET("/api/me", func(c *gin.Context) { c.Status(http.StatusOK) })
	req := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	var body response.Body
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if w.Code != http.StatusUnauthorized || body.Message != "账号已在其他设备登录" {
		t.Fatalf("改密后旧 token 应失效: %d %s", w.Code, w.Body.String())
	}
}

func TestJWTAuthRenewKeepsTokenVer(t *testing.T) {
	gin.SetMode(gin.TestMode)
	jm := jwtutil.New("jwt-renew-ver", 1, 1) // 签发后立即进入续期窗口
	token, _, err := jm.Sign(1, 9)
	if err != nil {
		t.Fatal(err)
	}
	svc := perm.NewStaticService(nil, []model.SysAPI{
		{Method: http.MethodGet, Path: "/api/me", IsJWT: true, IsRBAC: false},
	})
	r := gin.New()
	r.Use(JWTAuth(jm, func(context.Context, uint64) (*database.UserInfo, error) {
		return &database.UserInfo{ID: 1, TokenVer: 9}, nil
	}, nil, svc))
	r.GET("/api/me", func(c *gin.Context) { c.Status(http.StatusOK) })
	req := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("当前会话续期应成功: %d %s", w.Code, w.Body.String())
	}
	renewed := w.Header().Get("X-New-Token")
	if renewed == "" {
		t.Fatal("应下发滑动续期头")
	}
	claims, err := jm.Parse(renewed)
	if err != nil {
		t.Fatal(err)
	}
	if claims.TokenVer != 9 || claims.UserID != 1 {
		t.Fatalf("续期不得改变 token_ver: %+v", claims)
	}
}

func TestForbidAppSuperAdmin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		if c.Request.Header.Get("X-Super") == "1" {
			c.Request = c.Request.WithContext(database.WithUser(c.Request.Context(), &database.UserInfo{
				ID: 1, Username: "admin", IsSuperAdmin: true,
			}))
		}
		c.Next()
	})
	r.Use(ForbidAppSuperAdmin())
	r.POST("/api/app/auth/login", func(c *gin.Context) { c.Status(http.StatusOK) })
	r.GET("/api/app/todos", func(c *gin.Context) { c.Status(http.StatusOK) })
	r.GET("/api/issues", func(c *gin.Context) { c.Status(http.StatusOK) })

	login := httptest.NewRecorder()
	r.ServeHTTP(login, httptest.NewRequest(http.MethodPost, "/api/app/auth/login", nil))
	if login.Code != http.StatusOK {
		t.Fatalf("公开登录应放行，got %d %s", login.Code, login.Body.String())
	}

	adminWeb := httptest.NewRecorder()
	reqWeb := httptest.NewRequest(http.MethodGet, "/api/issues", nil)
	reqWeb.Header.Set("X-Super", "1")
	r.ServeHTTP(adminWeb, reqWeb)
	if adminWeb.Code != http.StatusOK {
		t.Fatalf("管理端应放行超管，got %d %s", adminWeb.Code, adminWeb.Body.String())
	}

	todos := httptest.NewRecorder()
	reqTodos := httptest.NewRequest(http.MethodGet, "/api/app/todos", nil)
	reqTodos.Header.Set("X-Super", "1")
	r.ServeHTTP(todos, reqTodos)
	if todos.Code != http.StatusForbidden || !strings.Contains(todos.Body.String(), "超级管理员不能登录小程序") {
		t.Fatalf("超管访问小程序业务应 403，got %d %s", todos.Code, todos.Body.String())
	}
}
