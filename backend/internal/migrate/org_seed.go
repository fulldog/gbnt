package migrate

import (
	"strconv"

	"gorm.io/gorm"

	"gbnt/backend/internal/model"
)

// demoOrgNode 种子节点（对齐 demo/frontend/js/seed.js + hsf-sys-seed.js buildDepartments）。
type demoOrgNode struct {
	key       string
	parentKey string
	name      string
}

// demoOrgTree 组织树（跳过 type=office，上级挂到有效父节点）。
func demoOrgTree() []demoOrgNode {
	raw := []struct {
		key, parentKey, name, typ string
	}{
		{"org-gov", "", "聊城经开区管委会", "gov"},
		{"org-dept-1", "org-gov", "农业农村局", "dept"},
		{"org-dept-2", "org-gov", "产业发展园区", "dept"},
		{"org-office-dc", "org-gov", "东城街道办事处", "office"},
		{"org-street-dc", "org-office-dc", "东城街道", "street"},
		{"org-office-bc", "org-gov", "北城街道办事处", "office"},
		{"org-street-bc", "org-office-bc", "北城街道", "street"},
		{"org-office-jg", "org-gov", "蒋官屯街道办事处", "office"},
		{"org-street-jg", "org-office-jg", "蒋官屯街道", "street"},
	}
	appendChildren := func(streetKey string, names []string, types []string) {
		for i, name := range names {
			raw = append(raw, struct {
				key, parentKey, name, typ string
			}{
				key:       streetKey + "-" + string(types[i][0]) + strconv.Itoa(i),
				parentKey: streetKey,
				name:      name,
				typ:       types[i],
			})
		}
	}
	appendChildren("org-street-dc",
		[]string{"李太屯社区", "大胡社区", "辛屯社区", "单光屯社区", "光岳社区", "团结新村", "大学城新村"},
		[]string{"community", "community", "community", "community", "community", "village", "village"},
	)
	appendChildren("org-street-bc",
		[]string{"物流园社区", "和谐新村", "孙屯新村", "常楼新村", "邱张新村", "河刘新村", "新水河新村", "三官庙新村", "运东新村", "周集新村", "中心新村", "杨集新村"},
		[]string{"community", "village", "village", "village", "village", "village", "village", "village", "village", "village", "village", "village"},
	)
	appendChildren("org-street-jg",
		[]string{"中心社区", "滨河社区", "李官屯新村", "程麻新村", "冯庄新村", "海盛新村", "久安新村", "泰和新村", "河东新村"},
		[]string{"community", "community", "village", "village", "village", "village", "village", "village", "village"},
	)

	byKey := make(map[string]struct {
		key, parentKey, name, typ string
	})
	for _, o := range raw {
		byKey[o.key] = o
	}
	effectiveParent := func(key string) string {
		pid := byKey[key].parentKey
		for pid != "" {
			p := byKey[pid]
			if p.typ != "office" {
				return pid
			}
			pid = p.parentKey
		}
		return ""
	}

	out := make([]demoOrgNode, 0, len(raw))
	for _, o := range raw {
		if o.typ == "office" {
			continue
		}
		out = append(out, demoOrgNode{
			key:       o.key,
			parentKey: effectiveParent(o.key),
			name:      o.name,
		})
	}
	return out
}

// seedDemoOrgs 写入 demo 组织架构；已有数据时仅加载索引。
func seedDemoOrgs(db *gorm.DB) (nameToID map[string]uint64, rootID uint64, err error) {
	var n int64
	if err := db.Model(&model.SysOrg{}).Count(&n).Error; err != nil {
		return nil, 0, err
	}
	if n > 0 {
		return loadOrgNameIndex(db)
	}

	nodes := demoOrgTree()
	keyToID := make(map[string]uint64, len(nodes))
	nameToID = make(map[string]uint64, len(nodes))
	sort := 0
	for _, n := range nodes {
		sort++
		parentID := uint64(0)
		if n.parentKey != "" {
			var ok bool
			parentID, ok = keyToID[n.parentKey]
			if !ok {
				continue
			}
		}
		row := model.SysOrg{ParentID: parentID, Name: n.name, Sort: sort}
		if err := db.Create(&row).Error; err != nil {
			return nil, 0, err
		}
		keyToID[n.key] = row.ID
		nameToID[n.name] = row.ID
		if n.parentKey == "" {
			rootID = row.ID
		}
	}
	if rootID == 0 {
		if id, ok := nameToID["聊城经开区管委会"]; ok {
			rootID = id
		}
	}
	return nameToID, rootID, nil
}

func loadOrgNameIndex(db *gorm.DB) (map[string]uint64, uint64, error) {
	var list []model.SysOrg
	if err := db.Order("sort ASC, id ASC").Find(&list).Error; err != nil {
		return nil, 0, err
	}
	nameToID := make(map[string]uint64, len(list))
	var rootID uint64
	for _, o := range list {
		nameToID[o.Name] = o.ID
		if o.ParentID == 0 {
			rootID = o.ID
		}
	}
	return nameToID, rootID, nil
}
