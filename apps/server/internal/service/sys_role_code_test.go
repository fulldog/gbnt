package service

import (
	"context"
	"database/sql/driver"
	"strings"
	"testing"

	"github.com/go-sql-driver/mysql"

	"gbnt/apps/server/internal/testutil"
)

func TestRoleCodeCreateNormalizesAndKeepsNumericIdentity(t *testing.T) {
	code := " Test_Config "
	db := testutil.NewTransactionDB(t, testutil.QueryStep{Kind: "begin"},
		testutil.QueryStep{Kind: "exec", Contains: "INSERT INTO `sys_roles`", InsertID: 37, Check: func(_ string, args []driver.NamedValue) {
			if args[0].Value != "未分配职责" || args[3].Value != "test_config" {
				t.Errorf("名称与标识混用: %v", args)
			}
		}}, testutil.QueryStep{Kind: "commit"})
	svc := SysService{DB: db}
	role, err := svc.CreateRole(context.Background(), CreateRoleInput{Code: &code, APIIDs: []uint64{}})
	if err != nil || role.ID != 37 || role.Code == nil || *role.Code != "test_config" || role.Name != "未分配职责" {
		t.Fatalf("%+v %v", role, err)
	}
}

func TestRoleCodeExplicitInvalidValuesDoNotWrite(t *testing.T) {
	svc := SysService{}
	for _, code := range []string{"", "123", "角色", "bad.name", strings.Repeat("a", 65)} {
		if _, err := svc.CreateRole(context.Background(), CreateRoleInput{Code: &code}); err == nil {
			t.Fatal("新增应拒绝", code)
		}
		if _, err := svc.UpdateRole(context.Background(), 7, UpdateRoleInput{Code: &code}); err == nil {
			t.Fatal("编辑应拒绝", code)
		}
	}
}

func TestDuplicateRoleCodeRollsBackCreateAndCombinedEdit(t *testing.T) {
	code := "admin"
	db := testutil.NewTransactionDB(t, testutil.QueryStep{Kind: "begin"}, testutil.QueryStep{Kind: "exec", Contains: "INSERT INTO `sys_roles`", Err: &mysql.MySQLError{Number: 1062}}, testutil.QueryStep{Kind: "rollback"})
	svc := SysService{DB: db}
	if _, err := svc.CreateRole(context.Background(), CreateRoleInput{Code: &code, APIIDs: []uint64{}}); err == nil || !strings.Contains(err.Error(), "角色ID已存在") {
		t.Fatal(err)
	}
	db = testutil.NewTransactionDB(t, testutil.QueryStep{Kind: "begin"}, roleRecordStep(),
		testutil.QueryStep{Contains: "FROM `sys_role_apis`", Columns: []string{"api_id"}},
		testutil.QueryStep{Kind: "exec", Contains: "DELETE FROM `sys_role_apis`"},
		testutil.QueryStep{Kind: "exec", Contains: "UPDATE `sys_roles`", Err: &mysql.MySQLError{Number: 1062}}, testutil.QueryStep{Kind: "rollback"})
	svc.DB = db
	if _, err := svc.UpdateRole(context.Background(), 7, UpdateRoleInput{Code: &code, APIIDs: []uint64{}}); err == nil || !strings.Contains(err.Error(), "角色ID已存在") {
		t.Fatal(err)
	}
}

func TestRoleCodeEditOnlyChangesCode(t *testing.T) {
	code := " NEW-Test "
	db := testutil.NewTransactionDB(t, testutil.QueryStep{Kind: "begin"}, roleRecordStep(), testutil.QueryStep{Kind: "exec", Contains: "UPDATE `sys_roles`", Check: func(query string, args []driver.NamedValue) {
		if !strings.Contains(query, "`code`=?") || strings.Contains(query, "`name`=") || strings.Contains(query, "SET `id`=") || args[0].Value != "new-test" {
			t.Errorf("改号错误: %s %v", query, args)
		}
	}}, testutil.QueryStep{Kind: "commit"})
	svc := SysService{DB: db}
	role, err := svc.UpdateRole(context.Background(), 7, UpdateRoleInput{Code: &code})
	if err != nil || role.ID != 7 || role.Name != "原职责名称" || role.Code == nil || *role.Code != "new-test" {
		t.Fatalf("%+v %v", role, err)
	}
}
