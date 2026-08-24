package service

import (
	"testing"

	"gbnt/backend/internal/model"
)

func TestBuildOrgTree(t *testing.T) {
	list := []model.SysOrg{
		{Base: model.Base{ID: 1}, Name: "根", Sort: 1},
		{Base: model.Base{ID: 2}, ParentID: 1, Name: "街道A", Sort: 2},
		{Base: model.Base{ID: 3}, ParentID: 2, Name: "村A1", Sort: 3},
		{Base: model.Base{ID: 4}, ParentID: 1, Name: "部门B", Sort: 4},
	}
	tree := BuildOrgTree(list)
	if len(tree) != 1 {
		t.Fatalf("root count = %d, want 1", len(tree))
	}
	if tree[0].Name != "根" || len(tree[0].Children) != 2 {
		t.Fatalf("root children = %+v", tree[0].Children)
	}
	if tree[0].Children[0].Name != "街道A" || len(tree[0].Children[0].Children) != 1 {
		t.Fatalf("street branch = %+v", tree[0].Children[0])
	}
	if tree[0].Children[0].Children[0].Name != "村A1" {
		t.Fatalf("village = %+v", tree[0].Children[0].Children[0])
	}
	if len(tree[0].Children[0].Children[0].Children) != 0 {
		t.Fatalf("leaf children should be empty slice")
	}
}

func TestBuildOrgTreeEmpty(t *testing.T) {
	tree := BuildOrgTree(nil)
	if len(tree) != 0 {
		t.Fatalf("expected empty tree, got %+v", tree)
	}
}
