package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"gbnt/apps/server/internal/database"
	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/perm"
	"gbnt/apps/server/pkg/jwtutil"
	"gbnt/apps/server/pkg/middleware"
	"gbnt/apps/server/pkg/response"
	"github.com/gin-gonic/gin"
)

func newAPINotFoundTestRouter(t *testing.T) (*gin.Engine, string, string) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	jm := jwtutil.New("api-not-found-test-secret", 72, 24)
	token, _, err := jm.Sign(7, 1)
	if err != nil {
		t.Fatal(err)
	}
	normalToken, _, err := jm.Sign(8, 1)
	if err != nil {
		t.Fatal(err)
	}
	// 使用内存加载器经过真实 JWT 校验；不打开数据库、不执行迁移。
	loadUser := func(_ context.Context, userID uint64) (*database.UserInfo, error) {
		if userID != 7 && userID != 8 {
			return nil, database.ErrUnauth
		}
		return &database.UserInfo{ID: userID, TokenVer: 1, IsSuperAdmin: userID == 7}, nil
	}
	permissions := perm.NewStaticService(nil, []model.SysAPI{
		{Method: http.MethodGet, Path: "/api/known", Module: "web.ledger-street", Action: "view"},
	})
	r := gin.New()
	r.Use(middleware.TraceAndTiming())
	r.Use(middleware.JWTAuth(jm, loadUser, nil, perm.PublicPaths))
	r.Use(middleware.RBAC(permissions, true, perm.PublicPaths))
	r.GET("/api/known", func(c *gin.Context) { response.OK(c, "known") })
	r.GET("/api/health", func(c *gin.Context) { response.OK(c, "healthy") })
	// 保留新版 RBAC：已注册但未入目录的路由只放行超管，普通用户仍被拒绝。
	r.GET("/api/not-in-registry", func(c *gin.Context) { response.OK(c, "unindexed") })
	r.NoRoute(APINotFound)
	return r, token, normalToken
}

func TestAPINotFoundRequiresAuthentication(t *testing.T) {
	r, _, _ := newAPINotFoundTestRouter(t)
	for _, path := range []string{"/api", "/api/missing", "/api/app/missing", "/apifoo"} {
		for _, auth := range []string{"", "Bearer invalid-token"} {
			t.Run(path+"/"+auth, func(t *testing.T) {
				req := httptest.NewRequest(http.MethodGet, path, nil)
				req.Header.Set("Authorization", auth)
				req.Header.Set("X-Request-Id", "unauth-trace")
				w := httptest.NewRecorder()
				r.ServeHTTP(w, req)
				var body response.Body
				if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
					t.Fatalf("鉴权失败必须是单个 JSON 响应，不能追加 404：%s", w.Body.String())
				}
				if w.Code != http.StatusUnauthorized || body.Code != response.CodeUnauth || body.Message != "未登录或凭证无效" || body.TraceID != "unauth-trace" {
					t.Fatalf("未知路径不能绕过 JWT：%d %s", w.Code, w.Body.String())
				}
			})
		}
	}
}

func TestAPINotFoundReturnsEnvelopeAndTrace(t *testing.T) {
	r, token, _ := newAPINotFoundTestRouter(t)
	for _, path := range []string{"/api", "/api/", "/api/missing", "/api/app/missing"} {
		for _, traceID := range []string{"", "not-found-trace"} {
			t.Run(path+"/"+traceID, func(t *testing.T) {
				req := httptest.NewRequest(http.MethodGet, path, nil)
				req.Header.Set("Authorization", "Bearer "+token)
				req.Header.Set("X-Request-Id", traceID)
				w := httptest.NewRecorder()
				r.ServeHTTP(w, req)
				var fields map[string]json.RawMessage
				if err := json.Unmarshal(w.Body.Bytes(), &fields); err != nil {
					t.Fatalf("未知 API 应返回 JSON：%s", w.Body.String())
				}
				for _, key := range []string{"code", "data", "message", "cost_ms", "trace_id"} {
					if _, ok := fields[key]; !ok {
						t.Fatalf("缺少统一信封字段 %s：%s", key, w.Body.String())
					}
				}
				var body response.Body
				if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
					t.Fatal(err)
				}
				if w.Code != http.StatusNotFound || body.Code != response.CodeNotFound || body.Data != nil || body.Message != "接口不存在，请检查请求路径或后端版本" || body.CostMs < 0 {
					t.Fatalf("未知 API 信封错误：%d %s", w.Code, w.Body.String())
				}
				if !strings.HasPrefix(w.Header().Get("Content-Type"), "application/json") || body.TraceID == "" || body.TraceID != w.Header().Get("X-Request-Id") {
					t.Fatalf("404 必须携带 JSON 类型和一致 Trace ID：%v %s", w.Header(), w.Body.String())
				}
				if traceID != "" && body.TraceID != traceID {
					t.Fatalf("应保留请求 Trace ID：%q", body.TraceID)
				}
			})
		}
	}
}

