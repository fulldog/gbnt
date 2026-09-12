package perm

import (
	"fmt"
	"reflect"
	"testing"
	"time"
)

func putRoleGrants(s *Service, roleID uint64, grants map[string]map[string]bool) {
	s.Cache.Set(fmt.Sprintf("perm:role:%d", roleID), &roleGrantCache{ModuleActions: grants}, time.Minute)
}

func TestCanAssignRoleCannotEscalate(t *testing.T) {
	s := NewStaticService(nil, nil)
	putRoleGrants(s, 2, map[string]map[string]bool{
		"web.sys-staff": {"edit": true},
		"web.rectify":   {"view": true},
	})
	putRoleGrants(s, 3, map[string]map[string]bool{
		"web.sys-staff": {"view": true},
	})
	putRoleGrants(s, 4, map[string]map[string]bool{
		"web.rectify": {"edit": true},
	})

	allowed, err := s.CanAssignRole(2, false, 3)
	if err != nil || !allowed {
		t.Fatalf("自身权限覆盖的角色应可分配: %v %v", allowed, err)
	}
	allowed, err = s.CanAssignRole(2, false, 4)
	if err != nil || allowed {
		t.Fatalf("超出自身权限的角色不应可分配: %v %v", allowed, err)
	}
	allowed, err = s.CanAssignRole(2, false, 0)
	if err != nil || allowed {
		t.Fatalf("空角色不能从工作人员页面分配: %v %v", allowed, err)
	}
	allowed, err = s.CanAssignRole(0, true, 4)
	if err != nil || !allowed {
		t.Fatalf("用户级超级管理员可分配普通角色: %v %v", allowed, err)
	}
}

func TestModuleActionsForRoleReturnsSortedCopy(t *testing.T) {
	s := NewStaticService(nil, nil)
	putRoleGrants(s, 2, map[string]map[string]bool{
		"web.rectify": {"edit": true, "view": true, "delete": false},
	})
	actions, err := s.ModuleActionsForRole(2)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(actions, map[string][]string{"web.rectify": {"edit", "view"}}) {
		t.Fatalf("模块操作授权异常: %#v", actions)
	}
	actions["web.rectify"][0] = "tampered"
	again, err := s.ModuleActionsForRole(2)
	if err != nil || again["web.rectify"][0] != "edit" {
		t.Fatalf("返回值不能污染权限缓存: %#v %v", again, err)
	}
}
