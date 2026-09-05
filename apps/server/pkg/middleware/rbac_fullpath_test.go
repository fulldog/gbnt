package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"gbnt/apps/server/internal/cachex"
	"gbnt/apps/server/internal/database"
	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/perm"
)

func TestFullPathInGlobalMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)
	var gotMethod, gotFullPath string
	r := gin.New()
	r.Use(func(c *gin.Context) {
		gotMethod = c.Request.Method
		gotFullPath = c.FullPath()
		c.Next()
	})
	api := r.Group("/api")
	issues := api.Group("/issues")
	issues.GET("/:id", func(c *gin.Context) {
		c.Status(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/issues/42", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if gotFullPath != "/api/issues/:id" {
		t.Fatalf("FullPath = %q, want /api/issues/:id", gotFullPath)
	}
	if gotMethod != http.MethodGet {
		t.Fatalf("method = %q", gotMethod)
	}
}

func TestRBACSkipsPublicPath(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(RBAC(nil, true, perm.PublicPaths))
	r.GET("/api/health", func(c *gin.Context) {
		c.Status(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("health status = %d, body = %s", w.Code, w.Body.String())
	}
}

func TestRBACSkipsAttachUpload(t *testing.T) {
	gin.SetMode(gin.TestMode)
	svc := perm.NewStaticService(cachex.New(0, 0), []model.SysAPI{
		{Method: "GET", Path: "/api/issues", Module: "web.rectify", Action: "view"},
	})
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Request = c.Request.WithContext(database.WithUser(c.Request.Context(), &database.UserInfo{ID: 3, RoleID: 3}))
		c.Next()
	})
	r.Use(RBAC(svc, true, perm.PublicPaths))
	r.POST("/api/attachments/images", func(c *gin.Context) { c.Status(http.StatusOK) })

	req := httptest.NewRequest(http.MethodPost, "/api/attachments/images", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("attach upload should skip RBAC, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestRBACSkipsAppPrefix(t *testing.T) {
	gin.SetMode(gin.TestMode)
	svc := perm.NewStaticService(cachex.New(0, 0), []model.SysAPI{
		{Method: "GET", Path: "/api/issues", Module: "web.rectify", Action: "view"},
	})
	r := gin.New()
	r.Use(RBAC(svc, true, perm.PublicPaths))
	app := r.Group("/api/app")
	app.GET("/todos", func(c *gin.Context) { c.Status(http.StatusOK) })

	req := httptest.NewRequest(http.MethodGet, "/api/app/todos", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	// /api/app/* 整段跳过 RBAC；本用例未挂 JWT，故应直接放行到 handler。
	if w.Code != http.StatusOK {
		t.Fatalf("app route should skip RBAC (JWT is separate), got %d", w.Code)
	}
}

func TestRBACSkipsAppPrefixWithUser(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Request = c.Request.WithContext(database.WithUser(c.Request.Context(), &database.UserInfo{ID: 2, RoleID: 3}))
		c.Next()
	})
	r.Use(RBAC(perm.NewStaticService(cachex.New(0, 0), nil), true, perm.PublicPaths))
	app := r.Group("/api/app")
	app.GET("/todos", func(c *gin.Context) { c.Status(http.StatusOK) })

	req := httptest.NewRequest(http.MethodGet, "/api/app/todos", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("app route should bypass RBAC, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestRBACSuperAdminAllowsUnindexedAPI(t *testing.T) {
	gin.SetMode(gin.TestMode)
	svc := perm.NewStaticService(cachex.New(0, 0), nil)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Request = c.Request.WithContext(database.WithUser(c.Request.Context(), &database.UserInfo{ID: 1, RoleID: 0, IsSuperAdmin: true}))
		c.Next()
	})
	r.Use(RBAC(svc, true, perm.PublicPaths))
	r.GET("/api/ledger/street/options/orgs", func(c *gin.Context) { c.Status(http.StatusOK) })

	req := httptest.NewRequest(http.MethodGet, "/api/ledger/street/options/orgs", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("超管在 sys_apis 未收录时也应放行，got %d body=%s", w.Code, w.Body.String())
	}
}

func TestRBACNormalUserUnindexedAPIForbidden(t *testing.T) {
	gin.SetMode(gin.TestMode)
	svc := perm.NewStaticService(cachex.New(0, 0), nil)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Request = c.Request.WithContext(database.WithUser(c.Request.Context(), &database.UserInfo{ID: 2, RoleID: 3, IsSuperAdmin: false}))
		c.Next()
	})
	r.Use(RBAC(svc, true, perm.PublicPaths))
	r.GET("/api/ledger/street/options/orgs", func(c *gin.Context) { c.Status(http.StatusOK) })

	req := httptest.NewRequest(http.MethodGet, "/api/ledger/street/options/orgs", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusForbidden {
		t.Fatalf("普通用户未收录接口应为 403，got %d body=%s", w.Code, w.Body.String())
	}
}
func TestRBACRequiresLoginForProtectedTemplate(t *testing.T) {
	gin.SetMode(gin.TestMode)
	svc := perm.NewStaticService(cachex.New(0, 0), []model.SysAPI{
		{Method: "GET", Path: "/api/issues/:id", Module: "web.rectify", Action: "view"},
	})
	r := gin.New()
	r.Use(RBAC(svc, true, perm.PublicPaths))
	api := r.Group("/api")
	issues := api.Group("/issues")
	issues.GET("/:id", func(c *gin.Context) { c.Status(http.StatusOK) })

	req := httptest.NewRequest(http.MethodGet, "/api/issues/99", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without login, got %d body=%s", w.Code, w.Body.String())
	}
}
