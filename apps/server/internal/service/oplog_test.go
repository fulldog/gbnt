package service

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"gbnt/apps/server/internal/cachex"
	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/perm"
)

func TestMarkFromCatalogWritesAPIName(t *testing.T) {
	gin.SetMode(gin.TestMode)
	permSvc := perm.NewStaticService(cachex.New(0, 0), []model.SysAPI{
		{Method: http.MethodPost, Path: "/api/app/issues", Name: "小程序上报问题"},
	})
	oplog := &OpLogService{}
	r := gin.New()
	r.POST("/api/app/issues", func(c *gin.Context) {
		oplog.MarkFromCatalog(c, permSvc)
		got, _ := c.Get("op_action")
		if got != "小程序上报问题" {
			t.Fatalf("action = %v", got)
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

func TestMarkFromCatalogKeepsExistingAction(t *testing.T) {
	gin.SetMode(gin.TestMode)
	permSvc := perm.NewStaticService(cachex.New(0, 0), []model.SysAPI{
		{Method: http.MethodPost, Path: "/api/app/issues", Name: "小程序上报问题"},
	})
	oplog := &OpLogService{}
	r := gin.New()
	r.POST("/api/app/issues", func(c *gin.Context) {
		oplog.Mark(c, "小程序上报", "well")
		oplog.MarkFromCatalog(c, permSvc)
		got, _ := c.Get("op_action")
		if got != "小程序上报" {
			t.Fatalf("action = %v, want 小程序上报", got)
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
