package service

import (
	"context"
	"database/sql/driver"
	"errors"
	"testing"

	"gbnt/apps/server/internal/database"
	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/testutil"
)

func scopeOrgRows() testutil.QueryStep {
	return testutil.QueryStep{
		Contains: "FROM `sys_orgs`",
		Columns:  []string{"id", "parent_id"},
		Rows: [][]driver.Value{
			{int64(1), int64(0)},
			{int64(2), int64(1)},
			{int64(3), int64(2)},
			{int64(4), int64(3)},
			{int64(5), int64(3)},
			{int64(6), int64(2)},
		},
	}
}

func TestResolveOrgScopeUsesOnlyCurrentOrganizationSubtree(t *testing.T) {
	db := testutil.NewQueryDB(t, scopeOrgRows())
	ctx := database.WithUser(context.Background(), &database.UserInfo{ID: 7, OrgID: 3})
	scope, err := ResolveOrgScope(ctx, db)
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []uint64{3, 4, 5} {
		if !scope.Allows(id) {
			t.Errorf("组织 %d 应在街道范围内", id)
		}
	}
	for _, id := range []uint64{0, 1, 2, 6} {
		if scope.Allows(id) {
			t.Errorf("组织 %d 不应在街道范围内", id)
		}
	}
}

func TestResolveOrgScopeDoesNotTreatEmptyOrganizationAsGlobal(t *testing.T) {
	ctx := database.WithUser(context.Background(), &database.UserInfo{ID: 7})
	scope, err := ResolveOrgScope(ctx, testutil.NewQueryDB(t))
	if err != nil {
		t.Fatal(err)
	}
	if scope.All || scope.Allows(1) {
		t.Fatalf("未挂组织的普通账号不能获得全局范围: %+v", scope)
	}
}

func TestResolveOrgScopeKeepsSuperAdminGlobalButRejectsZeroTarget(t *testing.T) {
	ctx := database.WithUser(context.Background(), &database.UserInfo{ID: 1, IsSuperAdmin: true})
	scope, err := ResolveOrgScope(ctx, testutil.NewQueryDB(t))
	if err != nil {
		t.Fatal(err)
	}
	if !scope.Allows(999) || scope.Allows(0) {
		t.Fatalf("超级管理员范围异常: %+v", scope)
	}
}

func TestResolveVisibleOrgScopeUsesOrganizationSubtree(t *testing.T) {
	db := testutil.NewQueryDB(t, scopeOrgRows())
	ctx := database.WithUser(context.Background(), &database.UserInfo{ID: 7, OrgID: 3})
	scope, err := resolveVisibleOrgScope(ctx, db)
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []uint64{3, 4, 5} {
		if !scope.Allows(id) {
			t.Errorf("组织 %d 应在可见范围内", id)
		}
	}
	for _, id := range []uint64{1, 2, 6} {
		if scope.Allows(id) {
			t.Errorf("组织 %d 不应在可见范围内", id)
		}
	}
}

func TestResolveVisibleOrgScopeTreatsZeroOrganizationAsGlobal(t *testing.T) {
	ctx := database.WithUser(context.Background(), &database.UserInfo{ID: 7, OrgID: 0})
	scope, err := resolveVisibleOrgScope(ctx, testutil.NewQueryDB(t))
	if err != nil {
		t.Fatal(err)
	}
	if !scope.All || !scope.Allows(999) {
		t.Fatalf("org_id=0 应全部可见: %+v", scope)
	}
}

func TestUserOrganizationScopeRejectsSiblingOrganization(t *testing.T) {
	db := testutil.NewQueryDB(t,
		scopeOrgRows(),
		testutil.QueryStep{Contains: "FROM `sys_users`", Columns: []string{"id", "org_id"}, Rows: [][]driver.Value{{int64(9), int64(6)}}},
	)
	ctx := database.WithUser(context.Background(), &database.UserInfo{ID: 7, OrgID: 3})
	if err := requireUserOrgScopeIfAuthenticated(ctx, db, 9); !errors.Is(err, ErrOrgScopeForbidden) {
		t.Fatalf("兄弟组织人员应被拒绝: %v", err)
	}
}

func TestDeleteOrgRejectsCurrentAndSiblingOrganizationsBeforeMutation(t *testing.T) {
	for name, target := range map[string]struct {
		id  uint64
		err error
	}{
		"current": {id: 3},
		"sibling": {id: 6, err: ErrOrgScopeForbidden},
	} {
		t.Run(name, func(t *testing.T) {
			db := testutil.NewQueryDB(t, scopeOrgRows())
			ctx := database.WithUser(context.Background(), &database.UserInfo{ID: 7, OrgID: 3})
			err := (&SysService{DB: db}).DeleteOrg(ctx, target.id)
			if target.err != nil {
				if !errors.Is(err, target.err) {
					t.Fatalf("兄弟组织应在写入前被拒绝: %v", err)
				}
				return
			}
			if err == nil || err.Error() != "不能删除当前账号所属组织" {
				t.Fatalf("当前所属组织应在写入前被拒绝: %v", err)
			}
		})
	}
}

func TestScopeOrgTreeKeepsAncestorPathAndDropsSiblings(t *testing.T) {
	tree := BuildOrgTree([]model.SysOrg{
		{ID: 1, ParentID: 0, Name: "根", Type: model.OrgTypeRoot},
		{ID: 2, ParentID: 1, Name: "区", Type: model.OrgTypeDistrict},
		{ID: 3, ParentID: 2, Name: "甲街道", Type: model.OrgTypeStreet},
		{ID: 4, ParentID: 3, Name: "甲村", Type: model.OrgTypeVillage},
		{ID: 5, ParentID: 2, Name: "乙街道", Type: model.OrgTypeStreet},
	})
	scope := &OrgScope{RootID: 3, allowed: map[uint64]struct{}{3: {}, 4: {}}}
	out := scopeOrgTree(tree, scope)
	if len(out) != 1 || len(out[0].Children) != 1 || len(out[0].Children[0].Children) != 1 {
		t.Fatalf("祖先路径或范围根丢失: %+v", out)
	}
	street := out[0].Children[0].Children[0]
	if out[0].WithinOrgScope || out[0].Children[0].WithinOrgScope || !street.WithinOrgScope || len(street.Children) != 1 || street.Children[0].ID != 4 {
		t.Fatalf("范围标记或兄弟裁剪错误: %+v", out)
	}
}
