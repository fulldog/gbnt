package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestAccessLogMarksBeforeHandler(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Cleanup(func() {
		OnBeforeAccess(nil)
		OnAfterAccess(nil)
	})

	var order []string
	OnBeforeAccess(func(*gin.Context) {
		order = append(order, "mark")
	})

	r := gin.New()
	r.Use(AccessLog())
	r.POST("/api/app/issues", func(c *gin.Context) {
		order = append(order, "handler")
		c.Status(http.StatusBadRequest)
	})

	req := httptest.NewRequest(http.MethodPost, "/api/app/issues", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d", w.Code)
	}
	want := []string{"mark", "handler", "mark"}
	if len(order) != len(want) {
		t.Fatalf("order = %v", order)
	}
	for i := range want {
		if order[i] != want[i] {
			t.Fatalf("order = %v, want %v", order, want)
		}
	}
}
