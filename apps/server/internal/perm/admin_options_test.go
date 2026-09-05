package perm

import (
	"fmt"
	"testing"
	"time"

	"gbnt/apps/server/internal/model"
)

func TestBusinessOptionsReuseExistingModuleActions(t *testing.T) {
	expected := map[string][2]string{
		"/api/issues/options/orgs":         {"web.rectify", "view"},
		"/api/issues/options/reporters":    {"web.rectify", "create"},
		"/api/issues/:id/assignee-options": {"web.rectify", "edit"},
		"/api/ledger/street/options/orgs":  {"web.ledger-street", "view"},
		"/api/ledger/survey/options/orgs":  {"web.ledger-survey", "view"},
	}
	apis := []model.SysAPI{}
	for _, entry := range Registry {
		apis = append(apis, model.SysAPI{Method: entry.Method, Path: entry.Path, Module: entry.Module, Action: entry.Action})
	}
	svc := NewStaticService(nil, apis)
	for path, grant := range expected {
		t.Run(path, func(t *testing.T) {
			api, ok := svc.FindAPI("GET", path)
			if !ok || api.Module != grant[0] || api.Action != grant[1] {
				t.Fatalf("候选权限注册错误：%+v", api)
			}
			if _, skip := RBACSkipPaths[path]; skip {
				t.Fatal("候选不能加入 JWT-only 白名单")
			}
			for _, public := range PublicPaths {
				if public == path {
					t.Fatal("候选不能公开")
				}
			}
			for _, action := range []string{"view", "create", "edit"} {
				grants := map[string]map[string]bool{grant[0]: {action: true}}
				svc.Cache.Set(fmt.Sprintf("perm:role:%d", 9), &roleGrantCache{ModuleActions: grants}, time.Minute)
				allowed, err := svc.Allow(9, false, api)
				if err != nil {
					t.Fatal(err)
				}
				want := action == grant[1] || grant[1] == "view"
				if allowed != want {
					t.Errorf("仅 %s 权限访问 %s 应为 %v", action, path, want)
				}
				for _, systemPath := range []string{"/api/sys/users", "/api/sys/orgs"} {
					system, _ := svc.FindAPI("GET", systemPath)
					allowed, err := svc.Allow(9, false, system)
					if err != nil || allowed {
						t.Errorf("业务候选权限不应开放系统管理 %s", systemPath)
					}
				}
			}
		})
	}
}
