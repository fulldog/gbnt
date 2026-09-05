package handler

import (
	"net/http"
	"strings"

	"gbnt/apps/server/pkg/response"
	"github.com/gin-gonic/gin"
)

// APINotFound 为未匹配 API 输出标准信封；保留原有鉴权链和非 API 路径的普通 404。
func APINotFound(c *gin.Context) {
	// 已被 JWT 等中间件终止的请求不能再次写入 404，覆盖原来的鉴权失败响应。
	if c.IsAborted() {
		return
	}
	path := c.Request.URL.Path
	if path != "/api" && !strings.HasPrefix(path, "/api/") {
		c.String(http.StatusNotFound, "404 page not found")
		return
	}
	response.Fail(c, http.StatusNotFound, response.CodeNotFound,
		"接口不存在，请检查请求路径或后端版本")
	c.Abort()
}
