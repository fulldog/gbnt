package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"

	"gbnt/apps/server/internal/database"
	"gbnt/apps/server/internal/migrate"
	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/perm"
	"gbnt/apps/server/internal/service"
	"gbnt/apps/server/internal/testutil"
	"gbnt/apps/server/pkg/middleware"
	"gbnt/apps/server/pkg/response"
	"github.com/gin-gonic/gin"
)

func TestFacilityCodeConflictsHaveDistinctBusinessCodes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, entry := range []struct {
		err  error
		code int
	}{{service.ErrFacilityCodeConflict, 40901}, {service.ErrIssueRequestConflict, 40902}} {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		if !issueWriteConflict(c, fmt.Errorf("第 2 行导入失败，已成功 1 条：%w", entry.err)) {
			t.Fatal("未处理冲突")
		}
		var body response.Body
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		if w.Code != 409 || body.Code != entry.code || !strings.Contains(body.Message, "已成功 1 条") {
			t.Fatal(w.Body.String())
		}
	}
}

func TestIssueCodeRoutesRetainAuthentication(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.RBAC(perm.NewStaticService(nil, perm.RegistryAsSysAPIs()), true))
	d := &Deps{}
	RegisterApp(r, d)
	d.registerRectify(r.Group("/api"))
	for _, path := range []string{"/api/issues", "/api/app/issues", "/api/issues/import"} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest("POST", path, strings.NewReader(`{}`)))
		if w.Code != 401 {
			t.Fatalf("%s HTTP %d", path, w.Code)
		}
	}
}

func TestFacilityCodeMySQLHTTPBothClients(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, name := testutil.NewIsolatedMySQL(t)
	if err := db.AutoMigrate(&model.SysOrg{}, &model.SysUser{}, &model.Issue{}, &model.IssueRectifyRecord{}); err != nil {
		t.Fatal(err)
	}
	if _, err := migrate.ApplyFacilityCodes(context.Background(), db, name); err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.SysOrg{Base: model.Base{ID: 101}, Name: "A村", Type: "village"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.SysUser{Base: model.Base{ID: 5}, Username: "tester", OrgID: 101, Status: 1}).Error; err != nil {
		t.Fatal(err)
	}
	d := &Deps{Issue: &service.IssueService{DB: db}, OpLog: &service.OpLogService{}}
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Request = c.Request.WithContext(database.WithUser(c.Request.Context(), &database.UserInfo{ID: 5, OrgID: 101}))
		c.Next()
	})
	RegisterApp(r, d)
	d.registerRectify(r.Group("/api"))
	payload := `{"type":"road","org_id":101,"project_year":2022,"address":"现场","reporter_signature_file_id":"signed","type_ext":{"schema_version":2,"length":1,"width":2,"thickness":0.2,"checklist":[{"type":"has_shoulder","value":false,"files":["photo"]},{"type":"has_ash","value":false,"files":["photo"]},{"type":"has_road_damage","value":false,"files":["photo"]}]}}`
	call := func(method, path, raw string) (int, map[string]any) {
		t.Helper()
		w := httptest.NewRecorder()
		req := httptest.NewRequest(method, path, strings.NewReader(raw))
		req.Header.Set("Content-Type", "application/json")
		r.ServeHTTP(w, req)
		var body map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		return w.Code, body
	}
	for i, path := range []string{"/api/issues", "/api/app/issues"} {
		raw := strings.Replace(payload, `"type":"road"`, fmt.Sprintf(`"type":"road","code_mode":"auto","request_id":"http_request_%016d"`, i), 1)
		status, body := call("POST", path, raw)
		if status != 200 {
			t.Fatalf("%s: %d %+v", path, status, body)
		}
		data := body["data"].(map[string]any)
		if data["code"] != fmt.Sprintf("%02d", i+1) {
			t.Fatal(data)
		}
		_, retry := call("POST", path, raw)
		if retry["data"].(map[string]any)["id"] != data["id"] {
			t.Fatal("重试重复建单")
		}
		manual := strings.Replace(payload, `"type":"road"`, `"type":"road","code_mode":"manual","code":"001"`, 1)
		status, body = call("POST", path, manual)
		if status != 409 || body["code"] != float64(40901) {
			t.Fatalf("重复契约：%d %+v", status, body)
		}
		invalid := strings.Replace(payload, `"type":"road"`, `"type":"road","code_mode":"manual"`, 1)
		status, _ = call("POST", path, invalid)
		if status != 400 {
			t.Fatal("手动空值未拦截")
		}
	}
	// 导入重复应说明已成功行数；前序成功行的 request_id 可供原批次重试。
	one := strings.Replace(payload, `"type":"road"`, `"type":"road","request_id":"import_request_0001","code":"08"`, 1)
	two := strings.Replace(payload, `"type":"road"`, `"type":"road","request_id":"import_request_0002","code":"08"`, 1)
	for range 2 {
		status, body := call("POST", "/api/issues/import", `{"rows":[`+one+`,`+two+`]}`)
		if status != 409 || !strings.Contains(body["message"].(string), "第 2 行") || !strings.Contains(body["message"].(string), "已成功 1 条") {
			t.Fatalf("导入契约：%d %+v", status, body)
		}
	}
	var total int64
	db.Model(&model.Issue{}).Count(&total)
	if total != 3 {
		t.Fatalf("重试不应重复建单：%d", total)
	}
}
