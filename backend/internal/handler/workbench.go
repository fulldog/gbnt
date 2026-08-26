package handler

import (
	"github.com/gin-gonic/gin"

	"gbnt/backend/pkg/response"
)

func (d *Deps) registerWorkbench(api *gin.RouterGroup) {
	api.GET("/workbench/stats", d.WorkbenchStats)
}

// WorkbenchStats GET /api/workbench/stats — 上报/待整改/已整改/完成率/分类型。
func (d *Deps) WorkbenchStats(c *gin.Context) {
	stats, err := d.Issue.Stats()
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, stats)
}
