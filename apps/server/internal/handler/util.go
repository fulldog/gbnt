package handler

import (
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"gbnt/apps/server/internal/database"
	"gbnt/apps/server/pkg/response"
)

func parseID(c *gin.Context) (uint64, bool) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		response.Fail(c, 400, response.CodeBadReq, "无效的 id")
		return 0, false
	}
	return id, true
}

func userFromCtx(c *gin.Context) (*database.UserInfo, error) {
	return database.UserFromContext(c.Request.Context())
}

func splitCSV(s string) []string {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func atoiDefault(s string, def int) int {
	if s == "" {
		return def
	}
	n, err := strconv.Atoi(s)
	if err != nil || n <= 0 {
		return def
	}
	return n
}

func parseUint64Query(s string) uint64 {
	if s == "" {
		return 0
	}
	n, err := strconv.ParseUint(s, 10, 64)
	if err != nil {
		return 0
	}
	return n
}

func itoa(n int) string {
	return strconv.Itoa(n)
}