func TestAPINotFoundPreservesNonAPIAndExistingRoutes(t *testing.T) {
	r, token, _ := newAPINotFoundTestRouter(t)
	for _, path := range []string{"/", "/apifoo", "/apifoo/missing", "/assets/missing.js"} {
		t.Run(path, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, path, nil)
			req.Header.Set("Authorization", "Bearer "+token)
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			if w.Code != http.StatusNotFound || w.Body.String() != "404 page not found" || !strings.HasPrefix(w.Header().Get("Content-Type"), "text/plain") {
				t.Fatalf("非 API 路径应保持普通 404：%d %s", w.Code, w.Body.String())
			}
		})
	}
	for _, tc := range []struct {
		path       string // 已注册的现有路由，不应触发 NoRoute
		authorized bool   // 是否发送真实有效的测试 JWT
		status     int    // 应保持的 HTTP 状态
		data       string // 成功时原路由返回的数据
	}{
		{path: "/api/health", status: http.StatusOK, data: "healthy"},
		{path: "/api/known", status: http.StatusUnauthorized},
		{path: "/api/known", authorized: true, status: http.StatusOK, data: "known"},
		{path: "/api/not-in-registry", authorized: true, status: http.StatusOK, data: "unindexed"},
	} {
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, tc.path, nil)
		if tc.authorized {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		r.ServeHTTP(w, req)
		var body response.Body
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		if w.Code != tc.status || (tc.status == http.StatusOK && (body.Code != response.CodeOK || body.Data != tc.data)) {
			t.Errorf("已有路由不应被 NoRoute 改变：%s %d %s", tc.path, w.Code, w.Body.String())
		}
	}
}

func TestAPINotFoundPreservesRoleRulesForUnindexedRoute(t *testing.T) {
	r, superToken, normalToken := newAPINotFoundTestRouter(t)
	// 两个账号均经过 JWT 签名、解析与加载器校验，不直接伪造 request context。
	for _, tc := range []struct {
		name   string // 区分超管、普通用户与未登录场景
		path   string // 已注册未入目录，或真正未匹配的 API
		token  string // 对应账号的有效 JWT；空串表示未登录
		status int    // HTTP 状态，保留远端合并后的 RBAC 行为
		code   int    // 统一信封业务码，不将 403/404 混为格式错误
	}{
		{name: "超管允许已注册未入目录", path: "/api/not-in-registry", token: superToken, status: http.StatusOK, code: response.CodeOK},
		{name: "普通用户拒绝已注册未入目录", path: "/api/not-in-registry", token: normalToken, status: http.StatusForbidden, code: response.CodeForbid},
		{name: "未登录已注册未入目录仍需鉴权", path: "/api/not-in-registry", status: http.StatusUnauthorized, code: response.CodeUnauth},
		{name: "超管访问真正未知路由", path: "/api/missing", token: superToken, status: http.StatusNotFound, code: response.CodeNotFound},
		{name: "普通用户访问真正未知路由", path: "/api/missing", token: normalToken, status: http.StatusNotFound, code: response.CodeNotFound},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tc.path, nil)
			if tc.token != "" {
				req.Header.Set("Authorization", "Bearer "+tc.token)
			}
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			var body response.Body
			if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
				t.Fatalf("必须保持单个 JSON 响应：%s", w.Body.String())
			}
			if w.Code != tc.status || body.Code != tc.code {
				t.Fatalf("NoRoute 不能改变已有角色规则：%d %s", w.Code, w.Body.String())
			}
			if tc.status == http.StatusOK && body.Data != "unindexed" {
				t.Fatalf("超管应进入原路由：%s", w.Body.String())
			}
		})
	}
}

func TestAPINotFoundDoesNotOverwriteAbortedResponse(t *testing.T) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/missing", nil)
	response.Fail(c, http.StatusUnauthorized, response.CodeUnauth, "未登录或凭证无效")
	c.Abort()
	before := w.Body.String()
	APINotFound(c)
	if w.Code != http.StatusUnauthorized || w.Body.String() != before {
		t.Fatalf("已终止的鉴权失败不能覆盖为 404：%d %s", w.Code, w.Body.String())
	}
}
