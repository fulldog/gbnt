package handler

import (
	"github.com/gin-gonic/gin"
	"strconv"
	"time"

	"gbnt/apps/server/pkg/response"
)

func (d *Deps) registerWorkbench(api *gin.RouterGroup) {
	api.GET("/workbench/stats", d.WorkbenchStats)
	api.GET("/workbench/trend", d.WorkbenchTrend)
	api.GET("/workbench/todos", d.WorkbenchTodos)
}

// WorkbenchTrend GET /api/workbench/trend；range 选填 week7/month1/halfyear/all，默认近七天。
func (d *Deps) WorkbenchTrend(c *gin.Context) {
	value := c.DefaultQuery("range", "week7")
	if value != "week7" && value != "month1" && value != "halfyear" && value != "all" {
		response.Fail(c, 400, response.CodeBadReq, "时间范围须为 week7、month1、halfyear 或 all")
		return
	}
	result, err := d.Issue.WorkbenchTrend(c.Request.Context(), value, time.Now())
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, result)
}

// WorkbenchTodos GET /api/workbench/todos；page/size 选填正整数，size 最大 100。
func (d *Deps) WorkbenchTodos(c *gin.Context) {
	page, errPage := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, errSize := strconv.Atoi(c.DefaultQuery("size", "20"))
	if errPage != nil || errSize != nil || page < 1 || size < 1 || size > 100 || page > 1000000 {
		response.Fail(c, 400, response.CodeBadReq, "page 须为 1–1000000 的整数，size 须为 1–100 的整数")
		return
	}
	result, err := d.Issue.WorkbenchTodos(c.Request.Context(), page, size, time.Now())
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, result)
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
