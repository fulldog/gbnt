package service

import (
	"context"
	"database/sql/driver"
	"strings"
	"testing"

	"gbnt/apps/server/internal/testutil"
	"golang.org/x/crypto/bcrypt"
)

func bcryptArgMatches(t *testing.T, args []driver.NamedValue, plain string) {
	t.Helper()
	for _, arg := range args {
		hash, ok := arg.Value.(string)
		if !ok || !strings.HasPrefix(hash, "$2") {
			continue
		}
		if bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain)) != nil {
			t.Errorf("密码哈希不是账号明文 %q", plain)
		}
		return
	}
	t.Error("写入缺少 bcrypt 密码哈希")
}

func TestCreateUserPasswordDefaultsToUsername(t *testing.T) {
	db := testutil.NewTransactionDB(t,
		testutil.QueryStep{Kind: "begin"},
		testutil.QueryStep{Kind: "exec", Contains: "INSERT INTO `sys_users`", InsertID: 2, Check: func(_ string, args []driver.NamedValue) {
			bcryptArgMatches(t, args, "new_worker")
		}},
		testutil.QueryStep{Kind: "commit"},
	)
	user, err := (&SysService{DB: db}).CreateUser(context.Background(), UserInput{Username: "new_worker", OrgID: 3, RoleID: 2})
	if err != nil || user == nil || user.Username != "new_worker" {
		t.Fatalf("空密码新增失败: user=%+v err=%v", user, err)
	}
}

func TestResetPasswordEqualsUsername(t *testing.T) {
	db := testutil.NewTransactionDB(t,
		testutil.QueryStep{Contains: "FROM `sys_users`", Columns: []string{"id", "username", "org_id", "role_id", "is_super_admin"}, Rows: [][]driver.Value{{int64(2), "worker", int64(3), int64(2), false}}},
		testutil.QueryStep{Kind: "begin"},
		testutil.QueryStep{Kind: "exec", Contains: "UPDATE `sys_users`", Check: func(query string, args []driver.NamedValue) {
			if !strings.Contains(query, "`password`") {
				t.Errorf("重置未写入密码: %s", query)
			}
			bcryptArgMatches(t, args, "worker")
		}},
		testutil.QueryStep{Kind: "commit"},
	)
	plain, err := (&SysService{DB: db}).ResetPassword(context.Background(), 2)
	if err != nil || plain != "worker" {
		t.Fatalf("重置明文应为账号: %q err=%v", plain, err)
	}
}
