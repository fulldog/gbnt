package migrate

import (
	"testing"

	"gbnt/apps/server/internal/model"
)

func TestDemoOrgTreeMatchesSheet(t *testing.T) {
	t.Parallel()
	nodes := demoOrgTree()
	byKey := map[string]demoOrgNode{}
	names := map[string]struct{}{}
	var root, districts, streets, villages int
	for _, node := range nodes {
		if _, dup := byKey[node.key]; dup {
			t.Fatalf("重复节点键 %s", node.key)
		}
		byKey[node.key] = node
		if _, dup := names[node.name]; dup {
			t.Fatalf("组织名称重复 %s", node.name)
		}
		names[node.name] = struct{}{}
		switch node.typ {
		case model.OrgTypeRoot:
			root++
			if node.name != "聊城经济技术开发区" || node.parentKey != "" {
				t.Fatalf("根节点应为聊城经济技术开发区，实际 %+v", node)
			}
		case model.OrgTypeDistrict:
			districts++
		case model.OrgTypeStreet:
			streets++
		case model.OrgTypeVillage:
			villages++
		default:
			t.Fatalf("未知组织类型 %s", node.typ)
		}
	}
	if root != 1 || districts != 2 || streets != 12 || villages != 64 || len(nodes) != 79 {
		t.Fatalf("层级数量不符 root=%d district=%d street=%d village=%d total=%d", root, districts, streets, villages, len(nodes))
	}
	for _, node := range nodes {
		if node.parentKey == "" {
			continue
		}
		parent, ok := byKey[node.parentKey]
		if !ok {
			t.Fatalf("%s 缺少上级 %s", node.name, node.parentKey)
		}
		child, ok := model.ChildOrgType(parent.typ)
		if !ok || child != node.typ {
			t.Fatalf("%s 的类型 %s 不能挂在 %s(%s) 下", node.name, node.typ, parent.name, parent.typ)
		}
	}
	jiang := byKey["d1"]
	if jiang.name != "蒋官屯街道" || jiang.typ != model.OrgTypeDistrict {
		t.Fatalf("二级首节点应为蒋官屯街道，实际 %+v", jiang)
	}
	center := byKey["d1-a0"]
	if center.name != "中心社区" || center.parentKey != "d1" || center.typ != model.OrgTypeStreet {
		t.Fatalf("中心社区应挂在蒋官屯街道下，实际 %+v", center)
	}
	firstVillage := byKey["d1-a0-v0"]
	if firstVillage.name != "周吴海村" || firstVillage.parentKey != "d1-a0" {
		t.Fatalf("周吴海村应挂在中心社区下，实际 %+v", firstVillage)
	}
	bei := byKey["d2"]
	if bei.name != "北城街道" || byKey["d2-a6"].name != "杨集管区" || byKey["d2-a6-v4"].name != "代桥村" {
		t.Fatal("北城街道末级未按表格顺序落到杨集管区 / 代桥村")
	}
}
