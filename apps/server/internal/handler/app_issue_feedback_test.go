package handler

import (
	"database/sql/driver"
	"net/http/httptest"
	"strings"
	"testing"

	"gbnt/apps/server/internal/database"
	"gbnt/apps/server/internal/perm"
	"gbnt/apps/server/internal/service"
	"gbnt/apps/server/internal/testutil"
	"gbnt/apps/server/pkg/middleware"
	"github.com/gin-gonic/gin"
)

func TestAppFeedbackAndDeleteRequireLogin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.RBAC(perm.NewStaticService(nil, perm.RegistryAsSysAPIs()), true))
	RegisterApp(r, &Deps{})
	for _, request := range []struct{ method, path string }{{"POST", "/api/app/issues/1/feedback"}, {"DELETE", "/api/app/issues/1"}} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(request.method, request.path, strings.NewReader(`{}`)))
		if w.Code != 401 {
			t.Fatalf("%s 应要求登录: %d %s", request.path, w.Code, w.Body.String())
		}
	}
}

func TestAppDeleteOtherReporterReturnsForbidden(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.NewTransactionDB(t, testutil.QueryStep{Kind: "begin"},
		testutil.QueryStep{Contains: "FOR UPDATE", Columns: []string{"id", "report_user_id"}, Rows: [][]driver.Value{{int64(1), int64(8)}}},
		testutil.QueryStep{Kind: "rollback"})
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Request = c.Request.WithContext(database.WithUser(c.Request.Context(), &database.UserInfo{ID: 7}))
		c.Next()
	})
	RegisterApp(r, &Deps{Issue: &service.IssueService{DB: db}})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("DELETE", "/api/app/issues/1", nil))
	if w.Code != 403 || !strings.Contains(w.Body.String(), "上报人本人") {
		t.Fatalf("删除他人上报: %d %s", w.Code, w.Body.String())
	}
}
