package service

import (
	"context"
	"database/sql/driver"
	"errors"
	"strings"
	"testing"

	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/perm"
	"gbnt/apps/server/internal/testutil"
)

func TestRoleNameFromTopLevelDuties(t *testing.T) {
	for _, tc := range []struct {
		name    string
		modules []string
		want    string
	}{
		{"同顶级去重", []string{"web.sys-org", "web.sys-staff"}, "系统配置员"},
		{"基础权限不污染名称", []string{"web.workbench", "web.auth", "web.sys-org"}, "系统配置员"},
		{"跨顶级菜单排序", []string{"web.sys-org", "web.ledger-survey", "web.rectify"}, "专项整改员、汇总管理员、系统配置员"},
		{"仅工作台", []string{"web.workbench", "web.auth"}, "工作台查看员"},
		{"仅登录", []string{"web.auth"}, "未分配职责"},
		{"空授权", nil, "未分配职责"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var apis []model.SysAPI
			for _, module := range tc.modules {
				apis = append(apis, model.SysAPI{Module: module})
			}
			name, err := roleNameForAPIs(apis)
			if err != nil || name != tc.want {
				t.Fatalf("名称=%q, err=%v", name, err)
			}
		})
	}
	if _, err := roleNameForAPIs([]model.SysAPI{{Module: "web.unknown"}}); err == nil {
		t.Fatal("未知职责不可静默遗漏")
	}
}

func roleCatalogStep() testutil.QueryStep {
	return testutil.QueryStep{Contains: "FROM `sys_apis`", Columns: []string{"id", "module", "enabled", "is_rbac"}, Rows: [][]driver.Value{{int64(10), "web.sys-org", true, true}}}
}

func roleRecordStep() testutil.QueryStep {
	return testutil.QueryStep{Contains: "FOR UPDATE", Columns: []string{"id", "name", "desc", "status", "code"}, Rows: [][]driver.Value{{int64(7), "原职责名称", "原备注", int64(1), "original-code"}}}
}

func TestCreateRoleAndGrantsShareTransaction(t *testing.T) {
	for _, fail := range []bool{false, true} {
		t.Run(map[bool]string{false: "全部提交", true: "授权失败回滚"}[fail], func(t *testing.T) {
			grant := testutil.QueryStep{Kind: "exec", Contains: "INSERT INTO `sys_role_apis`", Check: func(query string, args []driver.NamedValue) {
				if strings.Count(query, "(?,") != 1 {
					t.Errorf("重复权限未去重: %s", query)
				}
			}}
			end := "commit"
			if fail {
				grant.Err = errors.New("授权写入失败")
				end = "rollback"
			}
			db := testutil.NewTransactionDB(t,
				testutil.QueryStep{Kind: "begin"}, roleCatalogStep(),
				testutil.QueryStep{Kind: "exec", Contains: "INSERT INTO `sys_roles`", InsertID: 7, Check: func(_ string, args []driver.NamedValue) {
					if args[0].Value != "系统配置员" || args[1].Value != "职责备注" {
						t.Errorf("未使用自动名称或未整理备注: %v", args)
					}
				}}, grant, testutil.QueryStep{Kind: end},
			)
			svc := SysService{DB: db}
			role, err := svc.CreateRole(context.Background(), CreateRoleInput{Name: "不应采用", Desc: " 职责备注 ", APIIDs: []uint64{10, 10}})
			if fail {
				if err == nil || role != nil {
					t.Fatalf("失败仍返回成功: %+v %v", role, err)
				}
				return
			}
			if err != nil || role.ID != 7 || role.Status != 1 || role.Name != "系统配置员" {
				t.Fatalf("%+v %v", role, err)
			}
		})
	}
}

