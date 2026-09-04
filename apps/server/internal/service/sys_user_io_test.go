package service

import (
	"strings"
	"testing"
	"time"

	"gbnt/apps/server/internal/model"
)

func TestOrgPathFromRoot(t *testing.T) {
	t.Parallel()
	orgs := []model.SysOrg{
		{Base: model.Base{ID: 1}, Name: "根"},
		{Base: model.Base{ID: 2}, ParentID: 1, Name: "区A"},
		{Base: model.Base{ID: 3}, ParentID: 2, Name: "街道A"},
	}
	got := orgPathFromRoot(orgs, 3)
	if got != "根/区A/街道A" {
		t.Fatalf("got %q", got)
	}
	if orgPathFromRoot(orgs, 0) != "" {
		t.Fatal("zero org")
	}
}

func TestResolveOrgIDByPath(t *testing.T) {
	t.Parallel()
	orgs := []model.SysOrg{
		{Base: model.Base{ID: 1}, Name: "根"},
		{Base: model.Base{ID: 2}, ParentID: 1, Name: "同名"},
		{Base: model.Base{ID: 3}, ParentID: 1, Name: "区B"},
		{Base: model.Base{ID: 4}, ParentID: 2, Name: "叶子"},
		{Base: model.Base{ID: 5}, ParentID: 3, Name: "叶子"},
	}
	id, err := resolveOrgIDByPath(orgs, "根/同名/叶子")
	if err != nil || id != 4 {
		t.Fatalf("id=%d err=%v", id, err)
	}
	id, err = resolveOrgIDByPath(orgs, "叶子")
	if err == nil || !strings.Contains(err.Error(), "不唯一") {
		t.Fatalf("want 不唯一, id=%d err=%v", id, err)
	}
	id, err = resolveOrgIDByPath(orgs, "根/区B/叶子")
	if err != nil || id != 5 {
		t.Fatalf("id=%d err=%v", id, err)
	}
	_, err = resolveOrgIDByPath(orgs, "不存在")
	if err == nil || !strings.Contains(err.Error(), "不存在") {
		t.Fatalf("got %v", err)
	}
}

func TestResolveRoleIDByName(t *testing.T) {
	t.Parallel()
	roles := []model.SysRole{
		{Base: model.Base{ID: 1}, Name: "巡查员"},
		{Base: model.Base{ID: 2}, Name: "管理员"},
		{Base: model.Base{ID: 3}, Name: "巡查员"},
	}
	id, err := resolveRoleIDByName(roles, "管理员")
	if err != nil || id != 2 {
		t.Fatalf("id=%d err=%v", id, err)
	}
	_, err = resolveRoleIDByName(roles, "巡查员")
	if err == nil || !strings.Contains(err.Error(), "不唯一") {
		t.Fatalf("got %v", err)
	}
	_, err = resolveRoleIDByName(roles, "无")
	if err == nil || !strings.Contains(err.Error(), "不存在") {
		t.Fatalf("got %v", err)
	}
}

func TestParseImportStatusDefaultEnabled(t *testing.T) {
	t.Parallel()
	st, err := parseImportStatus("")
	if err != nil || st != 1 {
		t.Fatalf("empty → %d %v", st, err)
	}
	st, err = parseImportStatus("启用")
	if err != nil || st != 1 {
		t.Fatal(err)
	}
	st, err = parseImportStatus("0")
	if err != nil || st != 0 {
		t.Fatal(err)
	}
	_, err = parseImportStatus("坏")
	if err == nil {
		t.Fatal("want invalid")
	}
}

func TestParseImportCreatedAt(t *testing.T) {
	t.Parallel()
	tm, err := parseImportCreatedAt("")
	if err != nil || !tm.IsZero() {
		t.Fatalf("empty should be zero: %v %v", tm, err)
	}
	tm, err = parseImportCreatedAt("2026-08-26 19:18:00")
	if err != nil {
		t.Fatal(err)
	}
	if tm.Format(userIOCreatedAtLayout) != "2026-08-26 19:18:00" {
		t.Fatalf("got %s", tm.Format(time.RFC3339))
	}
}

func TestMapUserImportHeadersOptionalStatus(t *testing.T) {
	t.Parallel()
	idx, err := mapUserImportHeaders([]string{colName, colPhone, colUsername, colOrg, colRole})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := idx[colStatus]; ok {
		t.Fatal("status should be optional")
	}
	_, err = mapUserImportHeaders([]string{colName, colPhone})
	if err == nil {
		t.Fatal("want missing header")
	}
}
