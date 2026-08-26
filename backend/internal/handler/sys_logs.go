package handler

import (
	"github.com/gin-gonic/gin"

	"gbnt/backend/pkg/response"
)

func (d *Deps) registerSysLogs(api *gin.RouterGroup) {
	api.GET("/sys/op-logs", d.ListOpLogs)
}

// ListOpLogs GET /api/sys/op-logs — 操作日志；query: keyword/page/size。
func (d *Deps) ListOpLogs(c *gin.Context) {
	list, total, err := d.OpLog.List(c.Query("keyword"), atoiDefault(c.Query("page"), 1), atoiDefault(c.Query("size"), 20))
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, gin.H{"list": list, "total": total})
}
