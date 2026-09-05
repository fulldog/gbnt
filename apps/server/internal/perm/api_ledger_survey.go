package perm

// web.ledger-survey
var apisLedgerSurvey = []Entry{
	// 排查供数入口保持独立页面权限，不借用街道台账授权。
	{Method: "GET", Path: "/api/ledger/survey/rows", Name: "排查汇总基础行", Module: "web.ledger-survey", Action: "view", Sort: 12},
	{Method: "GET", Path: "/api/ledger/survey/statistics", Name: "排查汇总统计", Module: "web.ledger-survey", Action: "view", Sort: 12},
	{Method: "GET", Path: "/api/ledger/survey", Name: "排查汇总", Module: "web.ledger-survey", Action: "view", Sort: 12},
	{Method: "GET", Path: "/api/ledger/survey/report", Name: "村级排查整改报表", Module: "web.ledger-survey", Action: "view", Sort: 12},
	{Method: "GET", Path: "/api/ledger/survey/options/orgs", Name: "排查汇总街道候选", Module: "web.ledger-survey", Action: "view", Sort: 12},
}
