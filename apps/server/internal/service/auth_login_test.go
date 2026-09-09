package service

import (
	"database/sql/driver"
	"strings"
	"testing"

	"golang.org/x/crypto/bcrypt"

	"gbnt/apps/server/internal/testutil"
	"gbnt/apps/server/pkg/jwtutil"
)

func TestLoginBumpsTokenVerAndSignsNewVersion(t *testing.T) {
	t.Parallel()
	hash, err := bcrypt.GenerateFromPassword([]byte("Passw0rd9"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	db := testutil.NewTransactionDB(t,
		testutil.QueryStep{
			Contains: "FROM `sys_users`",
			Columns:  []string{"id", "username", "password", "role_id", "token_ver", "status"},
			Rows:     [][]driver.Value{{int64(7), "worker", string(hash), int64(0), int64(3), int64(1)}},
			Check: func(query string, args []driver.NamedValue) {
				if !strings.Contains(query, "username") || !strings.Contains(query, "status") {
					t.Fatalf("登录查询条件不符: %s", query)
				}
				if len(args) < 1 || args[0].Value != "worker" {
					t.Fatalf("账号绑定错误: %v", args)
				}
			},
		},
		testutil.QueryStep{Kind: "begin"},
		testutil.QueryStep{Kind: "exec", Contains: "UPDATE `sys_users`", Check: func(query string, _ []driver.NamedValue) {
			if !strings.Contains(query, "token_ver") || !strings.Contains(query, "token_ver + 1") {
				t.Fatalf("登录必须递增 token_ver: %s", query)
			}
		}},
		testutil.QueryStep{Contains: "token_ver", Columns: []string{"token_ver"}, Rows: [][]driver.Value{{int64(4)}}},
		testutil.QueryStep{Kind: "commit"},
	)
	svc := &AuthService{DB: db, JWT: jwtutil.New("login-kick-test", 72, 24)}
	user, token, _, err := svc.Login("worker", "Passw0rd9")
	if err != nil {
		t.Fatal(err)
	}
	if user == nil || user.ID != 7 || user.TokenVer != 4 {
		t.Fatalf("应签发递增后的版本: %+v", user)
	}
	claims, err := svc.JWT.Parse(token)
	if err != nil {
		t.Fatal(err)
	}
	if claims.UserID != 7 || claims.TokenVer != 4 {
		t.Fatalf("JWT token_ver 必须与库一致: %+v", claims)
	}
}
