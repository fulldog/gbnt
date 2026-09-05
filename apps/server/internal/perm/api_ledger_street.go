package perm

// web.ledger-street
var apisLedgerStreet = []Entry{
	{Method: "GET", Path: "/api/ledger/street", Name: "街道台账", Module: "web.ledger-street", Action: "view", Sort: 11},
	{Method: "GET", Path: "/api/ledger/street/options/orgs", Name: "街道台账街道候选", Module: "web.ledger-street", Action: "view", Sort: 11},
}
