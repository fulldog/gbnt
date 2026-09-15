package handler

import (
	"strings"

	"github.com/gin-gonic/gin"

	"gbnt/apps/server/internal/service"
	"gbnt/apps/server/pkg/response"
)

// markOp 标记本请求的操作文案；须在业务校验前调用，失败也会落入 OpLog。
func (d *Deps) markOp(c *gin.Context, action, detail string) {
	if d == nil || d.OpLog == nil || c == nil || c.Request == nil {
		return
	}
	c.Request = c.Request.WithContext(service.ContextWithMark(c.Request.Context(), action, detail))
}

// MarkOpFromCatalog 按 sys_apis 目录写入动作名；已有 Mark 时不覆盖。
func (d *Deps) MarkOpFromCatalog(c *gin.Context) {
	if d == nil || d.OpLog == nil || c == nil || c.Request == nil {
		return
	}
	name := d.OpLog.CatalogAction(c.Request.Method, c.FullPath(), d.Perm)
	c.Request = c.Request.WithContext(service.ContextKeepCatalogMark(c.Request.Context(), name))
}

// PersistOp 将访问日志回调落到操作日志表。
func (d *Deps) PersistOp(c *gin.Context, req, resp string) {
	if d == nil || d.OpLog == nil || c == nil || c.Request == nil {
		return
	}
	act, det := service.MarkFromContext(c.Request.Context())
	if strings.TrimSpace(act) == "" {
		act = c.Request.Method
	}
	tid, _ := c.Get(response.CtxTraceID)
	traceID, _ := tid.(string)
	_ = d.OpLog.Persist(c.Request.Context(), service.OpLogRecord{
		Action:   act,
		Detail:   det,
		Path:     c.Request.URL.Path,
		TraceID:  traceID,
		IP:       c.ClientIP(),
		Request:  req,
		Response: resp,
	})
}
