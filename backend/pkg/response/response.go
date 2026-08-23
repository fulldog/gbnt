// Package response 统一 API 信封：code/data/message/cost_ms/trace_id。
package response

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// Body 标准响应体。
type Body struct {
	Code    int         `json:"code"`
	Data    interface{} `json:"data"`
	Message string      `json:"message"`
	CostMs  int64       `json:"cost_ms"`
	TraceID string      `json:"trace_id"`
}

const (
	CodeOK       = 0
	CodeBadReq   = 400
	CodeUnauth   = 401
	CodeForbid   = 403
	CodeNotFound = 404
	CodeConflict = 409
	CodeServer   = 500
)

// Context keys
const (
	CtxStartAt  = "req_start_at"
	CtxTraceID  = "trace_id"
	CtxRespBody = "resp_body_snapshot"
)

// OK 成功响应。
func OK(c *gin.Context, data interface{}) {
	write(c, http.StatusOK, CodeOK, data, "ok")
}

// Fail 业务失败（HTTP 与 code 对齐）。
func Fail(c *gin.Context, httpStatus, code int, message string) {
	write(c, httpStatus, code, nil, message)
}

func write(c *gin.Context, httpStatus, code int, data interface{}, message string) {
	cost := int64(0)
	if v, ok := c.Get(CtxStartAt); ok {
		if t, ok2 := v.(time.Time); ok2 {
			cost = time.Since(t).Milliseconds()
		}
	}
	tid, _ := c.Get(CtxTraceID)
	traceID, _ := tid.(string)

	body := Body{
		Code:    code,
		Data:    data,
		Message: message,
		CostMs:  cost,
		TraceID: traceID,
	}
	c.Set(CtxRespBody, body)
	c.Header("X-Response-Time", strconv.FormatInt(cost, 10)+"ms")
	if traceID != "" {
		c.Header("X-Request-Id", traceID)
	}
	c.JSON(httpStatus, body)
}
