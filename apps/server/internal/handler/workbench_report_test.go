package handler

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"gbnt/apps/server/internal/perm"
	"gbnt/apps/server/internal/service"
	"gbnt/apps/server/internal/testutil"
	"github.com/gin-gonic/gin"
)

func TestWorkbenchReportValidationBeforeDatabase(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	(&Deps{}).registerWorkbench(r.Group("/api"))
	for _, path := range []string{"/trend?range=bad", "/todos?page=x", "/todos?page=0", "/todos?size=101", "/todos?size=-1", "/todos?page=1000001"} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/workbench"+path, nil))
		if w.Code != http.StatusBadRequest {
			t.Errorf("非法参数 %s 返回 %d", path, w.Code)
		}
	}
}

func TestWorkbenchReportDatabaseFailuresReturn500(t *testing.T) {
	for _, endpoint := range []string{"trend", "todos"} {
		t.Run(endpoint, func(t *testing.T) {
			db := testutil.NewQueryDB(t, testutil.QueryStep{Contains: "SELECT", Err: errors.New("数据读取失败")})
			r := gin.New()
			(&Deps{Issue: &service.IssueService{DB: db}}).registerWorkbench(r.Group("/api"))
			w := httptest.NewRecorder()
			r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/workbench/"+endpoint, nil))
			if w.Code != http.StatusInternalServerError {
				t.Fatalf("数据故障不可返回成功：%d %s", w.Code, w.Body.String())
			}
		})
	}
}

func TestWorkbenchReportUsesOwnViewPermission(t *testing.T) {
	for _, path := range []string{"/api/workbench/trend", "/api/workbench/todos"} {
		found := false
		for _, entry := range perm.Registry {
			if entry.Path == path {
				found = entry.Method == "GET" && entry.Module == "web.workbench" && entry.Action == "view"
			}
		}
		if !found {
			t.Errorf("%s 未登记工作台只读权限", path)
		}
	}
}
