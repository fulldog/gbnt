package handler

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/perm"
	"gbnt/apps/server/internal/service"
	"gbnt/apps/server/internal/testutil"
	"gbnt/apps/server/pkg/middleware"
	"github.com/gin-gonic/gin"
)

func TestAdminAndAppDetailHTTPIncludeNames(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, admin := range []bool{false, true} {
		name, path := "小程序", "/api/app/issues/1"
		if admin {
			name, path = "管理端", "/api/issues/1"
		}
		t.Run(name, func(t *testing.T) {
			steps := []testutil.QueryStep{
				{Contains: "FROM `issues`", Columns: []string{"id", "issue_key", "type", "type_ext", "report_user_id", "org_id"}, Rows: [][]driver.Value{{int64(1), "ISS-1", "well", `{"checklist":[]}`, int64(4), int64(3)}}},
				{Contains: "FROM `issue_rectify_records`", Columns: []string{"id"}},
			}
			steps = append(steps,
				testutil.QueryStep{Contains: "FROM `sys_users`", Columns: []string{"id", "name", "username"}, Rows: [][]driver.Value{{int64(4), "用户", "user"}}},
				testutil.QueryStep{Contains: "FROM `sys_orgs`", Columns: []string{"id", "name", "parent_id"}, Rows: [][]driver.Value{{int64(3), "街道", int64(0)}}},
			)
			db := testutil.NewQueryDB(t, steps...)
			d := &Deps{Issue: &service.IssueService{DB: db}}
			r := gin.New()
			d.registerRectify(r.Group("/api"))
			RegisterApp(r, d)
			w := httptest.NewRecorder()
			r.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
			if w.Code != http.StatusOK {
				t.Fatalf("HTTP %d: %s", w.Code, w.Body.String())
			}
			var body struct {
				Data map[string]json.RawMessage `json:"data"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
				t.Fatal(err)
			}
			if string(body.Data["rectify_records"]) != "[]" || !strings.Contains(string(body.Data["type_ext"]), "checklist") {
				t.Fatalf("基础契约变化：%s", w.Body.String())
			}
			if string(body.Data["report_user_name"]) != `"用户"` || string(body.Data["assignee_user_name"]) != "null" || string(body.Data["org_path"]) != `"街道"` {
				t.Fatalf("名称丢失：%s", w.Body.String())
			}
		})
	}
}

func TestAdminListHTTPEmptyArraysAndNormalizedMetadata(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, path := range []string{"/api/issues?page=-1&size=0", "/api/sys/users?page=-1&size=0"} {
		t.Run(path, func(t *testing.T) {
			db := testutil.NewQueryDB(t,
				testutil.QueryStep{Contains: "count(*)", Columns: []string{"count"}, Rows: [][]driver.Value{{int64(0)}}},
				testutil.QueryStep{Contains: "LIMIT ?", Columns: []string{"id"}},
			)
			d := &Deps{Issue: &service.IssueService{DB: db}, Sys: &service.SysService{DB: db}}
			r := gin.New()
			d.registerRectify(r.Group("/api"))
			d.registerSysStaff(r.Group("/api"))
			w := httptest.NewRecorder()
			r.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
			if w.Code != http.StatusOK {
				t.Fatalf("HTTP %d: %s", w.Code, w.Body.String())
			}
			var body struct {
				Data struct {
					List  []any `json:"list"`
					Page  int   `json:"page"`
					Size  int   `json:"size"`
					Total int   `json:"total"`
				} `json:"data"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
				t.Fatal(err)
			}
			if body.Data.List == nil || len(body.Data.List) != 0 || body.Data.Page != 1 || body.Data.Size != 20 || body.Data.Total != 0 {
				t.Fatalf("分页契约错误：%s", w.Body.String())
			}
		})
	}
}

func TestLedgerHTTPEmptyAndFailure(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, path := range []string{"/api/ledger/street", "/api/ledger/survey"} {
		for _, fail := range []bool{false, true} {
			t.Run(path+map[bool]string{false: "空", true: "失败"}[fail], func(t *testing.T) {
				step := testutil.QueryStep{Contains: "GROUP BY", Columns: []string{"type", "total", "pending", "done"}}
				if fail {
					step.Err = errors.New("aggregate unavailable")
				}
				db := testutil.NewQueryDB(t, step)
				d := &Deps{Issue: &service.IssueService{DB: db}}
				r := gin.New()
				d.registerLedgerStreet(r.Group("/api"))
				d.registerLedgerSurvey(r.Group("/api"))
				w := httptest.NewRecorder()
				r.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
				if fail {
					if w.Code != 500 || !strings.Contains(w.Body.String(), `"data":null`) {
						t.Fatalf("故障不能为成功：%s", w.Body.String())
					}
					return
				}
				if w.Code != 200 || !strings.Contains(w.Body.String(), `"rows":[]`) {
					t.Fatalf("空台账应为 []：%s", w.Body.String())
				}
			})
		}
	}
}

func TestBusinessOptionRoutesRequireAuthentication(t *testing.T) {
	gin.SetMode(gin.TestMode)
	apis := []model.SysAPI{}
	for _, entry := range perm.Registry {
		apis = append(apis, model.SysAPI{Method: entry.Method, Path: entry.Path, Module: entry.Module, Action: entry.Action})
	}
	r := gin.New()
	r.Use(middleware.RBAC(perm.NewStaticService(nil, apis), true, perm.PublicPaths))
	d := &Deps{}
	d.registerRectify(r.Group("/api"))
	d.registerLedgerStreet(r.Group("/api"))
	d.registerLedgerSurvey(r.Group("/api"))
	for _, path := range []string{"/api/issues/options/orgs", "/api/issues/options/reporters?org_id=4", "/api/issues/1/assignee-options", "/api/ledger/street/options/orgs", "/api/ledger/survey/options/orgs"} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if w.Code != 401 {
			t.Errorf("%s 未认证应为 401，实际 %d", path, w.Code)
		}
	}
}

func TestReporterOptionsInvalidArguments(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	d := &Deps{}
	d.registerRectify(r.Group("/api"))
	for _, query := range []string{"", "org_id=0", "org_id=-1", "org_id=4&selected_id=abc"} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest("GET", "/api/issues/options/reporters?"+query, nil))
		if w.Code != 400 {
			t.Errorf("无效参数 %s 应为 400：%s", query, w.Body.String())
		}
	}
}
