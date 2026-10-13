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

// demoArea 三级管区及其下辖村。
type demoArea struct {
	name     string
	villages []string
}

// demoOrgTree 组织种子。
// 根为聊城经济技术开发区；二级对应表格 E 列（街道，类型 district），三级对应 F 列（管区，类型 street），四级对应 G 列（村，类型 village）。
func demoOrgTree() []demoOrgNode {
	nodes := []demoOrgNode{
		{key: "root", name: "聊城经济技术开发区", typ: model.OrgTypeRoot},
	}
	districtSeq := 0
	appendDistrict := func(name string, areas []demoArea) {
		districtSeq++
		districtKey := "d" + strconv.Itoa(districtSeq)
		nodes = append(nodes, demoOrgNode{
			key:       districtKey,
			parentKey: "root",
			name:      name,
			typ:       model.OrgTypeDistrict,
		})
		for i, area := range areas {
			areaKey := districtKey + "-a" + strconv.Itoa(i)
			nodes = append(nodes, demoOrgNode{
				key:       areaKey,
				parentKey: districtKey,
				name:      area.name,
				typ:       model.OrgTypeStreet,
			})
			for j, village := range area.villages {
				nodes = append(nodes, demoOrgNode{
					key:       areaKey + "-v" + strconv.Itoa(j),
					parentKey: areaKey,
					name:      village,
					typ:       model.OrgTypeVillage,
				})
			}
		}
	}
	appendDistrict("蒋官屯街道", []demoArea{
		{name: "中心社区", villages: []string{"周吴海村", "姜韩村", "王行村", "张灿光村", "固均店村"}},
		{name: "南部管区", villages: []string{"前屯村", "后屯村"}},
		{name: "东南部管区", villages: []string{"冯庄村", "四合村", "颜老村", "大刀高村", "贺海村", "任庄村", "季海村", "盛庄村"}},
		{name: "东部管区", villages: []string{"桑海村", "前张村", "后张村", "代庄村", "华严村", "侯庄村", "李庄村", "周庄村", "王洪木村"}},
		{name: "北部管区", villages: []string{"大孟营村", "孟庄村", "前铺村", "后铺村"}},
	})
	appendDistrict("北城街道", []demoArea{
		{name: "周集管区", villages: []string{"周集村", "宋邢村"}},
		{name: "运东管区", villages: []string{"辛闸村", "小段村", "曾归刘村"}},
		{name: "三官庙管区", villages: []string{"范庄村", "付庄村", "李中楼村", "西鲁村", "三官庙村", "耿庄村", "苏庄村", "曾庄村"}},
		{name: "邱张管区", villages: []string{"常楼村", "李楼村", "大瓜园村", "小瓜园村", "王楼村", "邱张村", "朱庄村", "小屯村"}},
		{name: "河刘管区", villages: []string{"西顾村", "河刘村", "周堂村"}},
		{name: "和谐管区", villages: []string{"庄庄村", "圣庄村", "杜宅村", "王庄村", "黄洼村", "东顾村", "辛庄村"}},
		{name: "杨集管区", villages: []string{"杨集村", "谢楼村", "东鲁村", "黄庄村", "代桥村"}},
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
