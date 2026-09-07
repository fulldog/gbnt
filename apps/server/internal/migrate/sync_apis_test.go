package migrate

import (
	"testing"

	"gbnt/apps/server/internal/perm"
)

func TestSysAPIAttrsKeepsZeroFlags(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name     string
		isJWT    bool
		isRBAC   bool
		wantJWT  int
		wantRBAC int
	}{
		{name: "公开", isJWT: false, isRBAC: false, wantJWT: 0, wantRBAC: 0},
		{name: "登录即可", isJWT: true, isRBAC: false, wantJWT: 1, wantRBAC: 0},
		{name: "管理端登录", isJWT: false, isRBAC: true, wantJWT: 0, wantRBAC: 1},
		{name: "角色授权", isJWT: true, isRBAC: true, wantJWT: 1, wantRBAC: 1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			e := perm.Entry{Method: "GET", Path: "/x", Name: tc.name, IsJWT: tc.isJWT, IsRBAC: tc.isRBAC}
			attrs := sysAPIAttrs(e)
			if attrs["is_jwt"] != tc.wantJWT || attrs["is_rbac"] != tc.wantRBAC {
				t.Fatalf("attrs=%v", attrs)
			}
			upd := sysAPIUpsertFields(e)
			if upd["is_jwt"] != tc.wantJWT || upd["is_rbac"] != tc.wantRBAC {
				t.Fatalf("upsert=%v", upd)
			}
		})
	}
}

func TestRegistryPublicEntriesHaveZeroFlags(t *testing.T) {
	t.Parallel()
	var publicN, jwtOnlyN int
	for _, e := range perm.Registry {
		attrs := sysAPIAttrs(e)
		jwt, _ := attrs["is_jwt"].(int)
		rbac, _ := attrs["is_rbac"].(int)
		if jwt == 0 && rbac == 0 {
			publicN++
		}
		if jwt == 1 && rbac == 0 {
			jwtOnlyN++
		}
		if e.Path == "/api/health" && (jwt != 0 || rbac != 0) {
			t.Fatalf("health 必须 0/0，got %d/%d", jwt, rbac)
		}
		if e.Path == "/api/auth/login" && (jwt != 0 || rbac != 1) {
			t.Fatalf("管理端登录必须 0/1，got %d/%d", jwt, rbac)
		}
		if e.Path == "/api/auth/me" && (jwt != 1 || rbac != 0) {
			t.Fatalf("me 必须 1/0，got %d/%d", jwt, rbac)
		}
	}
	if publicN == 0 || jwtOnlyN == 0 {
		t.Fatalf("公开=%d JWT-only=%d，Registry 标志异常", publicN, jwtOnlyN)
	}
}
