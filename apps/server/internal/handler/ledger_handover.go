package handler

import (
	"errors"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"gbnt/apps/server/internal/service"
	"gbnt/apps/server/pkg/response"
)

func (d *Deps) registerLedgerHandover(api *gin.RouterGroup) {
	handovers := api.Group("/ledger/handovers")
	{
		handovers.GET("", d.ListHandovers)
		handovers.POST("", d.CreateHandover)
		handovers.GET("/:id", d.GetHandover)
		handovers.PUT("/:id", d.UpdateHandover)
		handovers.DELETE("/:id", d.DeleteHandover)
	}
}

// ListHandovers GET /api/ledger/handovers — 当前可见范围内的移交数量；query: org_id/project_year/page/size。
func (d *Deps) ListHandovers(c *gin.Context) {
	q, ok := handoverListQuery(c)
	if !ok {
		return
	}
	result, err := d.Issue.ListHandovers(c.Request.Context(), q)
	if err != nil {
		handoverFailure(c, err)
		return
	}
	response.OK(c, result)
}

// GetHandover GET /api/ledger/handovers/:id — 可见范围内的单条移交数量。
func (d *Deps) GetHandover(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	item, err := d.Issue.GetHandover(c.Request.Context(), id)
	if err != nil {
		handoverFailure(c, err)
		return
	}
	response.OK(c, item)
}

// CreateHandover POST /api/ledger/handovers — 新增移交数量；同组织同年已删除时恢复并覆盖。
func (d *Deps) CreateHandover(c *gin.Context) {
	d.markOp(c, "新增移交数量", "")
	var req service.HandoverInput
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	item, err := d.Issue.CreateHandover(c.Request.Context(), req)
	if err != nil {
		handoverFailure(c, err)
		return
	}
	response.OK(c, item)
}

// UpdateHandover PUT /api/ledger/handovers/:id — 更新可见范围内的移交数量。
func (d *Deps) UpdateHandover(c *gin.Context) {
	d.markOp(c, "更新移交数量", c.Param("id"))
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req service.HandoverInput
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	item, err := d.Issue.UpdateHandover(c.Request.Context(), id, req)
	if err != nil {
		handoverFailure(c, err)
		return
	}
	response.OK(c, item)
}

// DeleteHandover DELETE /api/ledger/handovers/:id — 软删除可见范围内的移交数量。
func (d *Deps) DeleteHandover(c *gin.Context) {
	d.markOp(c, "删除移交数量", c.Param("id"))
	id, ok := parseID(c)
	if !ok {
		return
	}
	if err := d.Issue.DeleteHandover(c.Request.Context(), id); err != nil {
		handoverFailure(c, err)
		return
	}
	response.OK(c, nil)
}

func handoverListQuery(c *gin.Context) (service.HandoverListQuery, bool) {
	q := service.HandoverListQuery{Page: atoiDefault(c.Query("page"), 1), Size: atoiDefault(c.Query("size"), 20)}
	if raw := c.Query("org_id"); raw != "" {
		id, err := strconv.ParseUint(raw, 10, 64)
		if err != nil {
			response.Fail(c, 400, response.CodeBadReq, "org_id 必须为非负整数")
			return q, false
		}
		q.OrgID = id
	}
	if raw := c.Query("project_year"); raw != "" {
		year, err := strconv.Atoi(raw)
		if err != nil || year < 0 {
			response.Fail(c, 400, response.CodeBadReq, "project_year 必须为非负整数")
			return q, false
		}
		q.ProjectYear = year
	}
	return q, true
}

func handoverFailure(c *gin.Context, err error) {
	switch {
	case orgScopeFailure(c, err):
	case errors.Is(err, service.ErrHandoverArgument), errors.Is(err, service.ErrHandoverExists), errors.Is(err, service.ErrHandoverDeletedOccupies):
		response.Fail(c, 400, response.CodeBadReq, err.Error())
	case errors.Is(err, gorm.ErrRecordNotFound):
		response.Fail(c, 404, response.CodeNotFound, "移交数量不存在")
	default:
		response.Fail(c, 500, response.CodeServer, err.Error())
	}
}
