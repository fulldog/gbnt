package perm

// web.ledger-street
var apisLedgerStreet = []Entry{
	// 拆分供数仍属街道台账查看能力，不新增编辑动作。
	{Method: "GET", Path: "/api/ledger/street/rows", Name: "街道台账基础行", Module: "web.ledger-street", Action: "view", Sort: 11},
	{Method: "GET", Path: "/api/ledger/street/statistics", Name: "街道台账统计", Module: "web.ledger-street", Action: "view", Sort: 11},
	{Method: "GET", Path: "/api/ledger/street", Name: "街道台账", Module: "web.ledger-street", Action: "view", Sort: 11},
	{Method: "GET", Path: "/api/ledger/street/report", Name: "街道台账建设项目报表", Module: "web.ledger-street", Action: "view", Sort: 11},
	{Method: "GET", Path: "/api/ledger/street/options/orgs", Name: "街道台账街道候选", Module: "web.ledger-street", Action: "view", Sort: 11},
}
