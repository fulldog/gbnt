package handler

import (
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestAppLoginRequiresExplicitAgreementBeforeCredentialsAndCaptcha(t *testing.T) {
	for _, body := range []string{
		`{"username":"test","password":"test"}`,
		`{"username":"test","password":"test","agreed":false}`,
		`{"username":"test","password":"test","agreed":null}`,
	} {
		t.Run(body, func(t *testing.T) {
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			c.Request = httptest.NewRequest("POST", "/api/app/auth/login", strings.NewReader(body))
			c.Request.Header.Set("Content-Type", "application/json")
			// 未同意时不得调用验证码或认证服务；空依赖用于验证该前置边界。
			(&Deps{}).AppLogin(c)
			if w.Code != 400 || !strings.Contains(w.Body.String(), "请先阅读并同意") {
				t.Fatalf("未拦截未同意的登录：%d %s", w.Code, w.Body.String())
			}
		})
	}
}
