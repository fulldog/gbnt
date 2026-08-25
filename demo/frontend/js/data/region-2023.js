/**
 * 聊城经开区 · 2023 统计用区划（街道 / 社区·新村 / 自然村）
 * 街道、社区/新村：modood/Administrative-divisions-of-China villages.csv（2023-06-30）
 * 自然村：仅蒋官屯各新村有并村前行政村名录；社区与其余新村无第三级
 */
(function (global) {
  'use strict';

  function item(value, label, extra) {
    var o = { value: value, label: label || value };
    if (extra) {
      if (extra.code) o.code = extra.code;
      if (extra.kind) o.kind = extra.kind;
      if (extra.children) o.children = extra.children;
    }
    return o;
  }

  function naturals(names) {
    return (names || []).map(function (n) {
      return item(n, n);
    });
  }

  function communityLabel(name) {
    var base = String(name || '').replace(/社区居民委员会$/, '');
    if (/社区$/.test(base)) return base;
    return base + '社区';
  }

  function unitLabel(unit) {
    if (unit.kind === 'community') return communityLabel(unit.name);
    return unit.name;
  }

  /** 蒋官屯街道并村前自然村（维基 / 地名志名录，2023 区划中已并入各新村） */
  var JGT_HAMLETS = {
    李官屯新村: [
      '蒋官屯村',
      '王行村',
      '李行村',
      '李皮村',
      '李庄村',
      '李守金村',
      '邓官屯村',
      '前屯村',
      '后屯村',
      '张七村',
      '侯庄村',
      '周庄村',
      '王洪木村',
      '代庄村',
      '前张村',
      '后张村',
      '固均店村',
      '任庄村',
    ],
    程麻新村: ['麻庄村', '老程庄村'],
    冯庄新村: ['冯庄村', '四合村', '孟庄村', '小孟营村', '大营村'],
    海盛新村: ['贺海村', '季海村', '盛庄村', '周吴海村', '桑海村'],
    久安新村: ['安庄村', '刘庄村', '宋庙村', '满庄村'],
    泰和新村: ['姜庄村', '姜高村', '姜韩村', '颜老村', '张灿光村'],
    河东新村: ['前铺村', '后铺村', '庄堂村', '吴庄村', '张存古村', '大刀高村', '小顾村', '华严村'],
  };

  var STREETS = [
    {
      code: '371502008',
      name: '北城街道',
      units: [
        { code: '371502008001', name: '光岳社区居民委员会', kind: 'community' },
        { code: '371502008002', name: '物流园社区居民委员会', kind: 'community' },
        { code: '371502008253', name: '大学城新村', kind: 'village' },
        { code: '371502008254', name: '团结新村', kind: 'village' },
        { code: '371502008255', name: '和谐新村', kind: 'village' },
        { code: '371502008256', name: '孙屯新村', kind: 'village' },
        { code: '371502008257', name: '常楼新村', kind: 'village' },
        { code: '371502008258', name: '邱张新村', kind: 'village' },
        { code: '371502008259', name: '河刘新村', kind: 'village' },
        { code: '371502008260', name: '新水河新村', kind: 'village' },
        { code: '371502008261', name: '三官庙新村', kind: 'village' },
        { code: '371502008262', name: '运东新村', kind: 'village' },
        { code: '371502008263', name: '周集新村', kind: 'village' },
        { code: '371502008264', name: '中心新村', kind: 'village' },
        { code: '371502008265', name: '杨集新村', kind: 'village' },
      ],
    },
    {
      code: '371502009',
      name: '东城街道',
      units: [
        { code: '371502009001', name: '李太屯社区居民委员会', kind: 'community' },
        { code: '371502009002', name: '大胡社区居民委员会', kind: 'community' },
        { code: '371502009003', name: '辛屯社区居民委员会', kind: 'community' },
        { code: '371502009004', name: '单光屯社区居民委员会', kind: 'community' },
        { code: '371502009005', name: '先锋社区居民委员会', kind: 'community' },
        { code: '371502009006', name: '凤凰社区居民委员会', kind: 'community' },
        { code: '371502009007', name: '庐山路社区居民委员会', kind: 'community' },
        { code: '371502009008', name: '长江路社区居民委员会', kind: 'community' },
        { code: '371502009009', name: '黄山路社区居民委员会', kind: 'community' },
      ],
    },
    {
      code: '371502010',
      name: '蒋官屯街道',
      units: [
        { code: '371502010001', name: '中心社区居民委员会', kind: 'community' },
        { code: '371502010002', name: '滨河社区居民委员会', kind: 'community' },
        { code: '371502010239', name: '李官屯新村', kind: 'village' },
        { code: '371502010240', name: '程麻新村', kind: 'village' },
        { code: '371502010241', name: '冯庄新村', kind: 'village' },
        { code: '371502010242', name: '海盛新村', kind: 'village' },
        { code: '371502010243', name: '久安新村', kind: 'village' },
        { code: '371502010244', name: '泰和新村', kind: 'village' },
        { code: '371502010245', name: '河东新村', kind: 'village' },
      ],
    },
  ];

  function unitChildren(streetName, unit) {
    if (unit.kind === 'community') return [];
    if (streetName === '蒋官屯街道' && JGT_HAMLETS[unit.name]) {
      return naturals(JGT_HAMLETS[unit.name]);
    }
    return [];
  }

  function buildTree() {
    return STREETS.map(function (street) {
      return item(street.name, street.name, {
        code: street.code,
        kind: 'street',
        children: street.units.map(function (unit) {
          var label = unitLabel(unit);
          return item(label, label, {
            code: unit.code,
            kind: unit.kind,
            children: unitChildren(street.name, unit),
          });
        }),
      });
    });
  }

  /** 供 seed / 组织树同步：扁平名录（街道 + 社区/新村 + 自然村） */
  var STREET_IDS = ['org-street-bc', 'org-street-dc', 'org-street-jg'];
  var OFFICE_IDS = ['org-office-bc', 'org-office-dc', 'org-office-jg'];

  function flatOrgs() {
    var list = [
      { id: 'org-gov', name: '聊城经济技术开发区管委会', parentId: null, type: 'gov' },
      { id: 'org-dept-1', name: '农业农村局', parentId: 'org-gov', type: 'dept' },
      { id: 'org-dept-2', name: '产业发展园区', parentId: 'org-gov', type: 'dept' },
    ];
    STREETS.forEach(function (street, si) {
      var officeId = OFFICE_IDS[si];
      var streetId = STREET_IDS[si];
      list.push({
        id: officeId,
        name: street.name.replace('街道', '街道办事处'),
        parentId: 'org-gov',
        type: 'office',
      });
      list.push({
        id: streetId,
        name: street.name,
        parentId: officeId,
        type: 'street',
        code: street.code,
      });
      street.units.forEach(function (unit, ui) {
        var childType = unit.kind === 'community' ? 'c' : 'v';
        var unitId = streetId + '-' + childType + ui;
        list.push({
          id: unitId,
          name: unitLabel(unit),
          parentId: streetId,
          type: unit.kind,
          code: unit.code,
        });
        unitChildren(street.name, unit).forEach(function (nat, ni) {
          list.push({
            id: unitId + '-n' + ni,
            name: nat.value,
            parentId: unitId,
            type: 'natural',
          });
        });
      });
    });
    return list;
  }

  global.HSFRegion2023 = {
    buildTree: buildTree,
    flatOrgs: flatOrgs,
    streets: STREETS,
  };
})(window);
