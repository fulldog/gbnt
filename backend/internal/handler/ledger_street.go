package handler

import (
	"github.com/gin-gonic/gin"

	"gbnt/backend/pkg/response"
)

func (d *Deps) registerLedgerStreet(api *gin.RouterGroup) {
	api.GET("/ledger/street", d.LedgerStreet)
}

// LedgerStreet GET /api/ledger/street — 按组织聚合；query: street_org_id/date_from/date_to。
func (d *Deps) LedgerStreet(c *gin.Context) {
	data, err := d.Issue.LedgerStreet(parseUint64Query(c.Query("street_org_id")), c.Query("date_from"), c.Query("date_to"))
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, data)
}