func TestRoleCreateMissingAndEmptyPermissionsDiffer(t *testing.T) {
	for _, tc := range []struct {
		ids  []uint64
		want string
	}{{nil, "旧角色名称"}, {[]uint64{}, "未分配职责"}} {
		t.Run(tc.want, func(t *testing.T) {
			db := testutil.NewTransactionDB(t, testutil.QueryStep{Kind: "begin"}, testutil.QueryStep{Kind: "exec", Contains: "INSERT INTO `sys_roles`", InsertID: 8}, testutil.QueryStep{Kind: "commit"})
			svc := SysService{DB: db}
			role, err := svc.CreateRole(context.Background(), CreateRoleInput{Name: "旧角色名称", APIIDs: tc.ids})
			if err != nil || role.Name != tc.want || role.Code == nil || !strings.HasPrefix(*role.Code, "role-") {
				t.Fatalf("%+v %v", role, err)
			}
		})
	}
}

func TestRoleStatusPatchDoesNotOverwriteNameOrGrants(t *testing.T) {
	db := testutil.NewTransactionDB(t, testutil.QueryStep{Kind: "begin"}, roleRecordStep(), testutil.QueryStep{Kind: "exec", Contains: "UPDATE `sys_roles`", Check: func(query string, _ []driver.NamedValue) {
		if strings.Contains(query, "`name`=") || strings.Contains(query, "`desc`=") || strings.Contains(query, "`code`=") {
			t.Errorf("状态更新覆盖了其他字段: %s", query)
		}
	}}, testutil.QueryStep{Kind: "commit"})
	status := 0
	svc := SysService{DB: db}
	role, err := svc.UpdateRole(context.Background(), 7, UpdateRoleInput{Status: &status})
	if err != nil || role.Name != "原职责名称" || role.Desc != "原备注" || role.Status != 0 || role.Code == nil || *role.Code != "original-code" {
		t.Fatalf("%+v %v", role, err)
	}
}

func TestRoleEditPreservesPartialAndUnknownGrantsAndInvalidatesCache(t *testing.T) {
	permissions := perm.NewStaticService(nil, nil)
	permissions.Cache.Set("perm:role:7", "cached", 0)
	db := testutil.NewTransactionDB(t, testutil.QueryStep{Kind: "begin"}, roleRecordStep(),
		testutil.QueryStep{Contains: "FROM `sys_role_apis`", Columns: []string{"api_id"}, Rows: [][]driver.Value{{int64(10)}, {int64(999)}}},
		roleCatalogStep(), testutil.QueryStep{Kind: "exec", Contains: "DELETE FROM `sys_role_apis`"},
		testutil.QueryStep{Kind: "exec", Contains: "INSERT INTO `sys_role_apis`"},
		testutil.QueryStep{Kind: "exec", Contains: "UPDATE `sys_roles`", Check: func(query string, _ []driver.NamedValue) {
			if strings.Contains(query, "`name`=") {
				t.Errorf("修改授权重命名: %s", query)
			}
		}}, testutil.QueryStep{Kind: "commit"},
	)
	desc := "新备注"
	svc := SysService{DB: db, Perm: permissions}
	role, err := svc.UpdateRole(context.Background(), 7, UpdateRoleInput{Desc: &desc, APIIDs: []uint64{10, 999}})
	if err != nil || role.Name != "原职责名称" {
		t.Fatalf("%+v %v", role, err)
	}
	if _, ok := permissions.Cache.Get("perm:role:7"); ok {
		t.Fatal("提交后缓存未失效")
	}
}

func TestRoleEditWriteFailureRollsBackAndKeepsCache(t *testing.T) {
	permissions := perm.NewStaticService(nil, nil)
	permissions.Cache.Set("perm:role:7", "cached", 0)
	db := testutil.NewTransactionDB(t, testutil.QueryStep{Kind: "begin"}, roleRecordStep(),
		testutil.QueryStep{Contains: "FROM `sys_role_apis`", Columns: []string{"api_id"}},
		roleCatalogStep(), testutil.QueryStep{Kind: "exec", Contains: "DELETE FROM `sys_role_apis`"},
		testutil.QueryStep{Kind: "exec", Contains: "INSERT INTO `sys_role_apis`", Err: errors.New("关联写入失败")},
		testutil.QueryStep{Kind: "rollback"},
	)
	desc := "不能部分保存"
	svc := SysService{DB: db, Perm: permissions}
	role, err := svc.UpdateRole(context.Background(), 7, UpdateRoleInput{Desc: &desc, APIIDs: []uint64{10}})
	if err == nil || role != nil {
		t.Fatal("应整体失败")
	}
	if _, ok := permissions.Cache.Get("perm:role:7"); !ok {
		t.Fatal("未提交就清理权限缓存")
	}
}

