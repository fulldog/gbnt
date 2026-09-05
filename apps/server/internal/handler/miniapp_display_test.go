package handler

import (
	"context"
	"database/sql/driver"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"

	"gbnt/apps/server/internal/database"
	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/service"
	"gbnt/apps/server/internal/testutil"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func TestAppMeProvidesNamesWithoutSensitiveModelFields(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := testutil.NewQueryDB(t,
		testutil.QueryStep{Contains: "FROM `sys_orgs`", Columns: []string{"id", "name", "parent_id"}, Rows: [][]driver.Value{{int64(2), "街道", int64(0)}}},
		testutil.QueryStep{Contains: "FROM `sys_roles`", Columns: []string{"id", "name"}, Rows: [][]driver.Value{{int64(3), "巡查员"}}},
	)
	d := &Deps{Auth: &service.AuthService{DB: db}}
	r := gin.New()
	RegisterApp(r, d)
	request := httptest.NewRequest("GET", "/api/app/auth/me", nil)
	request = request.WithContext(database.WithUser(context.Background(), &database.UserInfo{ID: 7, Name: "用户", OrgID: 2, RoleID: 3, TokenVer: 123}))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, request)
	body := w.Body.String()
	if w.Code != 200 || !strings.Contains(body, `"org_name":"街道"`) || !strings.Contains(body, `"role_name":"巡查员"`) || strings.Contains(body, "token_ver") || strings.Contains(body, "password") {
		t.Fatalf("当前用户契约错误: %d %s", w.Code, body)
	}
}

func TestAppDetailDistinguishesMissingFromQueryFailure(t *testing.T) {
	for _, missing := range []bool{false, true} {
		t.Run(map[bool]string{false: "查询失败", true: "记录缺失"}[missing], func(t *testing.T) {
			failure, status := errors.New("query unavailable"), 500
			if missing {
				failure, status = gorm.ErrRecordNotFound, 404
			}
			db := testutil.NewQueryDB(t, testutil.QueryStep{Contains: "FROM `issues`", Err: failure})
			r := gin.New()
			RegisterApp(r, &Deps{Issue: &service.IssueService{DB: db}})
			w := httptest.NewRecorder()
			r.ServeHTTP(w, httptest.NewRequest("GET", "/api/app/issues/1", nil))
			if w.Code != status {
				t.Fatalf("错误类型混淆: %d %s", w.Code, w.Body.String())
			}
		})
	}
}

func TestAppCommittedOperationReturnsExplicitDisplayWarning(t *testing.T) {
	db := testutil.NewQueryDB(t, testutil.QueryStep{Contains: "FROM `sys_users`", Err: errors.New("names unavailable")})
	d := &Deps{Issue: &service.IssueService{DB: db}}
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/api/app/issues", nil)
	d.appIssuePayload(c, &service.IssueVO{Issue: model.Issue{ReportUserID: 7, RectifyRound: 1}})
	body := w.Body.String()
	if w.Code != 200 || !strings.Contains(body, `"display_warning":"操作已成功`) || !strings.Contains(body, `"report_user_name":null`) || !strings.Contains(body, `"rectify_round":1`) {
		t.Fatalf("已完成写入不能诱导重复提交: %d %s", w.Code, body)
	}
}
