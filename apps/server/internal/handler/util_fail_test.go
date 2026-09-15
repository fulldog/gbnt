package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"gbnt/apps/server/internal/apperr"
	"gbnt/apps/server/internal/database"
	"gbnt/apps/server/internal/service"
	"gbnt/apps/server/pkg/response"
	"gorm.io/gorm"
)

func TestFailHelpersKeepEnvelopeMessage(t *testing.T) {
	gin.SetMode(gin.TestMode)
	cases := []struct {
		name    string
		fn      func(*gin.Context, error) bool
		err     error
		status  int
		code    int
		message string
		mapped  bool
	}{
		{"unauth", failUnauth, database.ErrUnauth, http.StatusUnauthorized, response.CodeUnauth, database.ErrUnauth.Error(), true},
		{"not found", failNotFound, gorm.ErrRecordNotFound, http.StatusNotFound, response.CodeNotFound, "资源不存在", true},
		{"miniapp super admin", failMiniappSuperAdmin, service.ErrMiniappSuperAdmin, http.StatusForbidden, response.CodeForbid, apperr.ErrMiniappSuperAdmin.Error(), true},
		{"org scope", orgScopeFailure, service.ErrOrgScopeForbidden, http.StatusForbidden, response.CodeForbid, service.ErrOrgScopeForbidden.Error(), true},
		{"unauth helper ignores other", failUnauth, service.ErrOrgScopeForbidden, 0, 0, "", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			c.Request = httptest.NewRequest(http.MethodGet, "/", nil)
			ok := tc.fn(c, tc.err)
			if ok != tc.mapped {
				t.Fatalf("mapped = %v, want %v", ok, tc.mapped)
			}
			if !tc.mapped {
				if w.Body.Len() != 0 {
					t.Fatalf("unexpected body %s", w.Body.String())
				}
				return
			}
			if w.Code != tc.status {
				t.Fatalf("http = %d, want %d", w.Code, tc.status)
			}
			var body response.Body
			if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
				t.Fatal(err)
			}
			if body.Code != tc.code {
				t.Fatalf("code = %d, want %d", body.Code, tc.code)
			}
			if body.Message != tc.message {
				t.Fatalf("message = %q, want %q", body.Message, tc.message)
			}
		})
	}
}
