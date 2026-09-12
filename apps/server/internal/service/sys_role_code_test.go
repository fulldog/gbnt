package service

import (
	"context"
	"database/sql/driver"
	"strings"
	"testing"

	"github.com/go-sql-driver/mysql"

	"gbnt/apps/server/internal/testutil"
)

func TestRoleCreateIgnoresClientCodeAndGeneratesIdentity(t *testing.T) {
	code := " Test_Config "
	db := testutil.NewTransactionDB(t, testutil.QueryStep{Kind: "begin"},
		testutil.QueryStep{Kind: "exec", Contains: "INSERT INTO `sys_roles`", InsertID: 37, Check: func(_ string, args []driver.NamedValue) {
			if args[0].Value != "未分配职责" {
				t.Errorf("名称异常: %v", args)
			}
			var ident string
			for _, arg := range args {
				if s, ok := arg.Value.(string); ok && strings.HasPrefix(s, "role-") {
					ident = s
				}
			}
			if ident == "" || ident == "test_config" {
				t.Errorf("应忽略客户端code并生成role-前缀: %v", args)
			}
		}}, testutil.QueryStep{Kind: "commit"})
	svc := SysService{DB: db}
	role, err := svc.CreateRole(context.Background(), CreateRoleInput{Code: &code, APIIDs: []uint64{}})
	if err != nil || role.ID != 37 || role.Code == nil || !strings.HasPrefix(*role.Code, "role-") || *role.Code == "test_config" || role.Name != "未分配职责" {
		t.Fatalf("%+v %v", role, err)
	}
}

func TestRoleCodeClientValuesAreIgnored(t *testing.T) {
	db := testutil.NewTransactionDB(t, testutil.QueryStep{Kind: "begin"}, roleRecordStep(), testutil.QueryStep{Kind: "commit"})
	code := " NEW-Test "
	role, err := (&SysService{DB: db}).UpdateRole(context.Background(), 7, UpdateRoleInput{Code: &code})
	if err != nil || role.Code == nil || *role.Code != "original-code" {
		t.Fatalf("更新应忽略code: %+v %v", role, err)
	}
}

func TestDuplicateGeneratedRoleCodeRollsBackCreate(t *testing.T) {
	db := testutil.NewTransactionDB(t, testutil.QueryStep{Kind: "begin"}, testutil.QueryStep{Kind: "exec", Contains: "INSERT INTO `sys_roles`", Err: &mysql.MySQLError{Number: 1062}}, testutil.QueryStep{Kind: "rollback"})
	svc := SysService{DB: db}
	if _, err := svc.CreateRole(context.Background(), CreateRoleInput{APIIDs: []uint64{}}); err == nil || !strings.Contains(err.Error(), "角色ID已存在") {
		t.Fatal(err)
	}
}
