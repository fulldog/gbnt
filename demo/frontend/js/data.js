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
  var STATUS_LABEL = { pending: '待整改', done: '已整改', inspected: '已排查' };

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

  /**
   * 修改当前登录用户密码（6～14 位）；成功后清除会话。
   * @returns {{ ok: boolean, message?: string }}
   */
  function changePassword(oldPassword, newPassword, confirmPassword) {
    var session = global.AppStorage.get('session', null);
    if (!session) return { ok: false, message: '请先登录' };
    var oldPwd = String(oldPassword || '');
    var newPwd = String(newPassword || '');
    var confirmPwd = String(confirmPassword || '');
    if (!oldPwd) return { ok: false, message: '请输入旧密码' };
    if (newPwd.length < 6 || newPwd.length > 14) {
      return { ok: false, message: '新密码须为 6～14 位' };
    }
    if (newPwd !== confirmPwd) {
      return { ok: false, message: '两次输入的新密码不一致' };
    }
    if (newPwd === oldPwd) {
      return { ok: false, message: '新密码不能与旧密码相同' };
    }
    var staff = getStaff();
    var user = null;
    var i;
    for (i = 0; i < staff.length; i++) {
      if (
        (session.staffId && staff[i].id === session.staffId) ||
        staff[i].username === session.username
      ) {
        user = staff[i];
        break;
      }
    }
    if (!user) return { ok: false, message: '账号不存在' };
    if (String(user.password || '') !== oldPwd) {
      return { ok: false, message: '旧密码不正确' };
    }
    user.password = newPwd;
    saveStaff(staff);
    if (global.LadsStorage && typeof global.LadsStorage.get === 'function') {
      var users = global.LadsStorage.get('sysUsers', []) || [];
      var changed = false;
      users.forEach(function (u) {
        if (
          (user.id && u.id === user.id) ||
          (u.account && u.account === user.username)
        ) {
          /* 系统配置用户表无独立密码字段时仅同步 staff；有则一并写 */
          if ('password' in u) {
            u.password = newPwd;
            changed = true;
          }
        }
      });
      if (changed) global.LadsStorage.set('sysUsers', users);
    }
    pushLog('修改密码', user.username, user.name);
    logout();
    return { ok: true };
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
    var inspected = list.filter(function (i) {
      return i.status === 'inspected';
    }).length;
    return {
      total: list.length,
      pending: pending,
      done: done,
      inspected: inspected,
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
    var now = new Date();
    var item = Object.assign(
      {
        id: id,
        status: 'pending',
        createdAt: now.toISOString(),
        inspectionDate: toDateKey(now),
        rectifyPhotos: [],
        rectifyAt: '',
        rectifyNote: '',
      },
      payload
    );
    if (!item.inspectionDate && item.createdAt) {
      item.inspectionDate = toDateKey(item.createdAt);
    }
    list.unshift(item);
    if (!saveIssues(list)) {
      if (global.AppLog) global.AppLog.error('data', 'issues 写入失败，可能超出 localStorage 容量');
      return null;
    }
    pushLog('上报问题', TYPE_LABEL[item.type] + ' · ' + (item.code || item.id));
    if (
      item.status === 'pending' &&
      global.AppWellSubmitRules &&
      typeof AppWellSubmitRules.notifyAssignee === 'function'
    ) {
      AppWellSubmitRules.notifyAssignee(item);
    }
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

  /** 计划日期展示：YYYY-MM-DD → YYYY年MM月DD日（入库仍用 ISO 日期） */
  function formatPlanDateDisplay(iso) {
    if (!iso) return '';
    var m = String(iso).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!m) return String(iso);
    return (
      m[1] +
      '年' +
      String(m[2]).padStart(2, '0') +
      '月' +
      String(m[3]).padStart(2, '0') +
      '日'
    );
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  /** ISO / Date → 入库键 YYYY-MM-DD */
  function toDateKey(input) {
    var d = input instanceof Date ? input : new Date(input);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /** 排查日期展示：优先 inspectionDate，否则 createdAt 当日 */
  function formatInspectionDate(item) {
    if (!item) return '—';
    if (item.inspectionDate) {
      var shown = formatPlanDateDisplay(item.inspectionDate);
      return shown || '—';
    }
    if (item.createdAt) {
      var key = toDateKey(item.createdAt);
      if (key) return formatPlanDateDisplay(key) || '—';
    }
    return '—';
  }

  function formatIssueListTitle(item) {
    if (!item) return '';
    var region = String(item.naturalVillage || item.village || '').trim();
    var year = String(item.projectYear || '').trim();
    if (!year && item.projectName) {
      var ym = String(item.projectName).match(/(\d{4})/);
      if (ym) year = ym[1];
    }
    var code = String(item.code || '').trim();
    var out = '';
    if (region) out += region;
    if (year) out += year + '年';
    if (code) out += code;
    return out;
  }

  /** 行政区划展示：街道 + 村/社区 + 自然村（有则拼出） */
  function formatRegion(item) {
    if (!item) return '—';
    return [item.street, item.village, item.naturalVillage]
      .map(function (s) {
        return String(s || '').trim();
      })
      .filter(Boolean)
      .join('');
  }

  function formatPlanStatus(item) {
    if (!item) return { level: 'pending', text: '—' };
    if (item.status === 'inspected') {
      return { level: 'ok', text: '已排查' };
    }
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

  function isAssigneeMatch(issue, session) {
    if (global.AppWellSubmitRules && typeof AppWellSubmitRules.isAssigneeMatch === 'function') {
      return AppWellSubmitRules.isAssigneeMatch(issue, session);
    }
    if (!issue || !session) return false;
    var phone = String(session.phone || '').trim();
    var staffId = String(session.staffId || '').trim();
    var name = String(session.name || '').trim();
    if (phone && String(issue.assigneePhone || '').trim() === phone) return true;
    if (staffId && String(issue.assigneeId || '').trim() === staffId) return true;
    if (name && String(issue.assigneeName || '').trim() === name) return true;
    return false;
  }

  /** 是否当前登录人上报（演示：上报人可在待办看到自己提交的记录） */
  function isReporterMatch(issue, session) {
    if (!issue || !session) return false;
    var phone = String(session.phone || '').trim();
    var staffId = String(session.staffId || '').trim();
    var name = String(session.name || '').trim();
    var username = String(session.username || '').trim();
    if (staffId && String(issue.reporterId || '').trim() === staffId) return true;
    if (phone && String(issue.reporterPhone || '').trim() === phone) return true;
    if (name && String(issue.reporterName || '').trim() === name) return true;
    if (username && String(issue.reporterId || '').trim() === username) return true;
    return false;
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
    changePassword: changePassword,
    issuesByType: issuesByType,
    stats: stats,
    addIssue: addIssue,
    updateIssue: updateIssue,
    completeRectify: completeRectify,
    removeIssue: removeIssue,
    importIssues: importIssues,
    daysLeft: daysLeft,
    planRemain: planRemain,
    formatIssueListTitle: formatIssueListTitle,
    formatRegion: formatRegion,
    formatPlanStatus: formatPlanStatus,
    formatPlanDateDisplay: formatPlanDateDisplay,
    formatInspectionDate: formatInspectionDate,
    toDateKey: toDateKey,
    isAssigneeMatch: isAssigneeMatch,
    isReporterMatch: isReporterMatch,
    formatTime: formatTime,
    toDms: toDms,
    findStaffByUsername: findStaffByUsername,
  };
})(window);
