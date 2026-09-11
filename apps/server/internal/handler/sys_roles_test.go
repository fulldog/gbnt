package handler

import (
	"database/sql/driver"
	"encoding/json"
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

func TestCombinedRoleCreationRequiresExistingGrantPermission(t *testing.T) {
	gin.SetMode(gin.TestMode)
	catalog := []model.SysAPI{
		{Base: model.Base{ID: 10}, Module: "web.sys-roles", Action: "create", Method: "POST", Path: "/api/sys/roles", Enabled: true, IsJWT: true, IsRBAC: true},
		{Base: model.Base{ID: 11}, Module: "web.sys-roles", Action: "edit", Method: "PUT", Path: "/api/sys/roles/:id/apis", Enabled: true, IsJWT: true, IsRBAC: true},
	}
	db := testutil.NewQueryDB(t, testutil.QueryStep{Contains: "FROM `sys_role_apis`", Columns: []string{"api_id"}, Rows: [][]driver.Value{{int64(10)}}})
	permissions := perm.NewStaticService(nil, catalog)
	permissions.DB = db
	d := Deps{Sys: &service.SysService{DB: db, Perm: permissions}, Perm: permissions}
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Request = c.Request.WithContext(database.WithUser(c.Request.Context(), &database.UserInfo{ID: 2, RoleID: 2}))
	})
	r.Use(middleware.RBAC(permissions, true))
	d.registerSysRoles(r.Group("/api"))
	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/api/sys/roles", strings.NewReader(`{"desc":"不能绕过授权","api_ids":[]}`))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	if w.Code != 403 || !strings.Contains(w.Body.String(), "角色修改权限") {
		t.Fatalf("%d %s", w.Code, w.Body.String())
	}
}

func TestRoleCatalogAddsDutyWithoutChangingArrayContract(t *testing.T) {
	gin.SetMode(gin.TestMode)
	permissions := perm.NewStaticService(nil, []model.SysAPI{{Base: model.Base{ID: 10}, Module: "web.sys-org", Action: "view", Enabled: true, IsRBAC: true}})
	d := Deps{Sys: &service.SysService{Perm: permissions}}
	r := gin.New()
	d.registerSysRoles(r.Group("/api"))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("GET", "/api/sys/apis", nil))
	var response struct {
		Data []service.RoleCatalogAPI `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if w.Code != 200 || len(response.Data) != 1 || response.Data[0].ID != 10 || response.Data[0].Duty == nil || response.Data[0].Duty.RoleName != "系统配置员" || !response.Data[0].RoleCodeSupported {
		t.Fatalf("契约异常: %s", w.Body.String())
	}
}

func TestRoleCodeHTTPContractKeepsInternalIDSeparate(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.NewTransactionDB(t,
		testutil.QueryStep{Kind: "begin"},
		testutil.QueryStep{Kind: "exec", Contains: "INSERT INTO `sys_roles`", InsertID: 37},
		testutil.QueryStep{Kind: "commit"},
		testutil.QueryStep{Kind: "begin"},
		testutil.QueryStep{Contains: "FOR UPDATE", Columns: []string{"id", "code", "name", "status"}, Rows: [][]driver.Value{{int64(37), "test", "未分配职责", int64(1)}}},
		testutil.QueryStep{Kind: "exec", Contains: "UPDATE `sys_roles`"},
		testutil.QueryStep{Kind: "commit"},
	)
	d := Deps{Sys: &service.SysService{DB: db}}
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Request = c.Request.WithContext(database.WithUser(c.Request.Context(), &database.UserInfo{ID: 1, IsSuperAdmin: true}))
	})
	d.registerSysRoles(r.Group("/api"))
	for _, tc := range []struct{ method, url, body, code string }{
		{"POST", "/api/sys/roles", `{"code":" Test ","api_ids":[]}`, "test"},
		{"PUT", "/api/sys/roles/37", `{"code":"Test-Edit"}`, "test-edit"},
	} {
		w := httptest.NewRecorder()
		req := httptest.NewRequest(tc.method, tc.url, strings.NewReader(tc.body))
		req.Header.Set("Content-Type", "application/json")
		r.ServeHTTP(w, req)
		var response struct {
			Data model.SysRole `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
			t.Fatal(err)
		}
		if w.Code != 200 || response.Data.ID != 37 || response.Data.Code == nil || *response.Data.Code != tc.code || response.Data.Name != "未分配职责" {
			t.Fatalf("契约异常: %s", w.Body.String())
		}
	}
}
