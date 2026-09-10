package handler

import (
	"context"
	"errors"

	"gbnt/apps/server/internal/service"
	"gbnt/apps/server/pkg/response"
	"github.com/gin-gonic/gin"
	driver "github.com/go-sql-driver/mysql"
)

// issueWriteConflict 统一三端保存的编号和重试冲突，保留原有其它业务错误处理。
func issueWriteConflict(c *gin.Context, err error) bool {
	if errors.Is(err, service.ErrFacilityCodeConflict) {
		response.Fail(c, 409, response.CodeFacilityCodeConflict, err.Error())
		return true
	}
	if errors.Is(err, service.ErrIssueRequestConflict) {
		response.Fail(c, 409, response.CodeIssueRequestConflict, err.Error())
		return true
	}
	var mysqlError *driver.MySQLError
	if errors.As(err, &mysqlError) || errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
		response.Fail(c, 500, response.CodeServer, "保存失败，请重试")
		return true
	}
	return false
}
