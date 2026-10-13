package perm

// web.ledger-handover
var apisLedgerHandover = []Entry{
	{Method: "GET", Path: "/api/ledger/handovers", Name: "移交数量列表", Module: "web.ledger-handover", Action: "view", Sort: 11},
	{Method: "GET", Path: "/api/ledger/handovers/:id", Name: "移交数量详情", Module: "web.ledger-handover", Action: "view", Sort: 11},
	{Method: "POST", Path: "/api/ledger/handovers", Name: "新增移交数量", Module: "web.ledger-handover", Action: "create", Sort: 11},
	{Method: "PUT", Path: "/api/ledger/handovers/:id", Name: "更新移交数量", Module: "web.ledger-handover", Action: "edit", Sort: 11},
	{Method: "DELETE", Path: "/api/ledger/handovers/:id", Name: "删除移交数量", Module: "web.ledger-handover", Action: "delete", Sort: 11},
}
