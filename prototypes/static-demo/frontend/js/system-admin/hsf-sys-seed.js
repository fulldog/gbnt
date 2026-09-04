/**
 * 高标农田 · 系统配置种子（对齐 AppStorage 组织 / 工作人员）
 */
(function (global) {
  'use strict';

  var SEED_ROLES = [
    {
      id: 'role_admin',
      name: '系统管理员',
      roleId: 'admin',
      enabled: true,
      remark: '平台配置与系统管理',
      created: '2026/01/08 09:00:00',
      permKeys: ['dash:view', 'sys:menu:add', 'sys:menu:edit', 'sys:dept:add', 'sys:dept:edit'],
    },
    {
      id: 'role_street',
      name: '街道管理员',
      roleId: 'street-admin',
      enabled: true,
      remark: '本街道排查整改与汇总',
      created: '2026/01/08 09:10:00',
      permKeys: ['dash:view', 'rectify:view', 'rectify:edit'],
    },
    {
      id: 'role_staff',
      name: '村级工作人员',
      roleId: 'village-staff',
      enabled: true,
      remark: '移动端上报与整改',
      created: '2026/01/08 09:20:00',
      permKeys: ['dash:view', 'mobile:report'],
    },
    {
      id: 'role_viewer',
      name: '只读用户',
      roleId: 'viewer',
      enabled: true,
      remark: '仅查看工作台与台账',
      created: '2026/01/08 09:30:00',
      permKeys: ['dash:view'],
    },
  ];

  var ROLE_NAME_MAP = {
    admin: '系统管理员',
    staff: '村级工作人员',
    street: '街道管理员',
  };

  function buildDepartments() {
    var orgs =
      (global.AppStorage && global.AppStorage.get('orgs', [])) || [];
    if (!orgs.length) {
      return [
        {
          id: 'org-gov',
          parentId: '',
          name: '聊城经济技术开发区管委会',
          enabled: true,
          remark: 'gov',
          sort: 1,
          created: '2026/01/08 08:00:00',
        },
      ];
    }
    var orgById = {};
    orgs.forEach(function (o) {
      orgById[o.id] = o;
    });

    function effectiveParentId(org) {
      var pid = org.parentId || '';
      if (!pid) return '';
      var parent = orgById[pid];
      while (parent && parent.type === 'office') {
        pid = parent.parentId || '';
        parent = pid ? orgById[pid] : null;
      }
      return pid;
    }

    var out = [];
    var sort = 0;
    orgs.forEach(function (o) {
      if (o.type === 'office') return;
      sort += 1;
      out.push({
        id: o.id,
        parentId: effectiveParentId(o),
        name: o.name,
        enabled: true,
        remark: o.type || '',
        sort: sort,
        created: '2026/01/08 08:00:00',
      });
    });
    return out;
  }

  function buildUsers() {
    var staff =
      (global.AppStorage && global.AppStorage.get('staff', [])) || [];
    return staff.map(function (s, i) {
      var roleName = ROLE_NAME_MAP[s.role] || '村级工作人员';
      if (s.username === 'admin') roleName = '系统管理员';
      return {
        id: s.id,
        orgId: s.orgId || 'org-gov',
        name: s.name,
        phone: s.phone || '',
        account: s.username,
        rolePerm: roleName,
        sort: i + 1,
        enabled: true,
        created: '2026-01-08 09:00:00',
      };
    });
  }

  function buildSeed() {
    return {
      logs: [],
      sysUsers: buildUsers(),
      sysRoles: SEED_ROLES,
      sysDepartments: buildDepartments(),
    };
  }

  function syncStaffFromSysUsers() {
    if (!global.AppStorage || !global.LadsStorage) return;
    var users = global.LadsStorage.get('sysUsers', []);
    if (!Array.isArray(users) || !users.length) return;
    var staff = users.map(function (u) {
      var role = 'staff';
      if (String(u.rolePerm || '').indexOf('系统管理员') >= 0) role = 'admin';
      else if (String(u.rolePerm || '').indexOf('街道') >= 0) role = 'staff';
      return {
        id: u.id,
        username: u.account,
        password: '123456',
        name: u.name,
        phone: u.phone,
        orgId: u.orgId,
        role: role,
        enabled: u.enabled !== false,
      };
    });
    global.AppStorage.set('staff', staff);
  }

  global.HSFSysSeed = {
    buildSeed: buildSeed,
    SEED_ROLES: SEED_ROLES,
    syncStaffFromSysUsers: syncStaffFromSysUsers,
  };
})(window);
