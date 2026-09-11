package service

import (
	"context"
	"database/sql/driver"
	"errors"
	"strings"
	"testing"

	"gbnt/apps/server/internal/testutil"
)

func TestUpdateUserStatusOnlyChangesStatus(t *testing.T) {
	for _, status := range []int{0, 1} {
		t.Run(string(rune('0'+status)), func(t *testing.T) {
			db := testutil.NewTransactionDB(t,
				testutil.QueryStep{Kind: "begin"},
				testutil.QueryStep{Contains: "FOR UPDATE", Columns: []string{"id", "is_super_admin"}, Rows: [][]driver.Value{{int64(2), false}}},
				testutil.QueryStep{Kind: "exec", Contains: "UPDATE `sys_users` SET `status`", Check: func(query string, args []driver.NamedValue) {
					for _, field := range []string{"name", "phone", "org_id", "role_id", "password", "token_ver"} {
						if strings.Contains(query, "`"+field+"`") {
							t.Fatalf("状态更新不应写入%s：%s", field, query)
						}
					}
					if args[0].Value != int64(status) {
						t.Fatalf("状态参数错误：%v", args)
					}
				}},
				testutil.QueryStep{Kind: "commit"},
			)
			if err := (&SysService{DB: db}).UpdateUserStatus(context.Background(), 2, UserStatusInput{Status: &status}); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestUpdateUserStatusRejectsInvalidInputBeforeDB(t *testing.T) {
	invalid := 2
	for _, status := range []*int{nil, &invalid} {
		if err := (&SysService{}).UpdateUserStatus(context.Background(), 2, UserStatusInput{Status: status}); err == nil {
			t.Fatal("无效状态应被拒绝")
		}
	}
}

func TestUpdateUserStatusProtectsSuperAdmin(t *testing.T) {
	db := testutil.NewTransactionDB(t,
		testutil.QueryStep{Kind: "begin"},
		testutil.QueryStep{Contains: "FOR UPDATE", Columns: []string{"id", "is_super_admin"}, Rows: [][]driver.Value{{int64(1), true}}},
		testutil.QueryStep{Kind: "rollback"},
	)
	status := 0
	if err := (&SysService{DB: db}).UpdateUserStatus(context.Background(), 1, UserStatusInput{Status: &status}); err == nil || !strings.Contains(err.Error(), "超级管理员") {
		t.Fatalf("未保护超级管理员：%v", err)
	}
}

func TestUpdateUserStatusRollsBackFailedWrite(t *testing.T) {
	failure := errors.New("状态写入失败")
	db := testutil.NewTransactionDB(t,
		testutil.QueryStep{Kind: "begin"},
		testutil.QueryStep{Contains: "FOR UPDATE", Columns: []string{"id", "is_super_admin"}, Rows: [][]driver.Value{{int64(2), false}}},
		testutil.QueryStep{Kind: "exec", Contains: "UPDATE `sys_users`", Err: failure},
		testutil.QueryStep{Kind: "rollback"},
	)
	status := 0
	if err := (&SysService{DB: db}).UpdateUserStatus(context.Background(), 2, UserStatusInput{Status: &status}); !errors.Is(err, failure) {
		t.Fatalf("写入错误未透传：%v", err)
	}
}
