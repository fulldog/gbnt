package handler

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"gbnt/apps/server/internal/service"
	"gbnt/apps/server/internal/testutil"
	"gbnt/apps/server/pkg/response"
	"github.com/gin-gonic/gin"
)

func TestWorkbenchStatsEveryQueryFailureReturns500Envelope(t *testing.T) {
	gin.SetMode(gin.TestMode)
	labels := []string{"total", "new", "pending", "done", "well", "road", "bridge", "forest", "transformer"}
	for index, label := range labels {
		t.Run(label, func(t *testing.T) {
			queryErr := errors.New("统计查询失败：" + label)
			steps := make([]testutil.QueryStep, index+1)
			for i := range steps {
				steps[i] = testutil.QueryStep{Contains: "count(*)", Columns: []string{"count"}, Rows: [][]driver.Value{{int64(10)}}}
			}
			steps[index].Err = queryErr
			db := testutil.NewQueryDB(t, steps...)
			d := &Deps{Issue: &service.IssueService{DB: db}}
			r := gin.New()
			r.Use(func(c *gin.Context) { c.Set(response.CtxTraceID, "stats-test-trace"); c.Next() })
			d.registerWorkbench(r.Group("/api"))
			w := httptest.NewRecorder()
			r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/workbench/stats", nil))
			var body response.Body
			if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
				t.Fatal(err)
			}
			if w.Code != http.StatusInternalServerError || body.Code != response.CodeServer || body.Data != nil || body.Message != queryErr.Error() || body.TraceID != "stats-test-trace" {
				t.Fatalf("失败应为 500/null 标准信封，不得返回部分或零统计：HTTP=%d body=%s", w.Code, w.Body.String())
			}
		})
	}
}
