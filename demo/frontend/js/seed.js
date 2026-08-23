/**
 * 种子数据：组织树、工作人员、样例问题
 * [原始需求] 多组织 + 机井/道路/桥涵排查整改闭环
 */
(function (global) {
  var SEED_FLAG = 'seeded-v14';

  function uid(prefix) {
    return (
      (prefix || 'id') +
      '-' +
      Date.now().toString(36) +
      '-' +
      Math.random().toString(36).slice(2, 7)
    );
  }

  function appendChildren(list, streetId, items) {
    items.forEach(function (item, i) {
      list.push({
        id: streetId + '-' + item.type.charAt(0) + i,
        name: item.name,
        parentId: streetId,
        type: item.type,
      });
    });
  }

  function buildSeed() {
    /* 3 街道下级：国家统计局统计用区划代码（2023） */
    var orgs = [
      { id: 'org-gov', name: '聊城经开区管委会', parentId: null, type: 'gov' },
      { id: 'org-dept-1', name: '农业农村局', parentId: 'org-gov', type: 'dept' },
      { id: 'org-dept-2', name: '产业发展园区', parentId: 'org-gov', type: 'dept' },
      { id: 'org-office-dc', name: '东城街道办事处', parentId: 'org-gov', type: 'office' },
      { id: 'org-street-dc', name: '东城街道', parentId: 'org-office-dc', type: 'street' },
      { id: 'org-office-bc', name: '北城街道办事处', parentId: 'org-gov', type: 'office' },
      { id: 'org-street-bc', name: '北城街道', parentId: 'org-office-bc', type: 'street' },
      { id: 'org-office-jg', name: '蒋官屯街道办事处', parentId: 'org-gov', type: 'office' },
      { id: 'org-street-jg', name: '蒋官屯街道', parentId: 'org-office-jg', type: 'street' },
    ];
    appendChildren(orgs, 'org-street-dc', [
      { name: '李太屯社区', type: 'community' },
      { name: '大胡社区', type: 'community' },
      { name: '辛屯社区', type: 'community' },
      { name: '单光屯社区', type: 'community' },
      { name: '光岳社区', type: 'community' },
      { name: '团结新村', type: 'village' },
      { name: '大学城新村', type: 'village' },
    ]);
    appendChildren(orgs, 'org-street-bc', [
      { name: '物流园社区', type: 'community' },
      { name: '和谐新村', type: 'village' },
      { name: '孙屯新村', type: 'village' },
      { name: '常楼新村', type: 'village' },
      { name: '邱张新村', type: 'village' },
      { name: '河刘新村', type: 'village' },
      { name: '新水河新村', type: 'village' },
      { name: '三官庙新村', type: 'village' },
      { name: '运东新村', type: 'village' },
      { name: '周集新村', type: 'village' },
      { name: '中心新村', type: 'village' },
      { name: '杨集新村', type: 'village' },
    ]);
    appendChildren(orgs, 'org-street-jg', [
      { name: '中心社区', type: 'community' },
      { name: '滨河社区', type: 'community' },
      { name: '李官屯新村', type: 'village' },
      { name: '程麻新村', type: 'village' },
      { name: '冯庄新村', type: 'village' },
      { name: '海盛新村', type: 'village' },
      { name: '久安新村', type: 'village' },
      { name: '泰和新村', type: 'village' },
      { name: '河东新村', type: 'village' },
    ]);

    var staff = [
      {
        id: 'staff-admin',
        username: 'admin',
        password: '123456',
        name: '李强',
        phone: '13800000000',
        orgId: 'org-gov',
        role: 'admin',
      },
      {
        id: 'staff-street',
        username: 'street01',
        password: '123456',
        name: '吴敏',
        phone: '13800000001',
        orgId: 'org-street-jg',
        role: 'staff',
      },
      {
        id: 'staff-village',
        username: 'village01',
        password: '123456',
        name: '李娜',
        phone: '13800000002',
        orgId: 'org-street-jg-v2',
        role: 'staff',
      },
      {
        id: 'staff-fixer',
        username: 'fixer01',
        password: '123456',
        name: '王建华',
        phone: '13800000003',
        orgId: 'org-street-jg',
        role: 'staff',
      },
    ];

    var now = new Date();
    var planSoon = new Date(now.getTime() + 2 * 24 * 3600 * 1000 + 5 * 3600 * 1000);
    var planOverdue = new Date(now.getTime() - 3 * 24 * 3600 * 1000 - 8 * 3600 * 1000);
    var planHours = new Date(now.getTime() + 10 * 3600 * 1000);
    var planFar = new Date(now.getTime() + 12 * 24 * 3600 * 1000);
    var doneThisYear = new Date(now.getTime() - 15 * 24 * 3600 * 1000);
    var doneLastYear = new Date(now.getFullYear() - 1, 10, 18, 14, 30, 0);
    function fmt(d) {
      return (
        d.getFullYear() +
        '-' +
        String(d.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(d.getDate()).padStart(2, '0')
      );
    }

    var issues =
      global.HSFIssuesSeed && typeof global.HSFIssuesSeed.build === 'function'
        ? global.HSFIssuesSeed.build({
            now: now,
            planSoon: planSoon,
            planOverdue: planOverdue,
            planHours: planHours,
            planFar: planFar,
            doneThisYear: doneThisYear,
            doneLastYear: doneLastYear,
            fmt: fmt,
          })
        : [];

    var dict = {
      issueTypes: [
        { value: 'well', label: '机井' },
        { value: 'road', label: '道路' },
        { value: 'bridge', label: '桥涵闸' },
        { value: 'forest', label: '林网' },
        { value: 'transformer', label: '变压器' },
      ],
      issueStatus: [
        { value: 'pending', label: '待整改' },
        { value: 'done', label: '已整改' },
      ],
    };

    var logs = [
      {
        id: uid('log'),
        time: now.toISOString(),
        user: '系统',
        action: '初始化种子数据',
        detail: '组织 / 人员 / 样例问题',
      },
    ];

    return { orgs: orgs, staff: staff, issues: issues, dict: dict, logs: logs };
  }

  function ensureSeed(force) {
    if (!global.AppStorage) return;
    if (!force && global.AppStorage.get(SEED_FLAG, false)) {
      return false;
    }
    var data = buildSeed();
    global.AppStorage.set('orgs', data.orgs);
    global.AppStorage.set('staff', data.staff);
    global.AppStorage.set('issues', data.issues);
    global.AppStorage.set('dict', data.dict);
    global.AppStorage.set('logs', data.logs);
    global.AppStorage.set(SEED_FLAG, true);
    if (global.AppLog) global.AppLog.info('seed', '种子数据已写入');
    return true;
  }

  global.AppSeed = {
    ensure: ensureSeed,
    reset: function () {
      if (!global.AppStorage) return;
      global.AppStorage.clearPrefix();
      ensureSeed(true);
    },
    uid: uid,
  };

  ensureSeed(false);
})(window);
