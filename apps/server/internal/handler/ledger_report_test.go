package handler

import (
	"context"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"gbnt/apps/server/internal/database"
	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/perm"
	"gbnt/apps/server/internal/service"
	"gbnt/apps/server/internal/testutil"
	"gbnt/apps/server/pkg/middleware"
	"github.com/gin-gonic/gin"
)

var ledgerPartPaths = []string{"/api/ledger/street/rows", "/api/ledger/street/statistics", "/api/ledger/survey/rows", "/api/ledger/survey/statistics"}

func newLedgerTestRouter(d *Deps) *gin.Engine {
	r := gin.New()
	d.registerLedgerStreet(r.Group("/api"))
	d.registerLedgerSurvey(r.Group("/api"))
	return r
}

func TestLedgerPartsHTTPStrictQueryBeforeDatabase(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := newLedgerTestRouter(&Deps{Issue: &service.IssueService{}})
	for _, path := range ledgerPartPaths {
		for _, query := range []string{"street_org_id=-1", "street_org_id=1.2", "street_org_id=1e2", "street_org_id=%2B3", "street_org_id=null", "street_org_id=9007199254740992", "street_org_id=3&street_org_id=3", "unknown=", "date_from=2026-02-30", "date_to=%202026-09-05", "date_from=2026-09-06&date_to=2026-09-01", "date_from=%ZZ", "street_org_id=3;ignored=1"} {
			w := httptest.NewRecorder()
			r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path+"?"+query, nil))
			if w.Code != 400 || !strings.Contains(w.Body.String(), `"code":400`) || !strings.Contains(w.Body.String(), `"data":null`) {
				t.Errorf("非法参数必须拒绝：%s?%s %d %s", path, query, w.Code, w.Body.String())
			}
		}
	}
}

func TestLedgerPartsHTTPEmptyFailureAndAppliedQuery(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, path := range ledgerPartPaths {
		for _, raw := range []string{"", "street_org_id=&date_from=&date_to=", "street_org_id=003&date_from=2026-09-01&date_to=2026-09-05"} {
			t.Run(path+"?"+raw, func(t *testing.T) {
				db := testutil.NewQueryDB(t, testutil.QueryStep{Contains: "FROM `sys_orgs`", Columns: []string{"id", "type"}, Rows: [][]driver.Value{{int64(3), "street"}}}, testutil.QueryStep{Contains: "FROM `issues`", Columns: []string{"org_id"}})
				r := newLedgerTestRouter(&Deps{Issue: &service.IssueService{DB: db}})
				w := httptest.NewRecorder()
				r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path+"?"+raw, nil))
				var body struct {
					Code int `json:"code"`
					Data struct {
						Query service.LedgerAppliedQuery `json:"query"`
						Rows  []json.RawMessage          `json:"rows"`
						Notes []string                   `json:"notes"`
					} `json:"data"`
				}
				if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
					t.Fatal(err)
				}
				if w.Code != 200 || body.Code != 0 || body.Data.Rows == nil || len(body.Data.Rows) != 0 || body.Data.Notes == nil {
					t.Fatalf("空响应契约：%s", w.Body.String())
				}
				want := service.LedgerAppliedQuery{}
				if strings.Contains(raw, "003") {
					want = service.LedgerAppliedQuery{StreetOrgID: 3, DateFrom: "2026-09-01", DateTo: "2026-09-05"}
				}
				if body.Data.Query != want {
					t.Fatalf("实际筛选未规范化：%+v", body.Data.Query)
				}
			})
		}
		for _, stage := range []string{"组织", "统计", "非街道"} {
			t.Run(path+stage, func(t *testing.T) {
				org := testutil.QueryStep{Contains: "FROM `sys_orgs`", Columns: []string{"id", "type"}}
				steps := []testutil.QueryStep{org}
				query := ""
				want := 500
				switch stage {
				case "组织":
					steps[0].Err = errors.New("private SQL failure")
				case "统计":
					steps = append(steps, testutil.QueryStep{Contains: "FROM `issues`", Err: errors.New("private SQL failure")})
				case "非街道":
					steps[0].Rows = [][]driver.Value{{int64(4), "village"}}
					query = "?street_org_id=4"
					want = 400
				}
				r := newLedgerTestRouter(&Deps{Issue: &service.IssueService{DB: testutil.NewQueryDB(t, steps...)}})
				w := httptest.NewRecorder()
				r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path+query, nil))
				if w.Code != want || !strings.Contains(w.Body.String(), `"data":null`) || strings.Contains(w.Body.String(), "private SQL") {
					t.Fatalf("失败响应：%d %s", w.Code, w.Body.String())
				}
			})
		}
	}
}

