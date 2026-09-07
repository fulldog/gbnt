package perm

import (
	"fmt"
	"testing"
	"time"

	"gbnt/apps/server/internal/model"
)

func TestAdminLoginRegistry(t *testing.T) {
	t.Parallel()
	var found Entry
	for _, e := range Registry {
		if e.Method == "POST" && e.Path == "/api/auth/login" {
			found = e
			break
		}
	}
	if found.Module != "web.auth" || found.Action != "login" {
		t.Fatalf("管理端登录未入 RBAC 目录：%+v", found)
	}
	if found.IsJWT {
		t.Fatal("管理端登录须 JWT 公开（无 token）")
	}
	if !found.IsRBAC {
		t.Fatal("管理端登录须 is_rbac=1，由 handler 校验角色")
	}
}

func TestAllowAdminWebLogin(t *testing.T) {
	t.Parallel()
	loginAPI := model.SysAPI{Method: "POST", Path: "/api/auth/login", Module: "web.auth", Action: "login"}
	svc := NewStaticService(nil, []model.SysAPI{loginAPI})

	ok, err := AllowAdminWebLogin(nil, true, 2, false)
	if err != nil || !ok {
		t.Fatalf("无权限服务应放行：%v %v", ok, err)
	}
	ok, err = AllowAdminWebLogin(svc, false, 2, false)
	if err != nil || !ok {
		t.Fatalf("RBAC 关闭应放行：%v %v", ok, err)
	}
	ok, err = AllowAdminWebLogin(svc, true, 0, true)
	if err != nil || !ok {
		t.Fatalf("超管应放行：%v %v", ok, err)
	}

	svc.Cache.Set(fmt.Sprintf("perm:role:%d", 3), &roleGrantCache{
		ModuleActions: map[string]map[string]bool{},
	}, time.Minute)
	ok, err = AllowAdminWebLogin(svc, true, 3, false)
	if err != nil || ok {
		t.Fatalf("无授权角色应拒绝：%v %v", ok, err)
	}

	api, _ := svc.FindAPI("POST", "/api/auth/login")
	svc.Cache.Set(fmt.Sprintf("perm:role:%d", 2), &roleGrantCache{
		ModuleActions: map[string]map[string]bool{"web.auth": {"login": true}},
		APIIDs:        []uint64{1},
	}, time.Minute)
	ok, err = AllowAdminWebLogin(svc, true, 2, false)
	if err != nil || !ok {
		t.Fatalf("已授权角色应放行：%v %v", ok, err)
	}
	if api == nil {
		t.Fatal("目录应能查到登录接口")
	}
}
