package perm

import (
	"testing"

	"gbnt/apps/server/internal/cachex"
	"gbnt/apps/server/internal/model"
)

func TestSysAPICatalogServesFindAndListFromCache(t *testing.T) {
	t.Parallel()
	apis := []model.SysAPI{
		{Base: model.Base{ID: 1}, Method: "GET", Path: "/api/health", Name: "健康检查", Sort: 1, Enabled: true, IsJWT: false},
		{Base: model.Base{ID: 2}, Method: "GET", Path: "/api/issues", Name: "问题列表", Module: "web.rectify", Action: "view", Sort: 2, Enabled: true, IsJWT: true, IsRBAC: true},
	}
	svc := NewStaticService(cachex.New(0, 0), apis)
	svc.DB = nil

	got, ok := svc.FindAPI("GET", "/api/issues")
	if !ok || got.Name != "问题列表" || !got.IsRBAC {
		t.Fatalf("缓存未命中目录：ok=%v %+v", ok, got)
	}
	list, err := svc.ListAllAPIs()
	if err != nil || len(list) != 2 || list[0].Path != "/api/health" {
		t.Fatalf("列表应走缓存：%v %+v", err, list)
	}
	list[0].Name = "被篡改"
	again, err := svc.ListAllAPIs()
	if err != nil || again[0].Name != "健康检查" {
		t.Fatal("返回切片不能改写缓存")
	}

	svc.Cache.Delete(cacheKeySysAPIs)
	if _, ok := svc.FindAPI("GET", "/api/issues"); ok {
		t.Fatal("无库时缓存清空后不能再命中")
	}
}
