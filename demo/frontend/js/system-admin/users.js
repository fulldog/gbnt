/**
 * 系统管理 · 用户管理：左机构树 + 右筛选 / 列表 / 分页，数据存 LadsStorage.sysUsers
 */
(function (global) {
  var A = global.TzttAdmin;
  var TABLE_ID = "tblUsers";
  var COLS = ["序号", "姓名", "电话", "账号", "所属单位", "角色权限", "排序", "创建时间", "状态", "操作"];
  var DEFAULT_ROLE_PERM_OPTIONS = ["系统管理员", "街道管理员", "村级工作人员", "只读用户"];

  var TOOL_ICON_SEARCH =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';
  var TOOL_ICON_REFRESH =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>';
  var TOOL_ICON_FULLSCREEN =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>';
  var TOOL_ICON_COL_SETTINGS =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>';

  var suColDocClickBound = false;

  function getRolePermOptions() {
    var raw = global.LadsStorage.get("sysRoles", []);
    if (!Array.isArray(raw) || !raw.length) return DEFAULT_ROLE_PERM_OPTIONS.slice();
    return raw
      .filter(function (r) {
        return r && r.enabled !== false && r.name;
      })
      .map(function (r) {
        return String(r.name).trim();
      });
  }

  function canonRolePerm(r) {
    var s = r != null ? String(r).trim() : "";
    var opts = getRolePermOptions();
    if (opts.indexOf(s) >= 0) return s;
    if (s) return s;
    return opts[0] || "系统管理员";
  }

  var DEFAULT_USERS = [
    {
      id: "u1",
      orgId: "dept_root",
      name: "赵雅琴",
      phone: "13826548901",
      account: "zhaoyaqin",
      rolePerm: "系统管理员",
      sort: 1,
      enabled: true,
      created: "2026-04-15 09:10:00",
    },
    {
      id: "u2",
      orgId: "dept_lv2_office",
      name: "李伟",
      phone: "15901672389",
      account: "liwei",
      rolePerm: "资产管理员",
      sort: 2,
      enabled: true,
      created: "2026-04-16 10:22:08",
    },
    {
      id: "u3",
      orgId: "dept_lv2_operation",
      name: "刘洋",
      phone: "18611847263",
      account: "liuyang",
      rolePerm: "财务专员",
      sort: 3,
      enabled: false,
      created: "2026-04-15 11:30:00",
    },
    {
      id: "u4",
      orgId: "dept_co_02",
      name: "周建国",
      phone: "13266875654",
      account: "zhoujianguo",
      rolePerm: "合同管理员",
      sort: 4,
      enabled: true,
      created: "2026-04-16 14:40:33",
    },
  ];

  function loadOrgDepts() {
    var raw = global.LadsStorage.get("sysDepartments", []);
    return Array.isArray(raw) ? raw.slice() : [];
  }

  function refreshOrgData() {}

  function orgByParent(list) {
    var map = {};
    list.forEach(function (d) {
      var pid = d.parentId || "";
      if (!map[pid]) map[pid] = [];
      map[pid].push(d);
    });
    Object.keys(map).forEach(function (k) {
      map[k].sort(function (a, b) {
        var sa = a.sort != null ? Number(a.sort) : 0;
        var sb = b.sort != null ? Number(b.sort) : 0;
        if (sa !== sb) return sa - sb;
        return String(a.name).localeCompare(String(b.name), "zh");
      });
    });
    return map;
  }

  function getRootDeptId(list) {
    var top = list.find(function (d) {
      return !d.parentId;
    });
    return top ? top.id : "org-gov";
  }

  function getSubtreeDeptIds(rootId, list) {
    var map = orgByParent(list);
    var ids = [];
    function walk(id) {
      ids.push(id);
      (map[id] || []).forEach(function (c) {
        walk(c.id);
      });
    }
    walk(rootId);
    return ids;
  }

  function isValidOrgId(id) {
    if (!id) return false;
    if (id === "root") id = getRootDeptId(loadOrgDepts());
    return loadOrgDepts().some(function (d) {
      return d.id === id;
    });
  }

  function normalizeOrgId(id) {
    var oid = id != null ? String(id).trim() : "";
    if (!oid || oid === "root") return getRootDeptId(loadOrgDepts());
    return isValidOrgId(oid) ? oid : getRootDeptId(loadOrgDepts());
  }

  var state = {
    page: 1,
    pageSize: 10,
    phoneKw: "",
    nameKw: "",
    statusFilter: "",
    orgId: "",
    treeFilter: "",
    treeCollapsed: false,
    /** 有下属组的单位 id → 是否展开子级（默认 false，只展示根+二级） */
    treeExpandedDepts: {},
  };

  var userModal = { data: null, isEdit: false, syncFn: null, onConfirm: null };
  var unitTreeSelect = null;

  function buildOrgDeptTree() {
    var list = loadOrgDepts();
    var map = orgByParent(list);
    function toNode(d, level) {
      return {
        id: d.id,
        label: d.name,
        level: level,
        street: "",
        village: "",
        children: (map[d.id] || []).map(function (c) {
          return toNode(c, level + 1);
        }),
      };
    }
    return (map[""] || []).map(function (d) {
      return toNode(d, 1);
    });
  }

  function getDefaultExpandedOrgIds() {
    var list = loadOrgDepts();
    var rootId = getRootDeptId(list);
    var map = orgByParent(list);
    var ids = [rootId];
    (map[rootId] || []).forEach(function (c) {
      ids.push(c.id);
    });
    return ids;
  }

  function initUnitTreeSelect() {
    if (!global.HSFRegionTreeSelect) return null;
    var el = document.getElementById("su-f-unit");
    if (!el) return null;
    if (unitTreeSelect) return unitTreeSelect;
    el.style.setProperty("--ats-placeholder", "'请选择所属单位'");
    unitTreeSelect = global.HSFRegionTreeSelect.create("su-f-unit", {
      placeholder: "请选择所属单位",
      searchPlaceholder: "搜索单位名称",
      includeAll: false,
      expandStreets: false,
      getTree: buildOrgDeptTree,
      defaultExpandedIds: getDefaultExpandedOrgIds(),
    });
    return unitTreeSelect;
  }

  function ensureDefaultOrgSelection() {
    var list = loadOrgDepts();
    var rootId = getRootDeptId(list);
    if (!state.orgId || !isValidOrgId(state.orgId)) {
      state.orgId = rootId;
    }
  }

  function showUserFormError(msg) {
    var err = document.getElementById("su-form-error");
    if (!err) return;
    if (msg) {
      err.textContent = msg;
      err.style.display = "block";
    } else {
      err.textContent = "";
      err.style.display = "none";
    }
  }

  function bindUserModalOnce() {
    if (bindUserModalOnce._done) return;
    bindUserModalOnce._done = true;
    var saveBtn = document.getElementById("suUserSaveBtn");
    if (saveBtn) saveBtn.addEventListener("click", saveUserFromModal);
    var confirmOk = document.getElementById("modalUserConfirmOk");
    if (confirmOk) {
      confirmOk.addEventListener("click", function () {
        var fn = userModal.onConfirm;
        userModal.onConfirm = null;
        if (typeof closeModal === "function") closeModal("modalUserConfirm");
        if (fn) fn();
      });
    }
  }

  function openUserConfirm(message, onOk) {
    var msgEl = document.getElementById("modalUserConfirmMsg");
    if (msgEl) msgEl.textContent = message || "确认执行该操作吗？";
    userModal.onConfirm = typeof onOk === "function" ? onOk : null;
    if (typeof openModal === "function") openModal("modalUserConfirm");
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function H(s) {
    return A && A.escapeHtml ? A.escapeHtml(s) : escapeHtml(s);
  }

  /** 列表展示：姓名脱敏（保留首尾，中间 *），如 张*琴、张**涵、李* */
  function maskName(name) {
    var s = String(name || "").trim();
    var n = s.length;
    if (n <= 0) return "—";
    if (n === 1) return s + "*";
    if (n === 2) return s.charAt(0) + "*";
    var mid = "";
    for (var i = 0; i < n - 2; i += 1) mid += "*";
    return s.charAt(0) + mid + s.charAt(n - 1);
  }

  /** 列表展示：手机脱敏为 前三****后四（如 138****8901） */
  function maskPhone(phone) {
    var raw = String(phone || "").trim();
    var d = raw.replace(/\D/g, "");
    if (d.length < 7) return escapeHtml(raw || "—");
    return escapeHtml(d.slice(0, 3) + "****" + d.slice(-4));
  }

  function orgName(orgId) {
    var id = normalizeOrgId(orgId);
    var list = loadOrgDepts();
    var d = list.find(function (x) {
      return x.id === id;
    });
    return d ? d.name : id || "—";
  }

  function normalizeUser(u) {
    if (!u || !u.id) return u;
    var orgId = normalizeOrgId(u.orgId);
    var phone = u.phone != null ? String(u.phone).trim() : "";
    var account = u.account != null ? String(u.account).trim() : "";
    var rolePerm = canonRolePerm(u.rolePerm != null ? u.rolePerm : u.role != null ? u.role : "");
    var sn = Number(u.sort);
    return {
      id: u.id,
      orgId: orgId,
      name: u.name != null ? String(u.name) : "",
      phone: phone,
      account: account,
      rolePerm: rolePerm,
      sort: !isNaN(sn) ? sn : 100,
      enabled: u.enabled !== false,
      created: u.created != null ? String(u.created) : "",
    };
  }

  function sortUsersForList(list) {
    return list.slice().sort(function (a, b) {
      var ds = (Number(a.sort) || 0) - (Number(b.sort) || 0);
      if (ds !== 0) return ds;
      return String(b.id || "").localeCompare(String(a.id || ""), "zh-Hans-CN", { numeric: true, sensitivity: "base" });
    });
  }

  function loadUsers() {
    var raw = global.LadsStorage.get("sysUsers", DEFAULT_USERS);
    if (!raw || !Array.isArray(raw) || raw.length === 0) return sortUsersForList(DEFAULT_USERS.map(normalizeUser));
    return sortUsersForList(raw.map(normalizeUser));
  }

  function saveUsers(list) {
    global.LadsStorage.set("sysUsers", list);
    if (global.HSFSysSeed && global.HSFSysSeed.syncStaffFromSysUsers) {
      global.HSFSysSeed.syncStaffFromSysUsers();
    }
  }

  function formatNow() {
    var d = new Date();
    var p = function (n) {
      return (n < 10 ? "0" : "") + n;
    };
    return (
      d.getFullYear() +
      "-" +
      p(d.getMonth() + 1) +
      "-" +
      p(d.getDate()) +
      " " +
      p(d.getHours()) +
      ":" +
      p(d.getMinutes()) +
      ":" +
      p(d.getSeconds())
    );
  }

  function orgTreeHtml() {
    var list = loadOrgDepts();
    var map = orgByParent(list);
    var rootId = getRootDeptId(list);
    var f = state.treeFilter.trim().toLowerCase();
    var visible = {};

    function markVisible(id) {
      visible[id] = true;
      var cur = list.find(function (d) {
        return d.id === id;
      });
      while (cur && cur.parentId) {
        visible[cur.parentId] = true;
        cur = list.find(function (d) {
          return d.id === cur.parentId;
        });
      }
    }

    if (f) {
      list.forEach(function (d) {
        if (String(d.name).toLowerCase().indexOf(f) >= 0) {
          markVisible(d.id);
          getSubtreeDeptIds(d.id, list).forEach(function (id) {
            visible[id] = true;
          });
        }
      });
    }

    function matchNode(d) {
      return !f || visible[d.id];
    }

    function active(id) {
      return state.orgId === id ? " is-active" : "";
    }

    function isExpanded(id) {
      if (f) return true;
      return !!state.treeExpandedDepts[id];
    }

    function renderLevel(parentId) {
      var html = "";
      (map[parentId] || []).forEach(function (d) {
        if (!matchNode(d)) return;
        var kids = map[d.id] || [];
        var hasKids = kids.length > 0;
        if (hasKids) {
          var expanded = isExpanded(d.id);
          html +=
            '<div class="sys-tree-node">' +
            '<div class="sys-tree-node__line">' +
            '<span class="sys-tree-node__expander' +
            (expanded ? " sys-tree-node__expander--open" : "") +
            '" role="button" tabindex="0" data-tree-toggle="' +
            escapeHtml(d.id) +
            '" aria-expanded="' +
            (expanded ? "true" : "false") +
            '" aria-label="展开或收起" title="展开/收起"></span>' +
            '<button type="button" class="sys-tree-node__row sys-tree-node__row--dept' +
            active(d.id) +
            '" data-org-id="' +
            escapeHtml(d.id) +
            '"><span class="sys-tree-node__label">' +
            escapeHtml(d.name) +
            "</span></button></div>" +
            '<div class="sys-tree-node__children' +
            (expanded ? "" : " sys-tree-node__children--collapsed") +
            '">' +
            renderLevel(d.id) +
            "</div></div>";
        } else {
          html +=
            '<button type="button" class="sys-tree-node__row' +
            active(d.id) +
            '" data-org-id="' +
            escapeHtml(d.id) +
            '"><span class="sys-tree-node__caret sys-tree-node__caret--placeholder" aria-hidden="true"></span><span class="sys-tree-node__label">' +
            escapeHtml(d.name) +
            "</span></button>";
        }
      });
      return html;
    }

    var root = list.find(function (d) {
      return d.id === rootId;
    });
    var rootName = root ? root.name : "组织架构";
    if (f && !visible[rootId] && !Object.keys(visible).length) {
      return '<div class="sys-dict-empty" style="padding:12px;color:#999">无匹配单位</div>';
    }
    return (
      '<div class="sys-tree-node sys-tree-node--root">' +
      '<button type="button" class="sys-tree-node__row' +
      active(rootId) +
      '" data-org-id="' +
      escapeHtml(rootId) +
      '"><span class="sys-tree-node__caret" aria-hidden="true"></span><span class="sys-tree-node__label">' +
      escapeHtml(rootName) +
      '</span></button><div class="sys-tree-node__children">' +
      renderLevel(rootId) +
      "</div></div>"
    );
  }

  function matchOrg(u) {
    var list = loadOrgDepts();
    var rootId = getRootDeptId(list);
    if (!state.orgId || state.orgId === rootId) return true;
    return getSubtreeDeptIds(state.orgId, list).indexOf(normalizeOrgId(u.orgId)) >= 0;
  }
  function matchStatus(u) {
    if (!state.statusFilter) return true;
    if (state.statusFilter === "on") return u.enabled === true;
    if (state.statusFilter === "off") return u.enabled === false;
    return true;
  }

  function queryUsers() {
    var list = loadUsers().filter(function (u) {
      var m1 = !state.phoneKw || String(u.phone).indexOf(state.phoneKw) >= 0;
      var m2 = !state.nameKw || u.name.indexOf(state.nameKw) >= 0;
      return m1 && m2 && matchOrg(u) && matchStatus(u);
    });
    var total = list.length;
    var pages = Math.max(1, Math.ceil(total / state.pageSize));
    if (state.page > pages) state.page = pages;
    var start = (state.page - 1) * state.pageSize;
    return { rows: list.slice(start, start + state.pageSize), total: total, pages: pages };
  }

  function rolePermOptionsHtml(selected) {
    return getRolePermOptions().map(function (r) {
      return '<option value="' + escapeHtml(r) + '"' + (r === selected ? " selected" : "") + ">" + escapeHtml(r) + "</option>";
    }).join("");
  }

  function openUserModal(existing, syncFn) {
    bindUserModalOnce();
    var isEdit = !!existing;
    ensureDefaultOrgSelection();
    var data = existing || {
      id: "u_" + Date.now(),
      orgId: isValidOrgId(state.orgId) ? normalizeOrgId(state.orgId) : getRootDeptId(loadOrgDepts()),
      name: "",
      phone: "",
      account: "",
      rolePerm: getRolePermOptions()[0] || "系统管理员",
      sort: 100,
      enabled: true,
      created: "",
    };
    if (!data.created) data.created = formatNow();

    userModal.data = data;
    userModal.isEdit = isEdit;
    userModal.syncFn = syncFn;

    var titleEl = document.getElementById("modalUserEditTitle");
    if (titleEl) titleEl.textContent = isEdit ? "编辑人员" : "新增人员";

    var treeApi = initUnitTreeSelect();
    if (treeApi) treeApi.setValue(normalizeOrgId(data.orgId));

    var nameEl = document.getElementById("su-f-name");
    if (nameEl) nameEl.value = data.name || "";

    var phoneEl = document.getElementById("su-f-phone");
    if (phoneEl) phoneEl.value = data.phone || "";

    var accountEl = document.getElementById("su-f-account");
    if (accountEl) accountEl.value = data.account || "";

    var roleEl = document.getElementById("su-f-roleperm");
    if (roleEl) {
      roleEl.innerHTML = rolePermOptionsHtml(data.rolePerm);
      if (getRolePermOptions().indexOf(data.rolePerm) < 0 && data.rolePerm) {
        roleEl.insertAdjacentHTML(
          "beforeend",
          '<option value="' + escapeHtml(data.rolePerm) + '" selected>' + escapeHtml(data.rolePerm) + "</option>"
        );
      }
    }

    var sortEl = document.getElementById("su-f-sort");
    if (sortEl) sortEl.value = String(data.sort != null ? data.sort : 100);

    showUserFormError("");
    if (typeof openModal === "function") openModal("modalUserEdit");
    else if (nameEl) nameEl.focus();
  }

  function saveUserFromModal() {
    var data = userModal.data;
    var isEdit = userModal.isEdit;
    var syncFn = userModal.syncFn;
    if (!data) return;

    var treeApi = initUnitTreeSelect();
    var rawOrgId = treeApi ? treeApi.getValue() : "";
    if (!rawOrgId) {
      showUserFormError("请选择所属单位。");
      return;
    }
    var orgId = normalizeOrgId(rawOrgId);
    var name = document.getElementById("su-f-name") ? document.getElementById("su-f-name").value.trim() : "";
    var phone = document.getElementById("su-f-phone") ? document.getElementById("su-f-phone").value.trim() : "";
    var account = document.getElementById("su-f-account") ? document.getElementById("su-f-account").value.trim() : "";
    var rolePerm = document.getElementById("su-f-roleperm")
      ? document.getElementById("su-f-roleperm").value
      : getRolePermOptions()[0] || "系统管理员";
    var sortRaw = document.getElementById("su-f-sort") ? document.getElementById("su-f-sort").value : "100";
    var sort = parseInt(sortRaw, 10);
    if (isNaN(sort)) sort = 100;
    var enabled = isEdit ? data.enabled !== false : true;

    if (!name) {
      showUserFormError("请填写姓名。");
      return;
    }
    if (!phone) {
      showUserFormError("请填写电话。");
      return;
    }
    if (!account) {
      showUserFormError("请填写账号。");
      return;
    }
    var list = loadUsers();
    var dupPhone = list.some(function (u) {
      return String(u.phone).trim() === phone && u.id !== data.id;
    });
    if (dupPhone) {
      showUserFormError("该电话已存在。");
      return;
    }
    var dupAccount = list.some(function (u) {
      return String(u.account).trim() === account && u.id !== data.id;
    });
    if (dupAccount) {
      showUserFormError("该账号已存在。");
      return;
    }
    var next = {
      id: data.id,
      orgId: orgId,
      name: name,
      phone: phone,
      account: account,
      rolePerm: rolePerm,
      sort: sort,
      enabled: enabled,
      created: isEdit ? data.created : formatNow(),
    };
    var idx = list.findIndex(function (u) {
      return u.id === next.id;
    });
    if (idx >= 0) list[idx] = next;
    else list.unshift(next);
    saveUsers(sortUsersForList(list));
    global.LadsStorage.appendLog(isEdit ? "用户编辑" : "用户新增", next.phone + " " + next.name);
    global.LadsBus.emit("toast", { text: (isEdit ? "已更新 " : "已新增 ") + next.name });
    if (typeof closeModal === "function") closeModal("modalUserEdit");
    if (syncFn) syncFn();
  }


  function deleteByIds(ids, sync) {
    if (!ids || !ids.length) return;
    var list = loadUsers();
    var next = list.filter(function (u) {
      return ids.indexOf(u.id) < 0;
    });
    if (next.length === list.length) return;
    saveUsers(next);
    global.LadsStorage.appendLog("用户删除", ids.join(", "));
    global.LadsBus.emit("toast", { text: "已删除 " + ids.length + " 条" });
    state.page = 1;
    sync();
  }

  function suTh(label, extraCls, widthPx) {
    var cls = extraCls ? extraCls + " " : "";
    return (
      '<th class="' +
      cls +
      '" style="width:' +
      widthPx +
      'px">' +
      '<div class="th-flex-container"><div class="th-title">' +
      escapeHtml(label) +
      '</div><div class="th-divider"></div></div></th>'
    );
  }

  function usersTableTheadHtml() {
    return (
      '<thead id="tblUsers-head"><tr>' +
      suTh("序号", "col-fixed-left", 60) +
      suTh("姓名", "", 100) +
      suTh("电话", "", 130) +
      suTh("账号", "", 120) +
      suTh("所属单位", "", 160) +
      suTh("角色权限", "", 120) +
      suTh("排序", "", 72) +
      suTh("创建时间", "col-created", 200) +
      suTh("状态", "", 80) +
      suTh("操作", "col-fixed-right", 220) +
      "</tr></thead>"
    );
  }

  function renderPaginationBar(total) {
    if (global.TzttSysPagination) {
      global.TzttSysPagination.render("section-pagination", total, state.page, state.pageSize, "suGoPage", function (size) {
        state.pageSize = size;
        state.page = 1;
        var root = document.getElementById("sys-admin-root");
        var w = root && (root.querySelector(".sys-users-root") || root.firstElementChild);
        if (w && w._suRenderTable) w._suRenderTable();
        else if (w && w._suSync) w._suSync();
      });
      return;
    }
    if (A && A.renderPagination) {
      A.renderPagination(total, state.page, state.pageSize, "suGoPage");
      return;
    }
    if (typeof renderPagination === "function") {
      renderPagination("section-pagination", total, state.page, state.pageSize, "suGoPage");
    }
  }

  function renderTable() {
    var q = queryUsers();
    var rows = q.rows;
    var total = q.total;
    var tbody = document.getElementById(TABLE_ID + "-body");
    if (!tbody) return;
    var colspan = COLS.length;
    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="' + colspan + '" style="text-align:center;padding:40px;color:#999">暂无数据</td></tr>';
      if (A && A.syncRowColClasses) A.syncRowColClasses(TABLE_ID);
      var suRootEmpty = document.getElementById("sys-admin-root");
      var suWrapEmpty = suRootEmpty && (suRootEmpty.querySelector(".sys-users-root") || suRootEmpty.firstElementChild);
      if (suWrapEmpty && suWrapEmpty._suRebuildColList) suWrapEmpty._suRebuildColList();
      renderPaginationBar(0);
      return;
    }
    tbody.innerHTML = rows
      .map(function (u, idx) {
        var serial = total - (state.page - 1) * state.pageSize - idx;
        var serialStr = String(serial);
        if (serialStr.length < 2) serialStr = "0" + serialStr;
        return (
          "<tr>" +
          '<td class="col-fixed-left">' +
          H(serialStr) +
          "</td><td>" +
          H(maskName(u.name)) +
          "</td><td>" +
          maskPhone(u.phone) +
          "</td><td>" +
          H(u.account || "—") +
          "</td><td>" +
          H(orgName(u.orgId)) +
          "</td><td>" +
          H(u.rolePerm) +
          "</td><td>" +
          H(String(u.sort != null ? u.sort : "")) +
          '</td><td class="col-created">' +
          H(u.created) +
          '</td><td><label class="table-switch" title="' +
          (u.enabled ? "启用" : "停用") +
          '"><input type="checkbox" class="su-toggle" data-id="' +
          H(u.id) +
          '"' +
          (u.enabled ? " checked" : "") +
          ' /><span class="table-switch__slider"></span></label></td>' +
          '<td class="col-actions col-fixed-right sys-users-td-actions"><div class="dl-actions">' +
          '<button type="button" class="dl-link su-reset-pwd" data-id="' +
          H(u.id) +
          '">重置密码</button>' +
          '<button type="button" class="dl-link su-edit" data-id="' +
          H(u.id) +
          '">编辑</button>' +
          '<button type="button" class="dl-link su-del" data-id="' +
          H(u.id) +
          '">删除</button></div></td></tr>'
        );
      })
      .join("");
    if (A && A.syncRowColClasses) A.syncRowColClasses(TABLE_ID);
    var suRoot = document.getElementById("sys-admin-root");
    var suWrap = suRoot && (suRoot.querySelector(".sys-users-root") || suRoot.firstElementChild);
    if (suWrap && suWrap._suRebuildColList) suWrap._suRebuildColList();
    renderPaginationBar(total);
  }

  function initSuTableChrome(wrap) {
    var table = document.getElementById(TABLE_ID);
    var btnCol = wrap.querySelector("#su-col-settings");
    var colPanel = wrap.querySelector("#su-col-panel");
    var colListWrap = wrap.querySelector("#su-col-list-container");
    if (!table || !colListWrap) return;

    function buildColList() {
      var headers = Array.from(table.querySelectorAll("thead th"));
      colListWrap.innerHTML = headers
        .map(function (th, idx) {
          var titleEl = th.querySelector(".th-title");
          var label = titleEl ? titleEl.textContent.trim() : (th.textContent || "").trim();
          var fixed = th.classList.contains("col-fixed-left") || th.classList.contains("col-fixed-right");
          var hidden = th.style.display === "none";
          return (
            '<div class="col-list-item">' +
            '<input type="checkbox"' +
            (hidden ? "" : " checked") +
            ' id="su-chk-' +
            idx +
            '" data-idx="' +
            idx +
            '"' +
            (fixed ? " disabled" : "") +
            ">" +
            '<label for="su-chk-' +
            idx +
            '" style="cursor:pointer;flex:1;">' +
            H(label) +
            "</label></div>"
          );
        })
        .join("");
    }

    buildColList();
    wrap._suRebuildColList = buildColList;

    if (btnCol && colPanel) {
      btnCol.onclick = function (e) {
        e.stopPropagation();
        colPanel.classList.toggle("show");
      };
      colPanel.onclick = function (e) {
        e.stopPropagation();
      };
    }

    if (!suColDocClickBound) {
      suColDocClickBound = true;
      document.addEventListener("click", function () {
        var panel = document.querySelector("#su-col-panel.show");
        if (panel) panel.classList.remove("show");
      });
    }

    colListWrap.onchange = function (e) {
      var t = e.target;
      if (!t.dataset || t.dataset.idx === undefined) return;
      var idx = parseInt(t.dataset.idx, 10);
      var show = t.checked;
      var cells = table.querySelectorAll("tr > *:nth-child(" + (idx + 1) + ")");
      cells.forEach(function (c) {
        c.style.display = show ? "" : "none";
      });
    };

    function updateTableShadow() {
      var scrollWrap = wrap.querySelector("#su-scroll-wrap");
      if (!scrollWrap) return;
      var sl = scrollWrap.scrollLeft;
      var max = scrollWrap.scrollWidth - scrollWrap.clientWidth;
      scrollWrap.classList.toggle("is-scrolling-left", sl > 0);
      scrollWrap.classList.toggle("is-scrolling-right", sl < max - 1);
    }
    wrap._suUpdateTableShadow = updateTableShadow;
    if (!wrap._suScrollShadowBound) {
      wrap._suScrollShadowBound = true;
      wrap.addEventListener(
        "scroll",
        function (e) {
          if (e.target && e.target.id === "su-scroll-wrap") updateTableShadow();
        },
        true
      );
      window.addEventListener("resize", updateTableShadow);
    }
    setTimeout(updateTableShadow, 200);
  }

  global.suGoPage = function (p) {
    var q = queryUsers();
    var totalPages = q.pages || 1;
    var page = Number(p) || 1;
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    state.page = page;
    var root = document.getElementById("sys-admin-root");
    var w = root && (root.querySelector(".sys-users-root") || root.firstElementChild);
    if (w && w._suRenderTable) w._suRenderTable();
    else if (w && w._suSync) w._suSync();
  };

  function expandAncestorsOf(orgId) {
    var list = loadOrgDepts();
    var cur = list.find(function (d) {
      return d.id === orgId;
    });
    while (cur && cur.parentId) {
      state.treeExpandedDepts[cur.parentId] = true;
      cur = list.find(function (d) {
        return d.id === cur.parentId;
      });
    }
  }

  function ensureTreeExpandedDefaults() {
    if (state._treeDefaultsSeeded) return;
    state._treeDefaultsSeeded = true;
    ensureDefaultOrgSelection();
    var rootId = getRootDeptId(loadOrgDepts());
    state.treeExpandedDepts[rootId] = true;
    expandAncestorsOf(state.orgId);
  }

  function render(root) {
    refreshOrgData();
    ensureDefaultOrgSelection();
    ensureTreeExpandedDefaults();
    var wrap = document.createElement("div");
    wrap.className = "sys-users-root";
    root.appendChild(wrap);

    function renderOrgTreeOnly() {
      var body = wrap.querySelector(".sys-org-tree__body");
      if (body) body.innerHTML = orgTreeHtml();
    }

    function sync() {
      refreshOrgData();
      wrap.innerHTML =
        '<div class="su-shell' +
        (state.treeCollapsed ? " su-shell--tree-collapsed" : "") +
        '">' +
        '<aside class="sys-org-tree" aria-label="单位筛选">' +
        '<div class="sys-org-tree__head">单位组织</div>' +
        '<div class="sys-org-tree__search">' +
        '<input type="search" id="su-tree-filter" class="sys-org-tree__input" placeholder="输入单位名称搜索" value="' +
        escapeHtml(state.treeFilter) +
        '" />' +
        "</div>" +
        '<div class="sys-org-tree__body">' +
        orgTreeHtml() +
        "</div></aside>" +
        '<button type="button" class="sys-org-tree__toggle' +
        (state.treeCollapsed ? " sys-org-tree__toggle--collapsed" : "") +
        '" id="su-tree-toggle" title="' +
        (state.treeCollapsed ? "展开机构树" : "收起机构树") +
        '" aria-expanded="' +
        (!state.treeCollapsed ? "true" : "false") +
        '">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        "</button>" +
        '<div class="dm-right sys-users-main">' +
        '<div class="dm-panel dm-panel--filters">' +
        '<div class="filter-bar" id="suFilterBar" data-fb-collapse-after="2">' +
        '<div class="filter-bar__grid">' +
        '<div class="filter-bar__cell"><div class="filter-bar__cell-inner"><label class="filter-bar__label" for="su-name">姓名</label><div class="filter-bar__control"><input id="su-name" placeholder="请输入" value="' +
        escapeHtml(state.nameKw) +
        '" /></div></div></div>' +
        '<div class="filter-bar__cell"><div class="filter-bar__cell-inner"><label class="filter-bar__label" for="su-phone">电话</label><div class="filter-bar__control"><input id="su-phone" placeholder="请输入" value="' +
        escapeHtml(state.phoneKw) +
        '" /></div></div></div>' +
        '<div class="filter-bar__cell"><div class="filter-bar__cell-inner"><label class="filter-bar__label" for="su-status">状态</label><div class="filter-bar__control"><select id="su-status"><option value="">全部状态</option><option value="on">启用</option><option value="off">停用</option></select></div></div></div>' +
        '<div class="filter-bar__cell filter-bar__cell--actions"><div class="filter-bar__actions">' +
        '<button type="button" class="filter-bar__btn filter-bar__btn--ghost" id="su-reset">重置</button>' +
        '<button type="button" class="filter-bar__btn filter-bar__btn--primary" id="su-search">查询</button>' +
        '<span class="filter-bar__toggle-wrap" hidden><button type="button" class="filter-bar__toggle" data-fb-toggle aria-expanded="false"><span class="filter-bar__toggle-text">展开</span><span class="filter-bar__chev"><svg class="filter-bar__chev-svg" width="12" height="12" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span></button></span>' +
        "</div></div></div></div></div>" +
        '<div class="dm-panel table-combined-box" id="combined-table-su">' +
        '<div id="section-table-header">' +
        '<div id="table-tools-su">' +
        '<div class="tools-left-head"><span class="tools-left-title">人员列表</span></div>' +
        '<div class="tools-right-ops">' +
        '<button type="button" class="dl-btn--secondary" id="suTplDownload">模板下载</button>' +
        '<button type="button" class="dl-btn--secondary" id="suBatchImport">批量导入</button>' +
        '<button type="button" class="tool-btn-primary" id="suAddBtn">' +
        '<svg viewBox="0 0 24 24" style="width:14px;stroke:#fff;" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> 新增人员' +
        '</button>' +
        '<div class="tool-icon-btn" id="su-toggle-filter" title="显示/隐藏筛选">' + TOOL_ICON_SEARCH + '</div>' +
        '<div class="tool-icon-btn" id="su-refresh" title="刷新表格">' + TOOL_ICON_REFRESH + '</div>' +
        '<div class="tool-icon-btn" id="su-fullscreen" title="全屏查看">' + TOOL_ICON_FULLSCREEN + '</div>' +
        '<div class="tool-icon-btn" id="su-col-settings" title="列设置">' + TOOL_ICON_COL_SETTINGS + '</div>' +
        '<div class="col-settings-panel" id="su-col-panel">' +
        '<div class="col-settings-title">可展示字段</div>' +
        '<div id="su-col-list-container"></div></div>' +
        '</div></div></div>' +
        '<div id="section-table-body">' +
        '<div class="fixed-table-container" id="su-scroll-wrap">' +
        '<table class="vben-table-std dl-table" id="tblUsers">' +
        usersTableTheadHtml() +
        '<tbody id="tblUsers-body"></tbody>' +
        '</table></div></div>' +
        '<div id="section-pagination" class="section-pagination"></div></div></div></div>' +
        '<input type="file" id="su-import-file" accept="application/json,.json" class="hidden" tabindex="-1" aria-hidden="true" />';
      var st = wrap.querySelector("#su-status");
      if (st) st.value = state.statusFilter;
      if (window.FilterBar) window.FilterBar.init(wrap.querySelector("#suFilterBar"));
      renderTable();
      initSuTableChrome(wrap);
    }

    wrap._suSync = sync;
    wrap._suRenderTable = renderTable;
    wrap._suRenderOrgTree = renderOrgTreeOnly;
    sync();

    bindUserModalOnce();

    wrap.addEventListener("click", function (event) {
      var t = event.target;
      function closest(sel) {
        return t.closest ? t.closest(sel) : null;
      }
      if (closest("#su-tree-toggle")) {
        state.treeCollapsed = !state.treeCollapsed;
        sync();
        return;
      }
      if (closest("#su-search")) {
        state.nameKw = wrap.querySelector("#su-name") ? wrap.querySelector("#su-name").value.trim() : "";
        state.phoneKw = wrap.querySelector("#su-phone") ? wrap.querySelector("#su-phone").value.trim() : "";
        state.statusFilter = wrap.querySelector("#su-status") ? wrap.querySelector("#su-status").value : "";
        state.page = 1;
        sync();
        return;
      }
      if (closest("#su-reset")) {
        state.nameKw = "";
        state.phoneKw = "";
        state.statusFilter = "";
        state.page = 1;
        sync();
        return;
      }
      if (closest("#suAddBtn")) {
        openUserModal(null, sync);
        return;
      }
      if (closest("#su-refresh")) {
        sync();
        return;
      }
      if (closest("#su-fullscreen")) {
        var pageRoot = document.getElementById("suPageRoot");
        if (pageRoot) pageRoot.classList.toggle("vben-table-fullscreen");
        if (wrap._suUpdateTableShadow) setTimeout(wrap._suUpdateTableShadow, 400);
        return;
      }
      if (closest("#su-toggle-filter")) {
        var filterPanel = wrap.querySelector(".sys-users-main .dm-panel--filters");
        if (filterPanel) filterPanel.style.display = filterPanel.style.display === "none" ? "" : "none";
        return;
      }
      if (closest("#suTplDownload")) {
        global.LadsBus.emit("toast", { text: "模板下载（演示）" });
        return;
      }
      if (closest("#suBatchImport")) {
        var fin = wrap.querySelector("#su-import-file");
        if (fin) fin.click();
        return;
      }
      if (t.classList.contains("su-reset-pwd")) {
        var rid = t.getAttribute("data-id");
        var ru = loadUsers().find(function (u) {
          return u.id === rid;
        });
        if (ru) {
          global.LadsStorage.appendLog("重置密码", ru.phone + " " + ru.name);
          global.LadsBus.emit("toast", { text: "已重置 " + ru.name + "（" + ru.phone + "）的密码" });
        }
        return;
      }
      if (t.classList.contains("su-edit")) {
        var eid = t.getAttribute("data-id");
        var user = loadUsers().find(function (u) {
          return u.id === eid;
        });
        if (user) openUserModal(user, sync);
        return;
      }
      if (t.classList.contains("su-del")) {
        var did = t.getAttribute("data-id");
        openUserConfirm("确认删除该人员吗？", function () {
          deleteByIds([did], sync);
        });
        return;
      }
      var treeTog = t.closest && t.closest("[data-tree-toggle]");
      if (treeTog) {
        event.stopPropagation();
        event.preventDefault();
        var tid = treeTog.getAttribute("data-tree-toggle");
        if (tid) {
          if (state.treeExpandedDepts[tid]) delete state.treeExpandedDepts[tid];
          else state.treeExpandedDepts[tid] = true;
          renderOrgTreeOnly();
        }
        return;
      }
      var orgBtn = t.closest && t.closest(".sys-tree-node__row");
      if (orgBtn && orgBtn.getAttribute("data-org-id")) {
        state.orgId = orgBtn.getAttribute("data-org-id");
        expandAncestorsOf(state.orgId);
        state.page = 1;
        renderOrgTreeOnly();
        renderTable();
        return;
      }
    });

    wrap.addEventListener("keydown", function (event) {
      var el = event.target;
      if (!el || !el.getAttribute || !el.getAttribute("data-tree-toggle")) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      var tid = el.getAttribute("data-tree-toggle");
      if (tid) {
        if (state.treeExpandedDepts[tid]) delete state.treeExpandedDepts[tid];
        else state.treeExpandedDepts[tid] = true;
        renderOrgTreeOnly();
      }
    });

    wrap.addEventListener("input", function (event) {
      var el = event.target;
      if (el.id === "su-tree-filter") {
        state.treeFilter = el.value;
        renderOrgTreeOnly();
      }
    });

    wrap.addEventListener("change", function (event) {
      var el = event.target;
      if (el.id === "su-import-file" && el.files && el.files[0]) {
        var file = el.files[0];
        el.value = "";
        var reader = new FileReader();
        reader.onload = function () {
          try {
            var parsed = JSON.parse(reader.result);
            if (!Array.isArray(parsed)) throw new Error("not array");
            var cur = loadUsers();
            var byPhone = {};
            var byAccount = {};
            cur.forEach(function (u) {
              if (u.phone) byPhone[String(u.phone).trim()] = u;
              if (u.account) byAccount[String(u.account).trim()] = u;
            });
            var merged = cur.slice();
            var n = 0;
            parsed.forEach(function (row) {
              if (!row || !row.name) return;
              var phone = row.phone != null ? String(row.phone).trim() : "";
              var account = row.account != null ? String(row.account).trim() : "";
              if (!phone && !account) return;
              var existing = (account && byAccount[account]) || (phone && byPhone[phone]) || null;
              var orgId = row.orgId && isValidOrgId(row.orgId) ? normalizeOrgId(row.orgId) : getRootDeptId(loadOrgDepts());
              var item = {
                id: existing ? existing.id : row.id || "u_imp_" + Date.now() + "_" + n,
                orgId: orgId,
                name: String(row.name).trim(),
                phone: phone,
                account: account,
                rolePerm: canonRolePerm(row.rolePerm != null ? row.rolePerm : row.role != null ? row.role : ""),
                sort: row.sort != null && !isNaN(Number(row.sort)) ? Number(row.sort) : 100,
                created: existing && existing.created ? existing.created : row.created || formatNow(),
                enabled: row.enabled !== false,
              };
              var ix = merged.findIndex(function (u) {
                return u.id === item.id;
              });
              if (ix >= 0) merged[ix] = item;
              else merged.unshift(item);
              if (item.phone) byPhone[String(item.phone).trim()] = item;
              if (item.account) byAccount[String(item.account).trim()] = item;
              n += 1;
            });
            saveUsers(sortUsersForList(merged));
            global.LadsStorage.appendLog("用户导入", String(n) + " 条");
            global.LadsBus.emit("toast", { text: "导入完成（有效 " + n + " 条）" });
            sync();
          } catch (err) {
            global.LadsBus.emit("toast", { text: "导入失败：请检查 JSON 格式" });
          }
        };
        reader.readAsText(file);
        return;
      }
      if (el.classList.contains("su-toggle")) {
        var tid = el.getAttribute("data-id");
        var list = loadUsers();
        var u = list.find(function (x) {
          return x.id === tid;
        });
        if (u) {
          u.enabled = el.checked;
          saveUsers(sortUsersForList(list));
          global.LadsStorage.appendLog("用户状态", u.phone + " → " + (u.enabled ? "启用" : "停用"));
        }
        sync();
        return;
      }
    });
  }

  global.LadsModules = global.LadsModules || {};
  global.LadsModules.sysUsers = {
    title: "工作人员",
    subtitle: "系统配置 · 账号与权限",
    render: render,
  };
})(window);
