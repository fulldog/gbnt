package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestCORSPreflightAndSimple(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(CORS(CORSOptions{Enabled: true, AllowOrigins: []string{"*"}, AllowCredentials: true}))
	r.GET("/api/health", func(c *gin.Context) { c.String(http.StatusOK, "ok") })

	pre := httptest.NewRequest(http.MethodOptions, "/api/issues", nil)
	pre.Header.Set("Origin", "http://localhost:5173")
	pre.Header.Set("Access-Control-Request-Method", "POST")
	pre.Header.Set("Access-Control-Request-Headers", "Authorization, Content-Type")
	pw := httptest.NewRecorder()
	r.ServeHTTP(pw, pre)
	if pw.Code != http.StatusNoContent {
		t.Fatalf("preflight status=%d", pw.Code)
	}
	if got := pw.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:5173" {
		t.Fatalf("preflight origin=%q", got)
	}
	if pw.Header().Get("Access-Control-Allow-Credentials") != "true" {
		t.Fatal("missing credentials")
	}

	get := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	get.Header.Set("Origin", "http://127.0.0.1:5173")
	gw := httptest.NewRecorder()
	r.ServeHTTP(gw, get)
	if gw.Code != http.StatusOK {
		t.Fatalf("get status=%d", gw.Code)
	}
	if got := gw.Header().Get("Access-Control-Allow-Origin"); got != "http://127.0.0.1:5173" {
		t.Fatalf("get origin=%q", got)
	}
	expose := gw.Header().Get("Access-Control-Expose-Headers")
	if !strings.Contains(expose, "X-New-Token") || !strings.Contains(expose, "X-Token-Expires-At") {
		t.Fatalf("expose=%q", expose)
	}
}

func TestCORSDisabled(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(CORS(CORSOptions{Enabled: false}))
	r.GET("/x", func(c *gin.Context) { c.Status(http.StatusOK) })
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatal("disabled should not set CORS")
	}
}

func TestCORSOriginNotAllowed(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(CORS(CORSOptions{Enabled: true, AllowOrigins: []string{"https://admin.example.com"}}))
	r.GET("/x", func(c *gin.Context) { c.Status(http.StatusOK) })
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set("Origin", "http://evil.test")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatal("unexpected allow origin")
	}
}
