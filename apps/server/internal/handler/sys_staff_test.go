package handler

import (
	"database/sql/driver"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"gbnt/apps/server/internal/database"
	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/perm"
	"gbnt/apps/server/internal/service"
	"gbnt/apps/server/internal/testutil"
	"gbnt/apps/server/pkg/middleware"
)

func TestUserStatusHTTPContract(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, body := range []string{`{"status":0}`, `{"status":1}`} {
		db := testutil.NewTransactionDB(t,
			testutil.QueryStep{Kind: "begin"},
			testutil.QueryStep{Contains: "FOR UPDATE", Columns: []string{"id", "is_super_admin"}, Rows: [][]driver.Value{{int64(2), false}}},
			testutil.QueryStep{Kind: "exec", Contains: "UPDATE `sys_users`"},
			testutil.QueryStep{Kind: "commit"},
		)
		d := Deps{Sys: &service.SysService{DB: db}}
		r := gin.New()
		d.registerSysStaff(r.Group("/api"))
		w := httptest.NewRecorder()
		req := httptest.NewRequest("PUT", "/api/sys/users/2/status", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		r.ServeHTTP(w, req)
		if w.Code != 200 || !strings.Contains(w.Body.String(), `"data":null`) {
			t.Fatalf("%d %s", w.Code, w.Body.String())
		}
	}
}

func TestUserStatusRejectsMissingOrInvalidStatus(t *testing.T) {
	gin.SetMode(gin.TestMode)
	d := Deps{}
	r := gin.New()
	d.registerSysStaff(r.Group("/api"))
	for _, body := range []string{`{}`, `{"status":null}`, `{"status":2}`, `{"status":-1}`, `{"status":"0"}`, `{"status":false}`} {
		w := httptest.NewRecorder()
		req := httptest.NewRequest("PUT", "/api/sys/users/2/status", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		r.ServeHTTP(w, req)
		if w.Code != 400 {
			t.Fatalf("无效入参%s：%d %s", body, w.Code, w.Body.String())
		}
	}
}

func TestUserStatusKeepsExistingEditPermission(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, action := range []string{"view", "edit"} {
		t.Run(action, func(t *testing.T) {
			catalog := []model.SysAPI{}
			for index, entry := range perm.Registry {
				if entry.Module == "web.sys-staff" {
					api := entry.ToSysAPI()
					api.ID = uint64(index + 1)
					catalog = append(catalog, api)
				}
			}
			var grantID uint64
			for _, entry := range catalog {
				if (action == "view" && entry.Path == "/api/sys/users" && entry.Method == "GET") || (action == "edit" && entry.Path == "/api/sys/users/:id" && entry.Method == "PUT") {
					grantID = entry.ID
				}
			}
			db := testutil.NewQueryDB(t, testutil.QueryStep{Contains: "FROM `sys_role_apis`", Columns: []string{"api_id"}, Rows: [][]driver.Value{{int64(grantID)}}})
			permissions := perm.NewStaticService(nil, catalog)
			permissions.DB = db
			d := Deps{Perm: permissions}
			r := gin.New()
			r.Use(func(c *gin.Context) {
				c.Request = c.Request.WithContext(database.WithUser(c.Request.Context(), &database.UserInfo{ID: 2, RoleID: 2}))
			})
			r.Use(middleware.RBAC(permissions, true))
			d.registerSysStaff(r.Group("/api"))
			w := httptest.NewRecorder()
			req := httptest.NewRequest("PUT", "/api/sys/users/2/status", strings.NewReader(`{}`))
			req.Header.Set("Content-Type", "application/json")
			r.ServeHTTP(w, req)
			want := 403
			if action == "edit" {
				want = 400 // 已通过RBAC，到达必填校验；不需要给旧角色重新授权新接口。
			}
			if w.Code != want {
				t.Fatalf("%s权限返回%d，预期%d：%s", action, w.Code, want, w.Body.String())
			}
		})
	}
}
