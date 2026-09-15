package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"gbnt/apps/server/internal/cachex"
	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/perm"
	"gbnt/apps/server/internal/service"
)

func TestMarkOpFromCatalogWritesAPIName(t *testing.T) {
	gin.SetMode(gin.TestMode)
	d := &Deps{
		OpLog: &service.OpLogService{},
		Perm: perm.NewStaticService(cachex.New(0, 0), []model.SysAPI{
			{Method: http.MethodPost, Path: "/api/app/issues", Name: "小程序上报问题"},
		}),
	}
	r := gin.New()
	r.POST("/api/app/issues", func(c *gin.Context) {
		d.MarkOpFromCatalog(c)
		act, _ := service.MarkFromContext(c.Request.Context())
		if act != "小程序上报问题" {
			t.Fatalf("action = %q", act)
		}
		c.Status(http.StatusBadRequest)
	})
	req := httptest.NewRequest(http.MethodPost, "/api/app/issues", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d", w.Code)
	}
}

func TestMarkOpFromCatalogKeepsExistingAction(t *testing.T) {
	gin.SetMode(gin.TestMode)
	d := &Deps{
		OpLog: &service.OpLogService{},
		Perm: perm.NewStaticService(cachex.New(0, 0), []model.SysAPI{
			{Method: http.MethodPost, Path: "/api/app/issues", Name: "小程序上报问题"},
		}),
	}
	r := gin.New()
	r.POST("/api/app/issues", func(c *gin.Context) {
		d.markOp(c, "小程序上报", "well")
		d.MarkOpFromCatalog(c)
		act, det := service.MarkFromContext(c.Request.Context())
		if act != "小程序上报" {
			t.Fatalf("action = %q, want 小程序上报", act)
		}
		if det != "well" {
			t.Fatalf("detail = %q", det)
		}
		c.Status(http.StatusOK)
	})
	req := httptest.NewRequest(http.MethodPost, "/api/app/issues", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
}
