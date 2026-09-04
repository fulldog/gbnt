package migrate

import (
	"strconv"

	"gorm.io/gorm"

	"gbnt/apps/server/internal/model"
)

// demoOrgNode 种子节点：root > district > street > village。
type demoOrgNode struct {
	key       string
	parentKey string
	name      string
	typ       model.OrgType
}

// demoOrgTree 对齐业务区划：管委会为根，经开区为区，下挂街道与村/社区。
func demoOrgTree() []demoOrgNode {
	nodes := []demoOrgNode{
		{key: "root", name: "聊城经开区管委会", typ: model.OrgTypeRoot},
		{key: "district", parentKey: "root", name: "聊城经济技术开发区", typ: model.OrgTypeDistrict},
		{key: "street-dc", parentKey: "district", name: "东城街道", typ: model.OrgTypeStreet},
		{key: "street-bc", parentKey: "district", name: "北城街道", typ: model.OrgTypeStreet},
		{key: "street-jg", parentKey: "district", name: "蒋官屯街道", typ: model.OrgTypeStreet},
	}
	appendVillages := func(streetKey string, names []string) {
		for i, name := range names {
			nodes = append(nodes, demoOrgNode{
				key:       streetKey + "-v" + strconv.Itoa(i),
				parentKey: streetKey,
				name:      name,
				typ:       model.OrgTypeVillage,
			})
		}
	}
	appendVillages("street-dc", []string{
		"李太屯社区", "大胡社区", "辛屯社区", "单光屯社区", "光岳社区", "团结新村", "大学城新村",
	})
	appendVillages("street-bc", []string{
		"物流园社区", "和谐新村", "孙屯新村", "常楼新村", "邱张新村", "河刘新村",
		"新水河新村", "三官庙新村", "运东新村", "周集新村", "中心新村", "杨集新村",
	})
	appendVillages("street-jg", []string{
		"中心社区", "滨河社区", "李官屯新村", "程麻新村", "冯庄新村",
		"海盛新村", "久安新村", "泰和新村", "河东新村",
	})
	return nodes
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
		row := model.SysOrg{ParentID: parentID, Name: n.name, Type: n.typ, Sort: sort}
		if err := db.Create(&row).Error; err != nil {
			return nil, 0, err
		}
		keyToID[n.key] = row.ID
		nameToID[n.name] = row.ID
		if n.typ == model.OrgTypeRoot {
			rootID = row.ID
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
		if o.Type == model.OrgTypeRoot || o.ParentID == 0 {
			rootID = o.ID
		}
	}
	return nameToID, rootID, nil
}