func TestLedgerPartsAndOptionsKeepIndependentModulePermissions(t *testing.T) {
	gin.SetMode(gin.TestMode)
	apis := []model.SysAPI{}
	for _, entry := range perm.Registry {
		apis = append(apis, model.SysAPI{Method: entry.Method, Path: entry.Path, Module: entry.Module, Action: entry.Action})
	}
	paths := append(append([]string{}, ledgerPartPaths...), "/api/ledger/street/options/orgs", "/api/ledger/survey/options/orgs")
	for _, role := range []string{"anonymous", "none", "street", "survey", "super"} {
		for _, path := range paths {
			t.Run(role+path, func(t *testing.T) {
				module := "web.ledger-survey"
				if strings.Contains(path, "/street/") {
					module = "web.ledger-street"
				}
				permission := perm.NewStaticService(nil, apis)
				entry, ok := permission.FindAPI(http.MethodGet, path)
				if !ok || entry.Module != module || entry.Action != "view" {
					t.Fatalf("权限目录未同步：%+v", entry)
				}
				allowed := role == "super" || role == "street" && module == "web.ledger-street" || role == "survey" && module == "web.ledger-survey"
				if role != "anonymous" && role != "super" {
					// 角色只授予旧模块 view API，验证新入口不要求逐条新 API ID 授权。
					steps := []testutil.QueryStep{{Contains: "FROM `sys_role_apis`", Columns: []string{"api_id"}}}
					if role != "none" {
						steps[0].Rows = [][]driver.Value{{int64(10)}}
						steps = append(steps, testutil.QueryStep{Contains: "FROM `sys_apis`", Columns: []string{"id", "module", "action"}, Rows: [][]driver.Value{{int64(10), "web.ledger-" + role, "view"}}})
					}
					permission.DB = testutil.NewQueryDB(t, steps...)
				}
				d := &Deps{}
				if allowed {
					steps := []testutil.QueryStep{{Contains: "FROM `sys_orgs`", Columns: []string{"id"}}}
					if !strings.Contains(path, "/options/") {
						steps = append(steps, testutil.QueryStep{Contains: "FROM `issues`", Columns: []string{"org_id"}})
					}
					db := testutil.NewQueryDB(t, steps...)
					d.Issue = &service.IssueService{DB: db}
					d.Sys = &service.SysService{DB: db}
				}
				r := gin.New()
				r.Use(middleware.RBAC(permission, true, perm.PublicPaths))
				d.registerLedgerStreet(r.Group("/api"))
				d.registerLedgerSurvey(r.Group("/api"))
				request := httptest.NewRequest(http.MethodGet, path, nil)
				if role != "anonymous" {
					request = request.WithContext(database.WithUser(context.Background(), &database.UserInfo{ID: 1, RoleID: 2, IsSuperAdmin: role == "super"}))
				}
				w := httptest.NewRecorder()
				r.ServeHTTP(w, request)
				want := 403
				if role == "anonymous" {
					want = 401
				} else if allowed {
					want = 200
				}
				if w.Code != want {
					t.Fatalf("角色 %s 页面权限错误：%d %s", role, w.Code, w.Body.String())
				}
			})
		}
	}
}

func TestLedgerReportHTTPEmptyAndFailures(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, path := range []string{"/api/ledger/street/report", "/api/ledger/survey/report"} {
		for _, fail := range []bool{false, true} {
			t.Run(path+map[bool]string{false: "空", true: "错误"}[fail], func(t *testing.T) {
				step := testutil.QueryStep{Contains: "FROM `issues`", Columns: []string{"id"}}
				if fail {
					step.Err = errors.New("database error detail")
				}
				db := testutil.NewQueryDB(t, testutil.QueryStep{Contains: "FROM `sys_orgs`", Columns: []string{"id"}}, step)
				d := &Deps{Issue: &service.IssueService{DB: db}}
				r := gin.New()
				d.registerLedgerStreet(r.Group("/api"))
				d.registerLedgerSurvey(r.Group("/api"))
				w := httptest.NewRecorder()
				r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
				if fail {
					if w.Code != 500 || !strings.Contains(w.Body.String(), `"data":null`) || strings.Contains(w.Body.String(), "database error detail") {
						t.Fatalf("失败不可成功或泄漏 SQL 信息：%s", w.Body.String())
					}
					return
				}
				if w.Code != 200 || !strings.Contains(w.Body.String(), `"rows":[]`) || !strings.Contains(w.Body.String(), `"notes":[`) {
					t.Fatalf("报表空响应错误：%s", w.Body.String())
				}
			})
		}
	}
}

func TestLedgerReportHTTPRejectsInvalidQuery(t *testing.T) {
	gin.SetMode(gin.TestMode)
	d := &Deps{Issue: &service.IssueService{}}
	r := gin.New()
	d.registerLedgerStreet(r.Group("/api"))
	d.registerLedgerSurvey(r.Group("/api"))
	for _, path := range []string{"/api/ledger/street/report", "/api/ledger/survey/report"} {
		for _, query := range []string{"street_org_id=abc", "street_org_id=-1", "date_from=2026-02-30", "date_from=2026-09-05&date_to=2026-09-01"} {
			w := httptest.NewRecorder()
			r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path+"?"+query, nil))
			if w.Code != 400 {
				t.Errorf("非法参数 %s 不应被忽略：%d %s", query, w.Code, w.Body.String())
			}
		}
	}
}

func TestLedgerReportRoutesAreProtectedByExistingViewPermission(t *testing.T) {
	gin.SetMode(gin.TestMode)
	apis := []model.SysAPI{}
	for _, entry := range perm.Registry {
		apis = append(apis, model.SysAPI{Method: entry.Method, Path: entry.Path, Module: entry.Module, Action: entry.Action})
	}
	svc := perm.NewStaticService(nil, apis)
	r := gin.New()
	r.Use(middleware.RBAC(svc, true, perm.PublicPaths))
	d := &Deps{}
	d.registerLedgerStreet(r.Group("/api"))
	d.registerLedgerSurvey(r.Group("/api"))
	for path, module := range map[string]string{"/api/ledger/street/report": "web.ledger-street", "/api/ledger/survey/report": "web.ledger-survey"} {
		api, ok := svc.FindAPI(http.MethodGet, path)
		if !ok || api.Module != module || api.Action != "view" {
			t.Fatalf("报表权限映射错误：%+v", api)
		}
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		if w.Code != 401 {
			t.Errorf("报表未登录应拒绝：%s %d", path, w.Code)
		}
	}
}
