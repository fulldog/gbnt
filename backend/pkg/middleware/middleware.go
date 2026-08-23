// Package middleware Gin 中间件：trace、耗时、访问日志、JWT、恢复。
package middleware

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.uber.org/zap"

	"gbnt/backend/internal/logger"
	"gbnt/backend/pkg/jwtutil"
	"gbnt/backend/pkg/response"
)

// Recovery 捕获 panic 写入 error 日志。
func Recovery() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if rec := recover(); rec != nil {
				if logger.L() != nil {
					logger.L().Error.Error("panic",
						zap.Any("recover", rec),
						zap.String("trace_id", getTrace(c)),
						zap.String("path", c.Request.URL.Path),
					)
				}
				response.Fail(c, 500, response.CodeServer, "服务器内部错误")
				c.Abort()
			}
		}()
		c.Next()
	}
}

// TraceAndTiming 注入 trace_id、记录开始时间，响应带回耗时。
func TraceAndTiming() gin.HandlerFunc {
	return func(c *gin.Context) {
		tid := c.GetHeader("X-Request-Id")
		if tid == "" {
			tid = uuid.NewString()
		}
		c.Set(response.CtxTraceID, tid)
		c.Set(response.CtxStartAt, time.Now())
		c.Header("X-Request-Id", tid)
		// 将 trace_id 注入 Request.Context，供 GORM SQL 日志关联
		c.Request = c.Request.WithContext(context.WithValue(c.Request.Context(), "trace_id", tid))
		c.Next()
	}
}

// bodyLogWriter 截获响应体用于 access 日志。
type bodyLogWriter struct {
	gin.ResponseWriter
	buf *bytes.Buffer
}

func (w bodyLogWriter) Write(b []byte) (int, error) {
	w.buf.Write(b)
	return w.ResponseWriter.Write(b)
}

// AccessLog 记录请求/响应参数与链路（脱敏）。
func AccessLog() gin.HandlerFunc {
	return func(c *gin.Context) {
		var reqBody []byte
		if c.Request.Body != nil && c.Request.Method != "GET" {
			reqBody, _ = io.ReadAll(c.Request.Body)
			c.Request.Body = io.NopCloser(bytes.NewBuffer(reqBody))
		}

		blw := &bodyLogWriter{ResponseWriter: c.Writer, buf: bytes.NewBuffer(nil)}
		c.Writer = blw

		c.Next()

		cost := int64(0)
		if v, ok := c.Get(response.CtxStartAt); ok {
			if t, ok2 := v.(time.Time); ok2 {
				cost = time.Since(t).Milliseconds()
			}
		}

		if logger.L() == nil {
			return
		}
		logger.L().Access.Info("access",
			zap.String("trace_id", getTrace(c)),
			zap.String("method", c.Request.Method),
			zap.String("path", c.Request.URL.Path),
			zap.String("query", c.Request.URL.RawQuery),
			zap.String("ip", c.ClientIP()),
			zap.String("ua", c.Request.UserAgent()),
			zap.Int("status", c.Writer.Status()),
			zap.Int64("cost_ms", cost),
			zap.Any("user_id", c.Keys["user_id"]),
			zap.String("req", maskJSON(string(reqBody))),
			zap.String("resp", maskJSON(truncate(blw.buf.String(), 4096))),
		)
	}
}

// JWTAuth 校验 Bearer Token；whitelist 路径跳过。
func JWTAuth(jm *jwtutil.Manager, whitelist []string) gin.HandlerFunc {
	set := map[string]struct{}{}
	for _, p := range whitelist {
		set[p] = struct{}{}
	}
	return func(c *gin.Context) {
		path := c.Request.URL.Path
		if _, ok := set[path]; ok {
			c.Next()
			return
		}
		// 前缀白名单：附件分片上传可带 token，但 health 等精确匹配即可
		auth := c.GetHeader("Authorization")
		if !strings.HasPrefix(auth, "Bearer ") {
			response.Fail(c, 401, response.CodeUnauth, "未登录或凭证无效")
			c.Abort()
			return
		}
		claims, err := jm.Parse(strings.TrimPrefix(auth, "Bearer "))
		if err != nil {
			response.Fail(c, 401, response.CodeUnauth, "未登录或凭证无效")
			c.Abort()
			return
		}
		c.Set("user_id", claims.UserID)
		c.Set("username", claims.Username)
		c.Set("user_name", claims.Name)
		c.Set("org_id", claims.OrgID)
		c.Set("role", claims.Role)
		c.Next()
	}
}

func getTrace(c *gin.Context) string {
	v, _ := c.Get(response.CtxTraceID)
	s, _ := v.(string)
	return s
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

// maskJSON 脱敏 password / token 字段。
func maskJSON(raw string) string {
	if raw == "" {
		return ""
	}
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &m); err != nil {
		return raw
	}
	for _, k := range []string{"password", "token", "access_token", "old_password", "new_password"} {
		if _, ok := m[k]; ok {
			m[k] = "***"
		}
	}
	b, err := json.Marshal(m)
	if err != nil {
		return raw
	}
	return string(b)
}
