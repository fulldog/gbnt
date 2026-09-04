package handler

import (
	"github.com/gin-gonic/gin"

	"gbnt/apps/server/pkg/response"
)

func (d *Deps) registerLedgerSurvey(api *gin.RouterGroup) {
	api.GET("/ledger/survey", d.LedgerSurvey)
}

// LedgerSurvey GET /api/ledger/survey — 按类型汇总；query: street_org_id/date_from/date_to。
func (d *Deps) LedgerSurvey(c *gin.Context) {
	data, err := d.Issue.LedgerSurvey(parseUint64Query(c.Query("street_org_id")), c.Query("date_from"), c.Query("date_to"))
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, data)
}
