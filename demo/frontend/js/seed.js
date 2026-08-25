/**
 * 种子数据：组织树、工作人员、样例问题
 * [原始需求] 多组织 + 机井/道路/桥涵排查整改闭环
 */
(function (global) {
  var SEED_FLAG = 'seeded-v21';
  var ISSUES_SEED_VER_KEY = 'issuesSeedVer';

  function uid(prefix) {
    return (
      (prefix || 'id') +
      '-' +
      Date.now().toString(36) +
      '-' +
      Math.random().toString(36).slice(2, 7)
    );
  }

  /** 两字名、三字名池（循环取用，保证两种长度都有） */
  var STAFF_NAMES_2 = [
    '李强', '吴敏', '李娜', '王磊', '张伟', '刘洋', '陈静', '赵勇', '周杰', '孙丽',
    '郑浩', '冯雪', '蒋平', '韩梅', '杨帆', '朱琳', '秦川', '许诺', '何俊', '吕芳',
    '施涛', '孔敏', '曹阳', '严冬', '华明', '金鑫', '魏娜', '陶然', '姜涛', '戚薇',
    '谢军', '邹倩', '喻强', '柏杨', '水静', '窦伟', '章磊', '云飞', '苏晴', '潘亮',
  ];
  var STAFF_NAMES_3 = [
    '王建华', '张文博', '刘子涵', '陈思远', '李明轩', '赵志强', '周子墨', '吴晓东',
    '郑雅婷', '冯国栋', '蒋海涛', '韩雨桐', '杨俊杰', '朱文静', '秦德明', '许嘉怡',
    '何建军', '吕晓峰', '施美玲', '孔令辉', '曹志远', '严淑芬', '华天宇', '金晓燕',
    '魏国强', '陶思琪', '姜永康', '谢晓明', '邹文浩', '喻丽华', '柏建平', '窦雅琴',
    '章子怡', '苏明哲', '潘晓琳', '葛海波', '范志鹏', '彭丽娟', '袁建国', '丁晓蓉',
  ];

  function pickStaffName(seq) {
    /* 偶数两字、奇数三字，交错出现 */
    if (seq % 2 === 0) {
      return STAFF_NAMES_2[(seq / 2) % STAFF_NAMES_2.length];
    }
    return STAFF_NAMES_3[((seq - 1) / 2) % STAFF_NAMES_3.length];
  }

  function phoneOf(n) {
    return '138' + String(10000000 + (n % 10000000)).slice(-8);
  }

  /**
   * 每个非 office 组织至少 1～2 个账号（自然村 1 人，其余 2 人；已有演示账号则补足）
   * 保留：admin/李强、street01/吴敏、village01/李娜、fixer01/王建华
   */
  function buildStaff(orgs) {
    var staffOrgs = (orgs || []).filter(function (o) {
      return o && o.type !== 'office';
    });
    var list = [
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
        orgId: 'org-street-jg-v2-n0',
        role: 'staff',
        rectifyAssignee: true,
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

    var byOrg = {};
    list.forEach(function (s) {
      if (!byOrg[s.orgId]) byOrg[s.orgId] = [];
      byOrg[s.orgId].push(s);
    });

    var nameSeq = 0;
    var genSeq = 0;
    var userSeq = 0;
    var reservedPhones = {
      '13800000000': true,
      '13800000001': true,
      '13800000002': true,
      '13800000003': true,
    };
    var reservedUsers = {
      admin: true,
      street01: true,
      village01: true,
      fixer01: true,
    };

    function nextPhone() {
      var p;
      do {
        genSeq += 1;
        p = phoneOf(genSeq + 10);
      } while (reservedPhones[p]);
      reservedPhones[p] = true;
      return p;
    }

    function nextUsername() {
      var u;
      do {
        userSeq += 1;
        u = 'u' + String(10000 + userSeq).slice(-4);
      } while (reservedUsers[u]);
      reservedUsers[u] = true;
      return u;
    }

    function nextName(orgId) {
      var name;
      var guard = 0;
      do {
        name = pickStaffName(nameSeq);
        nameSeq += 1;
        guard += 1;
        /* 同单位内不重名；跨单位可同名（保持两字/三字） */
      } while (
        guard < 80 &&
        (byOrg[orgId] || []).some(function (s) {
          return s.name === name;
        })
      );
      return name;
    }

    staffOrgs.forEach(function (org) {
      var target = org.type === 'natural' ? 1 : 2;
      /* 蒋官屯村：演示责任人已有 1 人，再补 1 人（两字+三字同单位都有） */
      if (org.id === 'org-street-jg-v2-n0') target = 2;
      /* 蒋官屯街道：已有吴敏+王建华共 2 人 */
      if (org.id === 'org-street-jg') target = 2;
      /* 管委会：已有李强，再补 1 人 */
      if (org.id === 'org-gov') target = 2;
      if (!byOrg[org.id]) byOrg[org.id] = [];
      while (byOrg[org.id].length < target) {
        var slot = byOrg[org.id].length;
        var name = nextName(org.id);
        var isLeaf =
          org.type === 'natural' ||
          org.type === 'village' ||
          org.type === 'community';
        var row = {
          id: 'staff-' + org.id + '-' + slot,
          username: nextUsername(),
          password: '123456',
          name: name,
          phone: nextPhone(),
          orgId: org.id,
          role: org.type === 'gov' ? 'admin' : 'staff',
        };
        if (isLeaf && slot === 0 && org.id !== 'org-street-jg-v2-n0') {
          row.rectifyAssignee = true;
        }
        list.push(row);
        byOrg[org.id].push(row);
      }
    });

    return list;
  }

  function issueSeedCtx() {
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
    return {
      now: now,
      planSoon: planSoon,
      planOverdue: planOverdue,
      planHours: planHours,
      planFar: planFar,
      doneThisYear: doneThisYear,
      doneLastYear: doneLastYear,
      fmt: fmt,
    };
  }

  function buildIssuesFromSeed() {
    if (global.HSFIssuesSeed && typeof global.HSFIssuesSeed.build === 'function') {
      return global.HSFIssuesSeed.build(issueSeedCtx());
    }
    return [];
  }

  function buildSeed() {
    /* 3 街道下级：2023 统计用区划（frontend/js/data/region-2023.js） */
    var orgs =
      global.HSFRegion2023 && typeof global.HSFRegion2023.flatOrgs === 'function'
        ? global.HSFRegion2023.flatOrgs()
        : [];
    if (!orgs.length) {
      orgs = [{ id: 'org-gov', name: '聊城经开区管委会', parentId: null, type: 'gov' }];
      if (global.AppLog) global.AppLog.warn('seed', 'HSFRegion2023 未加载，组织树为空');
    }

    var staff = buildStaff(orgs);

    var ctx = issueSeedCtx();
    var issues = buildIssuesFromSeed();

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
        { value: 'inspected', label: '已排查' },
      ],
    };

    var logs = [
      {
        id: uid('log'),
        time: ctx.now.toISOString(),
        user: '系统',
        action: '初始化种子数据',
        detail: '组织 / 人员 / 样例问题',
      },
    ];

    return { orgs: orgs, staff: staff, issues: issues, dict: dict, logs: logs };
  }

  function patchRuntime() {
    if (!global.AppStorage) return;

    var orgs = global.AppStorage.get('orgs', []) || [];
    var hasNatural = orgs.some(function (o) {
      return o && o.type === 'natural';
    });
    if (
      !hasNatural &&
      global.HSFRegion2023 &&
      typeof global.HSFRegion2023.flatOrgs === 'function'
    ) {
      global.AppStorage.set('orgs', global.HSFRegion2023.flatOrgs());
      if (global.AppLog) global.AppLog.info('seed', '组织树已补自然村');
    }

    var staff = global.AppStorage.get('staff', []) || [];
    var staffOrgs =
      (global.AppStorage.get('orgs', []) || []).filter(function (o) {
        return o && o.type !== 'office';
      });
    var minStaff = staffOrgs.length;
    if (staff.length < minStaff) {
      global.AppStorage.set('staff', buildStaff(global.AppStorage.get('orgs', []) || []));
      if (global.AppLog) global.AppLog.info('seed', '工作人员已按组织补齐');
    } else {
      var staffChanged = false;
      staff.forEach(function (s) {
        if (s.id === 'staff-village') {
          if (s.rectifyAssignee !== true) {
            s.rectifyAssignee = true;
            staffChanged = true;
          }
          if (s.orgId === 'org-street-jg-v2' || !s.orgId) {
            s.orgId = 'org-street-jg-v2-n0';
            staffChanged = true;
          }
        }
      });
      if (staffChanged) global.AppStorage.set('staff', staff);
    }

    var dict = global.AppStorage.get('dict', null);
    if (dict && dict.issueStatus) {
      var hasInspected = dict.issueStatus.some(function (o) {
        return o.value === 'inspected';
      });
      if (!hasInspected) {
        dict.issueStatus.push({ value: 'inspected', label: '已排查' });
        global.AppStorage.set('dict', dict);
      }
    }

    var targetVer =
      global.HSFIssuesSeed && global.HSFIssuesSeed.VERSION
        ? global.HSFIssuesSeed.VERSION
        : 'issues-seed-v18';
    var currentVer = global.AppStorage.get(ISSUES_SEED_VER_KEY, '');
    if (currentVer !== targetVer) {
      global.AppStorage.set('issues', buildIssuesFromSeed());
      global.AppStorage.set(ISSUES_SEED_VER_KEY, targetVer);
      if (global.AppLog) {
        global.AppLog.info('seed', '清单种子已更新', { version: targetVer });
      }
    }
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
    var targetVer =
      global.HSFIssuesSeed && global.HSFIssuesSeed.VERSION
        ? global.HSFIssuesSeed.VERSION
        : 'issues-seed-v18';
    global.AppStorage.set(ISSUES_SEED_VER_KEY, targetVer);
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
  patchRuntime();
})(window);
