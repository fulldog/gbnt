package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"gbnt/apps/server/internal/database"
	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/perm"
	"gbnt/apps/server/pkg/jwtutil"
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
