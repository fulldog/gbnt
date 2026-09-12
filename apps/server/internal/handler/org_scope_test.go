package handler

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"gbnt/apps/server/internal/service"
	"github.com/gin-gonic/gin"
)

func TestOrgAndRoleScopeFailuresReturnForbidden(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, cause := range []error{service.ErrOrgScopeForbidden, service.ErrRoleAssignmentForbidden} {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		if !orgScopeFailure(c, fmt.Errorf("wrapped: %w", cause)) {
			t.Fatalf("范围错误未被处理: %v", cause)
		}
		if w.Code != http.StatusForbidden || !strings.Contains(w.Body.String(), cause.Error()) {
			t.Fatalf("范围错误应返回 403: %d %s", w.Code, w.Body.String())
		}
	}
}
