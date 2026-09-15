package handler

import (
	"errors"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"gbnt/apps/server/internal/database"
	"gbnt/apps/server/internal/service"
	"gbnt/apps/server/pkg/response"
)

// orgScopeFailure 将服务层组织越权统一映射为 403；返回 true 表示响应已经写出。
func orgScopeFailure(c *gin.Context, err error) bool {
	if !errors.Is(err, service.ErrOrgScopeForbidden) && !errors.Is(err, service.ErrRoleAssignmentForbidden) {
		return false
	}
	response.Fail(c, 403, response.CodeForbid, err.Error())
	return true
}

// failUnauth 将未登录哨兵映射为 401，message 仍为 err.Error()。
func failUnauth(c *gin.Context, err error) bool {
	if !errors.Is(err, database.ErrUnauth) {
		return false
	}
	response.Fail(c, 401, response.CodeUnauth, err.Error())
	return true
}

// failMiniappSuperAdmin 将超管禁登小程序映射为 403，message 仍为 err.Error()。
func failMiniappSuperAdmin(c *gin.Context, err error) bool {
	if !errors.Is(err, service.ErrMiniappSuperAdmin) {
		return false
	}
	response.Fail(c, 403, response.CodeForbid, err.Error())
	return true
}

// failNotFound 将记录不存在映射为 404，message 固定为「资源不存在」。
func failNotFound(c *gin.Context, err error) bool {
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return false
	}
	response.Fail(c, 404, response.CodeNotFound, "资源不存在")
	return true
}

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
