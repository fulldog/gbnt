package middleware

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// CORSOptions 跨域策略。AllowOrigins 含 "*" 或为空时回显请求 Origin（以便带凭证）。
type CORSOptions struct {
	Enabled          bool     // 是否启用 CORS
	AllowOrigins     []string // 允许的 Origin；空或含 * 表示允许任意
	AllowCredentials bool     // 是否允许携带 Cookie/Authorization
	MaxAge           int      // 预检缓存秒数；≤0 默认 86400
}

const corsExposeHeaders = "X-New-Token, X-Token-Expires-At, X-Request-Id, X-Response-Time"

// CORS 处理跨域与 OPTIONS 预检，须挂在 JWT/RBAC 之前，否则预检会被 401。
func CORS(opt CORSOptions) gin.HandlerFunc {
	if !opt.Enabled {
		return func(c *gin.Context) { c.Next() }
	}
	maxAge := opt.MaxAge
	if maxAge <= 0 {
		maxAge = 86400
	}
	allowAll := len(opt.AllowOrigins) == 0
	allowed := map[string]struct{}{}
	for _, o := range opt.AllowOrigins {
		o = strings.TrimSpace(o)
		if o == "" {
			continue
		}
		if o == "*" {
			allowAll = true
			continue
		}
		allowed[o] = struct{}{}
	}

	return func(c *gin.Context) {
		origin := strings.TrimSpace(c.GetHeader("Origin"))
		if origin == "" {
			c.Next()
			return
		}
		if !allowAll {
			if _, ok := allowed[origin]; !ok {
				c.Next()
				return
			}
		}
		h := c.Writer.Header()
		h.Set("Access-Control-Allow-Origin", origin)
		h.Set("Vary", "Origin")
		if opt.AllowCredentials {
			h.Set("Access-Control-Allow-Credentials", "true")
		}
		h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD")
		reqHdr := c.GetHeader("Access-Control-Request-Headers")
		if reqHdr == "" {
			reqHdr = "Authorization, Content-Type, X-Request-Id"
		}
		h.Set("Access-Control-Allow-Headers", reqHdr)
		h.Set("Access-Control-Expose-Headers", corsExposeHeaders)
		h.Set("Access-Control-Max-Age", strconv.Itoa(maxAge))

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
