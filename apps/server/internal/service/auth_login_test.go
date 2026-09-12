package service

import (
	"database/sql/driver"
	"errors"
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
			if !strings.Contains(query, "`token_ver`") || !strings.Contains(query, "token_ver + 1") || strings.Contains(query, "app_token_ver") {
				t.Fatalf("后台登录只递增 token_ver: %s", query)
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
	if claims.UserID != 7 || claims.TokenVer != 4 || claims.ClientKind() != jwtutil.ClientWeb {
		t.Fatalf("JWT token_ver 必须与库一致: %+v", claims)
	}
}

func TestLoginMiniappBumpsAppTokenVerOnly(t *testing.T) {
	t.Parallel()
	hash, err := bcrypt.GenerateFromPassword([]byte("Passw0rd9"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	db := testutil.NewTransactionDB(t,
		testutil.QueryStep{
			Contains: "FROM `sys_users`",
			Columns:  []string{"id", "username", "password", "role_id", "token_ver", "app_token_ver", "status", "is_super_admin"},
			Rows:     [][]driver.Value{{int64(7), "worker", string(hash), int64(0), int64(3), int64(11), int64(1), false}},
		},
		testutil.QueryStep{Kind: "begin"},
		testutil.QueryStep{Kind: "exec", Contains: "UPDATE `sys_users`", Check: func(query string, _ []driver.NamedValue) {
			if !strings.Contains(query, "app_token_ver") || !strings.Contains(query, "app_token_ver + 1") || strings.Contains(query, "`token_ver`") {
				t.Fatalf("小程序登录只递增 app_token_ver: %s", query)
			}
		}},
		testutil.QueryStep{Contains: "app_token_ver", Columns: []string{"app_token_ver"}, Rows: [][]driver.Value{{int64(12)}}},
		testutil.QueryStep{Kind: "commit"},
	)
	svc := &AuthService{DB: db, JWT: jwtutil.New("miniapp-kick-test", 72, 24)}
	user, token, _, err := svc.LoginMiniapp("worker", "Passw0rd9")
	if err != nil {
		t.Fatal(err)
	}
	if user == nil || user.ID != 7 || user.AppTokenVer != 12 || user.TokenVer != 3 {
		t.Fatalf("应只递增小程序版本: %+v", user)
	}
	claims, err := svc.JWT.Parse(token)
	if err != nil {
		t.Fatal(err)
	}
	if claims.UserID != 7 || claims.TokenVer != 12 || claims.ClientKind() != jwtutil.ClientApp {
		t.Fatalf("小程序 JWT 须带 app 端版本: %+v", claims)
	}
}

func TestLoginMiniappRejectsSuperAdminWithoutBump(t *testing.T) {
	t.Parallel()
	hash, err := bcrypt.GenerateFromPassword([]byte("admin"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	db := testutil.NewQueryDB(t, testutil.QueryStep{
		Contains: "FROM `sys_users`",
		Columns:  []string{"id", "username", "password", "role_id", "token_ver", "status", "is_super_admin"},
		Rows:     [][]driver.Value{{int64(1), "admin", string(hash), int64(0), int64(3), int64(1), true}},
	})
	svc := &AuthService{DB: db, JWT: jwtutil.New("miniapp-super-test", 72, 24)}
	user, token, _, err := svc.LoginMiniapp("admin", "admin")
	if !errors.Is(err, ErrMiniappSuperAdmin) {
		t.Fatalf("超管登录小程序应拒绝: user=%+v token=%q err=%v", user, token, err)
	}
	if token != "" {
		t.Fatal("拒绝时不得签发 token")
	}
}
