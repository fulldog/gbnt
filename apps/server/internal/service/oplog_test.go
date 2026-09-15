package service

import (
	"context"
	"net/http"
	"testing"

	"gbnt/apps/server/internal/cachex"
	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/perm"
)

func TestCatalogActionWritesAPIName(t *testing.T) {
	permSvc := perm.NewStaticService(cachex.New(0, 0), []model.SysAPI{
		{Method: http.MethodPost, Path: "/api/app/issues", Name: "小程序上报问题"},
	})
	oplog := &OpLogService{}
	got := oplog.CatalogAction(http.MethodPost, "/api/app/issues", permSvc)
	if got != "小程序上报问题" {
		t.Fatalf("action = %q", got)
	}
}

func TestContextKeepCatalogMarkKeepsExistingAction(t *testing.T) {
	permSvc := perm.NewStaticService(cachex.New(0, 0), []model.SysAPI{
		{Method: http.MethodPost, Path: "/api/app/issues", Name: "小程序上报问题"},
	})
	oplog := &OpLogService{}
	ctx := ContextWithMark(context.Background(), "小程序上报", "well")
	ctx = ContextKeepCatalogMark(ctx, oplog.CatalogAction(http.MethodPost, "/api/app/issues", permSvc))
	act, det := MarkFromContext(ctx)
	if act != "小程序上报" {
		t.Fatalf("action = %q, want 小程序上报", act)
	}
	if det != "well" {
		t.Fatalf("detail = %q", det)
	}
}
