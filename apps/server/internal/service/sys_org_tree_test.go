package service

import (
	"testing"

	"gbnt/apps/server/internal/model"
)

func TestBuildOrgTree(t *testing.T) {
	list := []model.SysOrg{
		{Base: model.Base{ID: 1}, Name: "根", Type: model.OrgTypeRoot, Sort: 1},
		{Base: model.Base{ID: 2}, ParentID: 1, Name: "区A", Type: model.OrgTypeDistrict, Sort: 2},
		{Base: model.Base{ID: 3}, ParentID: 2, Name: "街道A", Type: model.OrgTypeStreet, Sort: 3},
		{Base: model.Base{ID: 4}, ParentID: 3, Name: "村A1", Type: model.OrgTypeVillage, Sort: 4},
	}
	tree := BuildOrgTree(list)
	if len(tree) != 1 {
		t.Fatalf("root count = %d, want 1", len(tree))
	}
	if tree[0].Type != model.OrgTypeRoot || len(tree[0].Children) != 1 {
		t.Fatalf("root = %+v", tree[0])
	}
	district := tree[0].Children[0]
	if district.Type != model.OrgTypeDistrict || district.Name != "区A" {
		t.Fatalf("district = %+v", district)
	}
	street := district.Children[0]
	if street.Type != model.OrgTypeStreet || len(street.Children) != 1 {
		t.Fatalf("street = %+v", street)
	}
	if street.Children[0].Type != model.OrgTypeVillage || street.Children[0].Name != "村A1" {
		t.Fatalf("village = %+v", street.Children[0])
	}
}

func TestBuildOrgTreeEmpty(t *testing.T) {
	tree := BuildOrgTree(nil)
	if len(tree) != 0 {
		t.Fatalf("expected empty tree, got %+v", tree)
	}
}

func TestChildOrgType(t *testing.T) {
	cases := []struct {
		parent model.OrgType
		want   model.OrgType
		ok     bool
	}{
		{model.OrgTypeRoot, model.OrgTypeDistrict, true},
		{model.OrgTypeDistrict, model.OrgTypeStreet, true},
		{model.OrgTypeStreet, model.OrgTypeVillage, true},
		{model.OrgTypeVillage, "", false},
	}
	for _, tc := range cases {
		got, ok := model.ChildOrgType(tc.parent)
		if ok != tc.ok || got != tc.want {
			t.Fatalf("ChildOrgType(%s)=(%s,%v), want (%s,%v)", tc.parent, got, ok, tc.want, tc.ok)
		}
	}
}
