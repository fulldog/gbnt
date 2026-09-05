package perm

// web.ledger-survey
var apisLedgerSurvey = []Entry{
	{Method: "GET", Path: "/api/ledger/survey", Name: "排查汇总", Module: "web.ledger-survey", Action: "view", Sort: 12},
	{Method: "GET", Path: "/api/ledger/survey/options/orgs", Name: "排查汇总街道候选", Module: "web.ledger-survey", Action: "view", Sort: 12},
}