func TestRoleExplicitEmptyPermissionsClearGrants(t *testing.T) {
	db := testutil.NewTransactionDB(t, testutil.QueryStep{Kind: "begin"}, roleRecordStep(),
		testutil.QueryStep{Contains: "FROM `sys_role_apis`", Columns: []string{"api_id"}, Rows: [][]driver.Value{{int64(10)}}},
		testutil.QueryStep{Kind: "exec", Contains: "DELETE FROM `sys_role_apis`"}, testutil.QueryStep{Kind: "commit"})
	svc := SysService{DB: db}
	if _, err := svc.UpdateRole(context.Background(), 7, UpdateRoleInput{APIIDs: []uint64{}}); err != nil {
		t.Fatal(err)
	}
}

func TestNewInvalidRolePermissionsAreRejected(t *testing.T) {
	for _, tc := range []struct {
		name string
		rows [][]driver.Value
	}{
		{"不存在", nil}, {"停用", [][]driver.Value{{int64(10), "web.sys-org", false, true}}}, {"无需授权", [][]driver.Value{{int64(10), "web.session", true, false}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			step := roleCatalogStep()
			step.Rows = tc.rows
			db := testutil.NewTransactionDB(t, testutil.QueryStep{Kind: "begin"}, step, testutil.QueryStep{Kind: "rollback"})
			svc := SysService{DB: db}
			if _, err := svc.CreateRole(context.Background(), CreateRoleInput{APIIDs: []uint64{10}}); err == nil {
				t.Fatal("无效授权应拒绝")
			}
		})
	}
}

func TestRoleIdOneIsOrdinary(t *testing.T) {
	db := testutil.NewTransactionDB(t, testutil.QueryStep{Kind: "begin"},
		testutil.QueryStep{Contains: "FOR UPDATE", Columns: []string{"id", "name", "desc", "status", "code"}, Rows: [][]driver.Value{{int64(1), "历史角色", "备注", int64(1), "role-1"}}},
		testutil.QueryStep{Kind: "commit"})
	svc := SysService{DB: db}
	role, err := svc.UpdateRole(context.Background(), 1, UpdateRoleInput{})
	if err != nil || role == nil || role.ID != 1 {
		t.Fatalf("id=1 应可更新: %+v %v", role, err)
	}
}

func TestRoleDeleteProtectionsStillApply(t *testing.T) {
	svc := SysService{DB: testutil.NewTransactionDB(t,
		testutil.QueryStep{Contains: "FROM `sys_users`", Columns: []string{"count"}, Rows: [][]driver.Value{{int64(0)}}},
		testutil.QueryStep{Kind: "begin"},
		testutil.QueryStep{Kind: "exec", Contains: "UPDATE `sys_roles`"},
		testutil.QueryStep{Kind: "commit"},
	)}
	if err := svc.DeleteRole(context.Background(), 1); err != nil {
		t.Fatalf("无绑定用户时应可删除 id=1: %v", err)
	}
	svc.DB = testutil.NewQueryDB(t, testutil.QueryStep{Contains: "FROM `sys_users`", Columns: []string{"count"}, Rows: [][]driver.Value{{int64(1)}}})
	if err := svc.DeleteRole(context.Background(), 7); err == nil || !strings.Contains(err.Error(), "仍有用户绑定") {
		t.Fatalf("%v", err)
	}
}
