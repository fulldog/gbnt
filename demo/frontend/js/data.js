/**
 * 业务数据读写（全部经 AppStorage）
 */
(function (global) {
  var TYPE_LABEL = {
    well: '机井',
    road: '道路',
    bridge: '桥涵闸',
    forest: '林网',
    transformer: '变压器',
  };
  var STATUS_LABEL = { pending: '待整改', done: '已整改' };

  function getIssues() {
    return global.AppStorage.get('issues', []) || [];
  }

  function getIssue(id) {
    if (!id) return null;
    var list = getIssues();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function saveIssues(list) {
    global.AppStorage.set('issues', list || []);
  }

  function getOrgs() {
    return global.AppStorage.get('orgs', []) || [];
  }

  function saveOrgs(list) {
    global.AppStorage.set('orgs', list || []);
  }

  function getStaff() {
    return global.AppStorage.get('staff', []) || [];
  }

  function saveStaff(list) {
    global.AppStorage.set('staff', list || []);
  }

  function getLogs() {
    return global.AppStorage.get('logs', []) || [];
  }

  function pushLog(action, detail, user) {
    var logs = getLogs();
    var session = global.AppStorage.get('session', null) || {};
    logs.unshift({
      id: global.AppSeed ? global.AppSeed.uid('log') : String(Date.now()),
      time: new Date().toISOString(),
      user: user || session.name || session.username || '系统',
      action: action,
      detail: detail || '',
    });
    if (logs.length > 200) logs.length = 200;
    global.AppStorage.set('logs', logs);
  }

  function findStaffByUsername(username) {
    return getStaff().find(function (s) {
      return s.username === username;
    });
  }

  function login(username, password) {
    var user = findStaffByUsername(username);
    if (!user || user.password !== password) {
      return { ok: false, message: '账号或密码不正确' };
    }
    var session = {
      username: user.username,
      name: user.name,
      phone: user.phone,
      orgId: user.orgId,
      role: user.role,
      staffId: user.id,
    };
    global.AppStorage.set('session', session);
    pushLog('登录', user.username, user.name);
    return { ok: true, session: session };
  }

  function logout() {
    global.AppStorage.remove('session');
  }

  function issuesByType(type) {
    return getIssues().filter(function (i) {
      return !type || i.type === type;
    });
  }

  function stats() {
    var list = getIssues();
    var pending = list.filter(function (i) {
      return i.status === 'pending';
    }).length;
    var done = list.filter(function (i) {
      return i.status === 'done';
    }).length;
    return {
      total: list.length,
      pending: pending,
      done: done,
      byType: {
        well: list.filter(function (i) {
          return i.type === 'well';
        }).length,
        road: list.filter(function (i) {
          return i.type === 'road';
        }).length,
        bridge: list.filter(function (i) {
          return i.type === 'bridge';
        }).length,
        forest: list.filter(function (i) {
          return i.type === 'forest';
        }).length,
        transformer: list.filter(function (i) {
          return i.type === 'transformer';
        }).length,
      },
    };
  }

  function addIssue(payload) {
    var list = getIssues();
    var id = global.AppSeed ? global.AppSeed.uid('issue') : 'issue-' + Date.now();
    var item = Object.assign(
      {
        id: id,
        status: 'pending',
        createdAt: new Date().toISOString(),
        rectifyPhotos: [],
        rectifyAt: '',
        rectifyNote: '',
      },
      payload
    );
    list.unshift(item);
    saveIssues(list);
    pushLog('上报问题', TYPE_LABEL[item.type] + ' · ' + (item.code || item.id));
    return item;
  }

  function updateIssue(id, patch) {
    var list = getIssues();
    var idx = list.findIndex(function (i) {
      return i.id === id;
    });
    if (idx < 0) return null;
    list[idx] = Object.assign({}, list[idx], patch);
    saveIssues(list);
    return list[idx];
  }

  function completeRectify(id, photos, note) {
    return updateIssue(id, {
      status: 'done',
      rectifyPhotos: photos || [],
      rectifyNote: note || '',
      rectifyAt: new Date().toISOString(),
    });
  }

  function removeIssue(id) {
    saveIssues(
      getIssues().filter(function (i) {
        return i.id !== id;
      })
    );
  }

  function importIssues(rows) {
    var list = getIssues();
    (rows || []).forEach(function (row) {
      list.unshift(
        Object.assign(
          {
            id: global.AppSeed.uid('issue'),
            status: row.status || 'pending',
            createdAt: new Date().toISOString(),
            rectifyPhotos: [],
            rectifyAt: '',
            rectifyNote: '',
          },
          row
        )
      );
    });
    saveIssues(list);
    pushLog('批量导入', '导入 ' + (rows || []).length + ' 条');
  }

  function daysLeft(planDate) {
    if (!planDate) return null;
    var end = new Date(planDate + 'T23:59:59');
    if (isNaN(end.getTime())) return null;
    var diff = Math.ceil((end.getTime() - Date.now()) / 86400000);
    return diff;
  }

  /** 相对计划整改完成日的剩余/逾期（天+时） */
  function planRemain(planDate) {
    if (!planDate) return null;
    var end = new Date(String(planDate).replace(/-/g, '/') + ' 23:59:59');
    if (isNaN(end.getTime())) return null;
    var ms = end.getTime() - Date.now();
    var abs = Math.abs(ms);
    return {
      overdue: ms < 0,
      days: Math.floor(abs / 86400000),
      hours: Math.floor((abs % 86400000) / 3600000),
    };
  }

  /**
   * 待办角标文案：剩余X天X时 / 逾期X天X时 / MM-DD 完成（跨年带 YYYY-）
   */
  function formatPlanStatus(item) {
    if (!item) return { level: 'pending', text: '—' };
    if (item.status === 'done') {
      var doneAt = item.rectifyAt || item.createdAt;
      var d = doneAt ? new Date(doneAt) : null;
      if (!d || isNaN(d.getTime())) return { level: 'ok', text: '已完成' };
      function pad(n) {
        return String(n).padStart(2, '0');
      }
      var md = pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      var nowY = new Date().getFullYear();
      var text =
        d.getFullYear() !== nowY ? d.getFullYear() + '-' + md + ' 完成' : md + ' 完成';
      return { level: 'ok', text: text };
    }
    var rem = planRemain(item.planDate);
    if (!rem) return { level: 'pending', text: '待安排' };
    if (rem.overdue) {
      return {
        level: 'overdue',
        text: '逾期' + rem.days + '天' + rem.hours + '时',
      };
    }
    return {
      level: rem.days <= 2 ? 'warn' : 'pending',
      text: '剩余' + rem.days + '天' + rem.hours + '时',
    };
  }

  function formatTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    function pad(n) {
      return String(n).padStart(2, '0');
    }
    return (
      d.getFullYear() +
      '-' +
      pad(d.getMonth() + 1) +
      '-' +
      pad(d.getDate()) +
      ' ' +
      pad(d.getHours()) +
      ':' +
      pad(d.getMinutes())
    );
  }

  /** 度分秒 */
  function toDms(deg, isLat) {
    if (deg == null || isNaN(deg)) return '—';
    var hemi = isLat ? (deg >= 0 ? 'N' : 'S') : deg >= 0 ? 'E' : 'W';
    var abs = Math.abs(deg);
    var d = Math.floor(abs);
    var mFloat = (abs - d) * 60;
    var m = Math.floor(mFloat);
    var s = ((mFloat - m) * 60).toFixed(1);
    return d + '°' + m + '′' + s + '″' + hemi;
  }

  global.AppData = {
    TYPE_LABEL: TYPE_LABEL,
    STATUS_LABEL: STATUS_LABEL,
    getIssues: getIssues,
    getIssue: getIssue,
    saveIssues: saveIssues,
    getOrgs: getOrgs,
    saveOrgs: saveOrgs,
    getStaff: getStaff,
    saveStaff: saveStaff,
    getLogs: getLogs,
    pushLog: pushLog,
    login: login,
    logout: logout,
    issuesByType: issuesByType,
    stats: stats,
    addIssue: addIssue,
    updateIssue: updateIssue,
    completeRectify: completeRectify,
    removeIssue: removeIssue,
    importIssues: importIssues,
    daysLeft: daysLeft,
    planRemain: planRemain,
    formatPlanStatus: formatPlanStatus,
    formatTime: formatTime,
    toDms: toDms,
    findStaffByUsername: findStaffByUsername,
  };
})(window);
