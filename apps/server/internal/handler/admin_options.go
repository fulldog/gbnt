package handler

import (
	"errors"
	"strconv"

	"gbnt/apps/server/internal/service"
	"gbnt/apps/server/pkg/response"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// IssueOrgOptions GET /api/issues/options/orgs — 专项整改组织候选，受 web.rectify/view 保护。
func (d *Deps) IssueOrgOptions(c *gin.Context) {
	d.businessOrgOptions(c, false)
}

// LedgerStreetOrgOptions GET /api/ledger/street/options/orgs — 街道台账专用街道候选。
func (d *Deps) LedgerStreetOrgOptions(c *gin.Context) {
	d.businessOrgOptions(c, true)
}

// LedgerSurveyOrgOptions GET /api/ledger/survey/options/orgs — 排查汇总专用街道候选。
func (d *Deps) LedgerSurveyOrgOptions(c *gin.Context) {
	d.businessOrgOptions(c, true)
}

func (d *Deps) businessOrgOptions(c *gin.Context, streetsOnly bool) {
	list, err := d.Sys.ListBusinessOrgOptions(c.Request.Context(), streetsOnly)
	if err != nil {
		response.Fail(c, 500, response.CodeServer, err.Error())
		return
	}
	response.OK(c, list)
}

func userOptionQuery(c *gin.Context) (service.BusinessUserOptionQuery, bool) {
	q := service.BusinessUserOptionQuery{
		Keyword: c.Query("keyword"), Page: atoiDefault(c.Query("page"), 1), Size: atoiDefault(c.Query("size"), 20),
	}
	if raw := c.Query("selected_id"); raw != "" {
		id, err := strconv.ParseUint(raw, 10, 64)
		if err != nil {
			response.Fail(c, 400, response.CodeBadReq, "selected_id 必须为非负整数")
			return q, false
		}
		q.SelectedID = id
	}
	return q, true
}

func optionFailure(c *gin.Context, err error) {
	if errors.Is(err, service.ErrOptionArgument) {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
	} else if errors.Is(err, gorm.ErrRecordNotFound) {
		response.Fail(c, 404, response.CodeNotFound, "问题或组织不存在")
	} else {
		response.Fail(c, 500, response.CodeServer, err.Error())
	}
}

// IssueReporterOptions GET /api/issues/options/reporters — 上报人候选，org_id 必填，受 create 权限保护。
func (d *Deps) IssueReporterOptions(c *gin.Context) {
	orgID, err := strconv.ParseUint(c.Query("org_id"), 10, 64)
	if err != nil || orgID == 0 {
		response.Fail(c, 400, response.CodeBadReq, service.ErrOptionArgument.Error())
		return
	}
	query, ok := userOptionQuery(c)
	if !ok {
		return
	}
	result, err := d.Sys.ListReporterOptions(c.Request.Context(), orgID, query)
	if err != nil {
		optionFailure(c, err)
		return
	}
	response.OK(c, result)
}

// IssueAssigneeOptions GET /api/issues/:id/assignee-options — 既有问题的同组织责任人候选，受 edit 权限保护。
func (d *Deps) IssueAssigneeOptions(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	query, ok := userOptionQuery(c)
	if !ok {
		return
	}
	result, err := d.Issue.ListAssigneeOptions(c.Request.Context(), id, query)
	if err != nil {
		optionFailure(c, err)
		return
	}
	response.OK(c, result)
}
