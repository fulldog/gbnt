package handler

import (
	"errors"
	"net/url"
	"strconv"

	"gbnt/apps/server/internal/logger"
	"gbnt/apps/server/internal/service"
	"gbnt/apps/server/pkg/response"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

func ledgerReportQuery(c *gin.Context) (service.LedgerReportQuery, bool) {
	query := service.LedgerReportQuery{DateFrom: c.Query("date_from"), DateTo: c.Query("date_to")}
	if raw := c.Query("street_org_id"); raw != "" {
		id, err := strconv.ParseUint(raw, 10, 64)
		if err != nil {
			response.Fail(c, 400, response.CodeBadReq, "street_org_id 必须为非负整数")
			return query, false
		}
		query.StreetOrgID = id
	}
	return query, true
}

func ledgerReportFailure(c *gin.Context, err error) {
	if errors.Is(err, service.ErrLedgerReportArgument) {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	if logs := logger.L(); logs != nil {
		logs.Error.Error("报表查询失败", zap.String("path", c.FullPath()), zap.String("trace_id", c.GetString(response.CtxTraceID)), zap.Error(err))
	}
	response.Fail(c, 500, response.CodeServer, "报表查询失败，请稍后重试")
}

// ledgerSplitQuery 仅供新拆分接口使用，畸形编码不得被 URL.Query 静默丢弃。
func ledgerSplitQuery(c *gin.Context) (service.LedgerReportQuery, bool) {
	values, err := url.ParseQuery(c.Request.URL.RawQuery)
	if err != nil {
		response.Fail(c, 400, response.CodeBadReq, "查询参数编码无效")
		return service.LedgerReportQuery{}, false
	}
	query, err := service.ParseLedgerSplitQuery(values)
	if err != nil {
		ledgerReportFailure(c, err)
		return query, false
	}
	return query, true
}

// LedgerStreetRows GET /api/ledger/street/rows — 台账基础行，沿用本页 view 权限。
func (d *Deps) LedgerStreetRows(c *gin.Context) {
	query, ok := ledgerSplitQuery(c)
	if !ok {
		return
	}
	result, err := d.Issue.LedgerStreetRows(c.Request.Context(), query)
	if err != nil {
		ledgerReportFailure(c, err)
		return
	}
	response.OK(c, result)
}

// LedgerStreetStatistics GET /api/ledger/street/statistics — 批量台账指标，不提供资产编辑。
func (d *Deps) LedgerStreetStatistics(c *gin.Context) {
	query, ok := ledgerSplitQuery(c)
	if !ok {
		return
	}
	result, err := d.Issue.LedgerStreetStatistics(c.Request.Context(), query)
	if err != nil {
		ledgerReportFailure(c, err)
		return
	}
	response.OK(c, result)
}

// LedgerSurveyRows GET /api/ledger/survey/rows — 跨年度组织基础行，保留独立排查权限。
func (d *Deps) LedgerSurveyRows(c *gin.Context) {
	query, ok := ledgerSplitQuery(c)
	if !ok {
		return
	}
	result, err := d.Issue.LedgerSurveyRows(c.Request.Context(), query)
	if err != nil {
		ledgerReportFailure(c, err)
		return
	}
	response.OK(c, result)
}

// LedgerSurveyStatistics GET /api/ledger/survey/statistics — 当前清单问题及整改记录批量统计。
func (d *Deps) LedgerSurveyStatistics(c *gin.Context) {
	query, ok := ledgerSplitQuery(c)
	if !ok {
		return
	}
	result, err := d.Issue.LedgerSurveyStatistics(c.Request.Context(), query)
	if err != nil {
		ledgerReportFailure(c, err)
		return
	}
	response.OK(c, result)
}

// LedgerStreetReport GET /api/ledger/street/report — 只读建设项目表，使用街道台账 view 权限。
func (d *Deps) LedgerStreetReport(c *gin.Context) {
	query, ok := ledgerReportQuery(c)
	if !ok {
		return
	}
	result, err := d.Issue.LedgerStreetReport(c.Request.Context(), query)
	if err != nil {
		ledgerReportFailure(c, err)
		return
	}
	response.OK(c, result)
}

// LedgerSurveyReport GET /api/ledger/survey/report — 只读村级排查表，未采集数量显式返回 null。
func (d *Deps) LedgerSurveyReport(c *gin.Context) {
	query, ok := ledgerReportQuery(c)
	if !ok {
		return
	}
	result, err := d.Issue.LedgerSurveyReport(c.Request.Context(), query)
	if err != nil {
		ledgerReportFailure(c, err)
		return
	}
	response.OK(c, result)
}
