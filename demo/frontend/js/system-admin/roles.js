/**
 * 系统管理 · 角色列表与授权（本地存储 LadsStorage.sysRoles）
 */
(function (global) {
  var A = global.TzttAdmin;
  var TABLE_ID = "tblRoles";
  var COLS = ["序号", "角色名称", "角色ID", "备注", "创建时间", "状态", "操作"];

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

  var ROLE_ID_BY_NAME = {
    系统管理员: "admin",
    管理员: "manager",
    资产管理员: "asset-manager",
    合同管理员: "contract-manager",
    财务专员: "finance",
    只读用户: "viewer",
  };
  var ACTIONS = [
    { key: "view", label: "查" },
    { key: "create", label: "增" },
    { key: "edit", label: "改" },
    { key: "delete", label: "删" },
    { key: "import", label: "导入" },
    { key: "export", label: "导出" },
  ];
  /** 各菜单页可用操作（对齐本项目管理端实际能力） */
  var DEFAULT_ACTIONS_BY_PATH = {
    "/web/workbench": ["view"],
    "/web/rectify": ["view", "create", "edit", "delete", "import", "export"],
    "/web/ledger-street": ["view", "export"],
    "/web/ledger-survey": ["view", "export"],
    "/web/sys-org": ["view", "create", "edit", "delete"],
    "/web/sys-staff": ["view", "create", "edit", "delete", "import"],
    "/web/sys-roles": ["view", "create", "edit", "delete"],
    "/web/sys-dict": ["view", "create", "edit", "delete"],
    "/web/sys-logs": ["view", "export"],
  };

  function toRoleId(name, fallback) {
    var n = String(name || "").trim();
    if (ROLE_ID_BY_NAME[n]) return ROLE_ID_BY_NAME[n];
    var ascii = n
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (ascii) return ascii;
    return fallback != null && String(fallback).trim() !== "" ? String(fallback).trim() : "role";
  }

  function normMenuPath(p) {
    var s = String(p || "").trim();
    if (!s) return "";
    if (s.charAt(0) !== "/") s = "/" + s;
    return s.replace(/\.html$/i, "");
  }

  function permissionKey(path, action) {
    return "menu:" + path + ":" + action;
  }

  function shortenMenuPath(path) {
    var p = String(path || "").trim();
    if (!p) return "";
    var m = p.match(/\/pages\/(.+)$/i);
    if (m) return "/" + m[1].replace(/\.html$/i, "");
    return p.replace(/\.html$/i, "");
  }

  function hasPerm(sel, path, action) {
    if (!path) return false;
    var candidates = [permissionKey(path, action), permissionKey(shortenMenuPath(path), action)];
    for (var i = 0; i < candidates.length; i += 1) {
      if (sel[candidates[i]]) return true;
    }
    if (sel[path + ":" + action]) return true;
    if (action === "view" && (sel["menu:" + path] || sel[path] || sel["menu:" + shortenMenuPath(path)])) return true;
    return false;
  }

  function actionsForPath(path) {
    var norm = normMenuPath(path);
    if (DEFAULT_ACTIONS_BY_PATH[norm]) return DEFAULT_ACTIONS_BY_PATH[norm].slice();
    if (DEFAULT_ACTIONS_BY_PATH[path]) return DEFAULT_ACTIONS_BY_PATH[path].slice();
    var short = shortenMenuPath(path);
    if (short && DEFAULT_ACTIONS_BY_PATH[short]) return DEFAULT_ACTIONS_BY_PATH[short].slice();
    var p = String(path || "").toLowerCase();
    if (!p || p === "#") return [];
    if (p.indexOf("workbench") >= 0) return ["view"];
    if (p.indexOf("ledger-") >= 0) return ["view", "export"];
    if (p.indexOf("sys-logs") >= 0) return ["view", "export"];
    if (p.indexOf("sys-org") >= 0) return ["view", "create", "edit", "delete"];
    if (p.indexOf("sys-staff") >= 0) return ["view", "create", "edit", "delete", "import"];
    if (p.indexOf("sys-roles") >= 0) return ["view", "create", "edit", "delete"];
    if (p.indexOf("sys-dict") >= 0) return ["view", "create", "edit", "delete"];
    if (p.indexOf("rectify") >= 0) return ["view", "create", "edit", "delete", "import", "export"];
    return ["view"];
  }

  function formatSlash(created) {
    var t = String(created || "").trim();
    if (!t) return "—";
    if (t.indexOf("/") >= 0 && t.indexOf("-") < 0) return t;
    var m = t.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2}:\d{2})/);
    if (m) return m[1] + "/" + m[2] + "/" + m[3] + " " + m[4];
    return t;
  }

  function slugify(str) {
    return String(str || "")
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function parseMenuGroupEl(groupEl, index) {
    if (!groupEl) return null;
    var menuItem = groupEl.querySelector(":scope > .menu-item");
    if (!menuItem) return null;
    var title = menuItem.getAttribute("data-title") || "";
    if (!title) {
      var span = menuItem.querySelector("span");
      title = span ? span.textContent.trim() : "菜单";
    }
    var path = menuItem.getAttribute("data-path") || "";
    var hasChild = menuItem.getAttribute("data-has-child") === "true";
    if (hasChild) {
      var children = [];
      var submenu = groupEl.querySelector(":scope > .submenu");
      if (submenu) {
        var childGroups = submenu.querySelectorAll(".menu-group");
        for (var j = 0; j < childGroups.length; j += 1) {
          var ch = parseMenuGroupEl(childGroups[j], j);
          if (ch) children.push(ch);
        }
      }
      return {
        key: "menu-group:" + slugify(title || "group-" + index),
        label: title,
        path: "",
        children: children,
      };
    }
    return {
      key: path ? "menu:" + path : "menu:direct:" + slugify(title || "item-" + index),
      label: title,
      path: path,
      children: [],
    };
  }

  function buildMenuPermTreeFromNav() {
    var nav = global.HSF_NAV || global.RD_NAV || [];
    var items = [];
    nav.forEach(function (m, i) {
      if (m.children && m.children.length) {
        var children = [];
        m.children.forEach(function (c, j) {
          if (!c.path) return;
          children.push({
            key: "menu:" + normMenuPath(c.path),
            label: c.label || "菜单",
            path: normMenuPath(c.path),
            children: [],
          });
        });
        if (children.length) {
          items.push({
            key: "menu-group:" + slugify(m.label || "group-" + i),
            label: m.label || "菜单组",
            path: "",
            children: children,
          });
        }
      } else if (m.path) {
        items.push({
          key: "menu:" + normMenuPath(m.path),
          label: m.label || "菜单",
          path: normMenuPath(m.path),
          children: [],
        });
      }
    });
    return items;
  }

  function buildMenuPermTree() {
    var menuRoot = document.getElementById("menu-root");
    if (menuRoot) {
      var items = [];
      var groups = menuRoot.querySelectorAll(":scope > .menu-group");
      for (var i = 0; i < groups.length; i += 1) {
        var item = parseMenuGroupEl(groups[i], i);
        if (item) items.push(item);
      }
      if (items.length) return items;
    }
    return buildMenuPermTreeFromNav();
  }

  var V15_TICK =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  var V15_ARROW =
    '<div class="auth-arrow" onclick="v15ToggleFold(this); event.stopPropagation();"><svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z" /></svg></div>';
  var V15_ARROW_HIDDEN = '<div class="auth-arrow hidden"></div>';

  function v15CheckboxHtml(checked, perm) {
    var cls = "auth-checkbox" + (checked ? " checked" : "");
    var dp = perm ? ' data-perm="' + escapeHtml(perm) + '"' : "";
    return (
      '<div class="' +
      cls +
      '"' +
      dp +
      ' onclick="v15ToggleCheck(this); event.stopPropagation();">' +
      (checked ? V15_TICK : "") +
      "</div>"
    );
  }

  function v15ActionsInlineHtml(path, sel) {
    var acts = actionsForPath(path);
    if (!acts.length) return "";
    var html = '<div class="auth-actions-inline">';
    ACTIONS.forEach(function (action) {
      if (acts.indexOf(action.key) < 0) return;
      var pKey = permissionKey(path, action.key);
      var on = hasPerm(sel, path, action.key);
      html +=
        '<div class="auth-node auth-node--action" onclick="v15ToggleNode(event, this)">' +
        v15CheckboxHtml(on, pKey) +
        '<span class="auth-label" onclick="v15ToggleLabel(this); event.stopPropagation();">' +
        escapeHtml(action.label) +
        "</span></div>";
    });
    html += "</div>";
    return html;
  }

  function v15RowChecked(path, sel) {
    var acts = actionsForPath(path);
    for (var i = 0; i < acts.length; i += 1) {
      if (hasPerm(sel, path, acts[i])) return true;
    }
    return false;
  }

  function v15MenuRowHtml(ch, sel) {
    if (!ch.path) return "";
    var rowOn = v15RowChecked(ch.path, sel);
    return (
      "<li>" +
      '<div class="auth-node auth-node--row" data-id="' +
      escapeHtml(ch.key) +
      '" onclick="v15ToggleNode(event, this)">' +
      V15_ARROW_HIDDEN +
      v15CheckboxHtml(rowOn, "") +
      '<span class="auth-label auth-label--menu" onclick="v15ToggleLabel(this); event.stopPropagation();">' +
      escapeHtml(ch.label) +
      "</span>" +
      v15ActionsInlineHtml(ch.path, sel) +
      "</div></li>"
    );
  }

  function v15LeafRowHtml(item, sel) {
    if (!item.path) return "";
    var rowOn = v15RowChecked(item.path, sel);
    return (
      "<li>" +
      '<div class="auth-node auth-node--row" data-id="' +
      escapeHtml(item.key) +
      '" onclick="v15ToggleNode(event, this)">' +
      V15_ARROW_HIDDEN +
      v15CheckboxHtml(rowOn, "") +
      '<span class="auth-label auth-label--menu" onclick="v15ToggleLabel(this); event.stopPropagation();">' +
      escapeHtml(item.label) +
      "</span>" +
      v15ActionsInlineHtml(item.path, sel) +
      "</div></li>"
    );
  }

  function buildV15PermTreeHtml(selected) {
    var sel = {};
    (selected || []).forEach(function (k) {
      sel[k] = true;
    });
    var tree = buildMenuPermTree();
    if (!tree.length) {
      return '<p class="text-sm" style="margin:0;padding:12px;color:#999;">导航尚未加载，请稍候后关闭弹窗重试。</p>';
    }
    var html = "<ul>";
    tree.forEach(function (item) {
      var hasChildren = item.children && item.children.length;
      if (hasChildren) {
        html +=
          "<li>" +
          '<div class="auth-node" data-id="' +
          escapeHtml(item.key) +
          '" onclick="v15ToggleNode(event, this)">' +
          V15_ARROW +
          v15CheckboxHtml(false, "") +
          '<div class="auth-label" onclick="v15ToggleLabel(this); event.stopPropagation();">' +
          escapeHtml(item.label) +
          "</div></div>" +
          '<ul class="auth-sub-list">';
        item.children.forEach(function (ch) {
          html += v15MenuRowHtml(ch, sel);
        });
        html += "</ul></li>";
      } else if (item.path) {
        html += v15LeafRowHtml(item, sel);
      }
    });
    html += "</ul>";
    return html;
  }

  var roleModal = { data: null, isEdit: false, syncFn: null };
  var roleModalBound = false;

  function showRoleFormError(msg) {
    var el = document.getElementById("sr-form-error");
    if (!el) return;
    if (msg) {
      el.textContent = msg;
      el.style.display = "block";
    } else {
      el.textContent = "";
      el.style.display = "none";
    }
  }

  function bindRoleModalOnce() {
    if (roleModalBound) return;
    roleModalBound = true;
    var saveBtn = document.getElementById("srRoleSaveBtn");
    if (saveBtn) {
      saveBtn.addEventListener("click", saveRoleFromModal);
    }
  }
  function canonRoleName(name) {
    var s = name != null ? String(name).trim() : "";
    if (s === "店长") return "管理员";
    return s;
  }

  function normalizeRole(r) {
    if (!r || !r.id) return r;
    var keys = Array.isArray(r.permKeys) ? r.permKeys.slice() : [];
    var roleName = canonRoleName(r.name);
    var roleId = r.roleId != null ? String(r.roleId).trim() : "";
    if (roleName === "管理员" && (!roleId || roleId === "store-manager")) roleId = "manager";
    return {
      id: r.id,
      name: roleName,
      roleId: toRoleId(roleName, roleId),
      enabled: r.enabled !== false,
      remark: r.remark != null ? String(r.remark) : "",
      created: r.created || "",
      permKeys: keys,
    };
  }

  function loadRoles() {
    var raw = global.LadsStorage.get("sysRoles", []);
    if (!raw || !Array.isArray(raw) || raw.length === 0) return [];
    var list = raw.map(normalizeRole);
    var dirty = raw.some(function (r, i) {
      if (!r || !list[i]) return false;
      return String(r.name || "").trim() === "店长" || r.name !== list[i].name || r.roleId !== list[i].roleId;
    });
    if (dirty) saveRoles(list);
    return list;
  }

  function saveRoles(list) {
    global.LadsStorage.set("sysRoles", list);
  }

  var state = {
    page: 1,
    pageSize: 10,
    nameKw: "",
    idKw: "",
  };

  function queryRoles() {
    var list = loadRoles().filter(function (r) {
      if (state.nameKw && r.name.indexOf(state.nameKw) < 0) return false;
      if (state.idKw && String(r.roleId).toLowerCase().indexOf(state.idKw.toLowerCase()) < 0) return false;
      return true;
    });
    var total = list.length;
    var pages = Math.max(1, Math.ceil(total / state.pageSize));
    if (state.page > pages) state.page = pages;
    var start = (state.page - 1) * state.pageSize;
    return { rows: list.slice(start, start + state.pageSize), total: total, pages: pages };
  }

  function openRoleModal(existing, sync) {
    bindRoleModalOnce();
    var isEdit = !!existing;
    var data = existing ? normalizeRole(existing) : {
          id: "role_" + Date.now(),
          name: "",
          roleId: "",
          enabled: true,
          remark: "",
          created: "",
          permKeys: ["dash:view"],
        };
    if (!data.created) {
      var now = new Date();
      function p2(n) {
        return n < 10 ? "0" + n : String(n);
      }
      data.created =
        now.getFullYear() +
        "/" +
        p2(now.getMonth() + 1) +
        "/" +
        p2(now.getDate()) +
        " " +
        p2(now.getHours()) +
        ":" +
        p2(now.getMinutes()) +
        ":" +
        p2(now.getSeconds());
    }
    roleModal.data = data;
    roleModal.isEdit = isEdit;
    roleModal.syncFn = sync;

    var titleEl = document.getElementById("modalRoleEditTitle");
    if (titleEl) titleEl.textContent = isEdit ? "编辑角色" : "新增角色";

    var nameEl = document.getElementById("sr-f-name");
    if (nameEl) nameEl.value = data.name || "";

    var remarkEl = document.getElementById("sr-f-remark");
    if (remarkEl) remarkEl.value = data.remark || "";

    var treeRoot = document.getElementById("v15-tree-root");
    if (treeRoot) {
      treeRoot.innerHTML = buildV15PermTreeHtml(data.permKeys);
      if (global.v15ApplyPermKeys) {
        global.v15ApplyPermKeys(treeRoot, data.permKeys);
      }
      if (!buildMenuPermTree().length) {
        setTimeout(function () {
          if (!roleModal.data || roleModal.data.id !== data.id) return;
          treeRoot.innerHTML = buildV15PermTreeHtml(data.permKeys);
          if (global.v15ApplyPermKeys) global.v15ApplyPermKeys(treeRoot, data.permKeys);
        }, 120);
      }
    }

    showRoleFormError("");
    if (typeof openModal === "function") openModal("modalRoleEdit");
    else if (nameEl) nameEl.focus();
  }

  function saveRoleFromModal() {
    var data = roleModal.data;
    var isEdit = roleModal.isEdit;
    var syncFn = roleModal.syncFn;
    if (!data) return;

    showRoleFormError("");
    var nameEl = document.getElementById("sr-f-name");
    var name = nameEl ? String(nameEl.value || "").trim() : "";
    var remark = document.getElementById("sr-f-remark") ? document.getElementById("sr-f-remark").value.trim() : "";
    var enabled = isEdit ? data.enabled !== false : true;
    var treeRoot = document.getElementById("v15-tree-root");
    var keys = global.v15CollectPermKeys ? global.v15CollectPermKeys(treeRoot) : [];

    if (!name) {
      showRoleFormError("请填写角色名称。");
      return;
    }
    var list = loadRoles();
    var dup = list.some(function (r) {
      return r.name === name && r.id !== data.id;
    });
    if (dup) {
      showRoleFormError("角色名称已存在。");
      return;
    }
    var next = {
      id: data.id,
      name: name,
      roleId: toRoleId(name, data.roleId),
      enabled: enabled,
      remark: remark,
      created: data.created,
      permKeys: keys.length ? keys : ["dash:view"],
    };
    var ix = list.findIndex(function (r) {
      return r.id === data.id;
    });
    if (ix >= 0) list[ix] = next;
    else list.unshift(next);
    saveRoles(list);
    global.LadsStorage.appendLog(isEdit ? "角色编辑" : "角色新增", next.name);
    global.LadsBus.emit("toast", { text: isEdit ? "已保存" : "已新增角色" });
    if (typeof closeModal === "function") closeModal("modalRoleEdit");
    if (syncFn) syncFn();
  }

  global.srGoPage = function (p) {
    var q = queryRoles();
    var totalPages = q.pages || 1;
    var page = Number(p) || 1;
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    state.page = page;
    var root = document.getElementById("sys-admin-root");
    var w = root && root.firstElementChild;
    if (w && w._srSync) w._srSync();
  };


  var QUERY_CARD_ID = "query-group-sys-roles";

  function buildQueryCardHtml() {
    return (
      '<div class="query-card collapsed" id="' +
      QUERY_CARD_ID +
      '">' +
      '<div class="query-grid">' +
      '<div class="query-item">' +
      '<label class="query-label" for="sr-filter-name">角色名称：</label>' +
      '<div class="comp-wrap"><input id="sr-filter-name" class="vben-input" type="text" placeholder="请输入" autocomplete="off" /></div>' +
      "</div>" +
      '<div class="query-item">' +
      '<label class="query-label" for="sr-filter-id">角色ID：</label>' +
      '<div class="comp-wrap"><input id="sr-filter-id" class="vben-input" type="text" placeholder="请输入" autocomplete="off" /></div>' +
      "</div>" +
      '<div class="query-actions">' +
      '<button type="button" class="btn-ghost" id="sr-btn-reset">重 置</button>' +
      '<button type="button" class="btn-primary" id="sr-btn-search">查 询</button>' +
      '<div class="toggle-link" id="sr-toggle-query">' +
      '<span class="text">展开</span>' +
      '<div class="arrow-icon">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" /></svg>' +
      "</div></div>" +
      "</div></div></div>"
    );
  }

  function buildPageShell() {
    return (
      '<div class="dm-right biz-page sys-admin-page sys-roles-root"><div class="crm-leads-stack">' +
      buildQueryCardHtml() +
      '<div id="combined-table-sr" class="table-combined-box dm-panel">' +
      '<div id="section-table-header">' +
      '<div id="table-tools-sr">' +
      '<div class="tools-left-head"><span class="tools-left-title">角色管理</span></div>' +
      '<div class="tools-right-ops">' +
      '<button type="button" class="tool-btn-primary" id="sr-add">' +
      '<svg viewBox="0 0 24 24" style="width:14px; stroke:#fff;" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> 新增角色' +
      '</button>' +
      '<div class="tool-icon-btn" id="sr-toggle-filter" title="搜索/隐藏查询">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>' +
      '</div>' +
      '<div class="tool-icon-btn" id="sr-refresh" title="刷新表格">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>' +
      '</div>' +
      '<div class="tool-icon-btn" id="sr-fullscreen" title="全屏查看">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>' +
      '</div>' +
      '<div class="tool-icon-btn" id="sr-col-settings" title="列设置">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>' +
      '</div>' +
      '<div class="col-settings-panel" id="sr-col-panel">' +
      '<div class="col-settings-title">可展示字段</div>' +
      '<div id="sr-col-list-container"></div>' +
      '</div>' +
      '</div></div></div>' +
      '<div id="section-table-body">' +
      '<div class="fixed-table-container">' +
      '<table class="vben-table-std" id="' + TABLE_ID + '">' +
      '<thead id="' + TABLE_ID + '-head"><tr></tr></thead>' +
      '<tbody id="' + TABLE_ID + '-body"></tbody>' +
      '</table></div></div>' +
      '<div id="section-pagination" class="section-pagination"></div>' +
      '</div></div></div>'
    );
  }


  function initRolesQuery(wrap, sync) {
    var queryRoot = wrap.querySelector("#query-group-sys-roles");
    var btnSearch = wrap.querySelector("#sr-btn-search");
    var btnReset = wrap.querySelector("#sr-btn-reset");
    if (btnSearch) {
      btnSearch.addEventListener("click", function () {
        state.nameKw = wrap.querySelector("#sr-filter-name") ? wrap.querySelector("#sr-filter-name").value.trim() : "";
        state.idKw = wrap.querySelector("#sr-filter-id") ? wrap.querySelector("#sr-filter-id").value.trim() : "";
        state.page = 1;
        sync();
      });
    }
    if (btnReset) {
      btnReset.addEventListener("click", function () {
        var n = wrap.querySelector("#sr-filter-name");
        var i = wrap.querySelector("#sr-filter-id");
        if (n) n.value = "";
        if (i) i.value = "";
        state.nameKw = "";
        state.idKw = "";
        state.page = 1;
        sync();
      });
    }
    var toggleQuery = wrap.querySelector("#sr-toggle-query");
    if (toggleQuery && queryRoot) {
      var textSpan = toggleQuery.querySelector(".text");
      toggleQuery.addEventListener("click", function (e) {
        e.stopPropagation();
        var isCollapsed = queryRoot.classList.toggle("collapsed");
        if (textSpan) textSpan.textContent = isCollapsed ? "展开" : "收起";
        window.dispatchEvent(new Event("resize"));
      });
    }
    if (queryRoot) queryRoot.style.display = "";
  }

  function initRolesTableChrome(wrap, sync) {
    var queryGroup = wrap.querySelector("#query-group-sys-roles");
    var toggleFilter = wrap.querySelector("#sr-toggle-filter");
    if (toggleFilter && queryGroup) {
      toggleFilter.addEventListener("click", function (e) {
        e.stopPropagation();
        var hidden = queryGroup.style.display === "none";
        queryGroup.style.display = hidden ? "" : "none";
        window.dispatchEvent(new Event("resize"));
      });
    }

    var refreshBtn = wrap.querySelector("#sr-refresh");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", function () {
        var run = A && A.wrapRefresh ? A.wrapRefresh(sync) : sync;
        run();
      });
    }

    var fsBtn = wrap.querySelector("#sr-fullscreen");
    if (fsBtn) {
      fsBtn.addEventListener("click", function () {
        var container = document.querySelector(".sys-roles-page .content-container");
        if (!container) return;
        var isFull = container.classList.toggle("vben-table-fullscreen");
        document.body.style.overflow = isFull ? "hidden" : "";
      });
    }

    var table = document.getElementById(TABLE_ID);
    var btnCol = wrap.querySelector("#sr-col-settings");
    var colPanel = wrap.querySelector("#sr-col-panel");
    var colListWrap = wrap.querySelector("#sr-col-list-container");
    if (!table || !colListWrap) return;

    function buildColList() {
      var headers = Array.from(table.querySelectorAll("thead th"));
      colListWrap.innerHTML = headers
        .map(function (th, idx) {
          var label = (th.textContent || "").trim();
          var hidden = th.style.display === "none";
          return (
            '<div class="col-list-item">' +
            '<input type="checkbox"' + (hidden ? "" : " checked") + ' id="sr-chk-' + idx + '" data-idx="' + idx + '">' +
            '<label for="sr-chk-' + idx + '" style="cursor:pointer;flex:1;">' + H(label) + "</label></div>"
          );
        })
        .join("");
    }

    buildColList();

    if (btnCol && colPanel) {
      btnCol.addEventListener("click", function (e) {
        e.stopPropagation();
        colPanel.classList.toggle("show");
      });
      document.addEventListener("click", function () {
        colPanel.classList.remove("show");
      });
      colPanel.addEventListener("click", function (e) {
        e.stopPropagation();
      });
    }

    colListWrap.addEventListener("change", function (e) {
      if (!e.target.dataset || e.target.dataset.idx === undefined) return;
      var idx = parseInt(e.target.dataset.idx, 10);
      var show = e.target.checked;
      var cells = table.querySelectorAll("tr > *:nth-child(" + (idx + 1) + ")");
      cells.forEach(function (c) {
        c.style.display = show ? "" : "none";
      });
    });

    wrap._srRebuildColList = buildColList;
  }

  function renderPaginationBar(total) {
    if (A && A.renderPagination) {
      A.renderPagination(total, state.page, state.pageSize, "srGoPage");
      return;
    }
    if (global.TzttSysPagination) {
      global.TzttSysPagination.render("section-pagination", total, state.page, state.pageSize, "srGoPage", function (size) {
        state.pageSize = size;
        state.page = 1;
        var root = document.getElementById("sys-admin-root");
        var w = root && root.firstElementChild;
        if (w && w._srSync) w._srSync();
      });
    } else if (typeof renderPagination === "function") {
      renderPagination("section-pagination", total, state.page, state.pageSize, "srGoPage");
    }
  }

  function renderTable() {
    var q = queryRoles();
    var rows = q.rows;
    var total = q.total;
    var tbody = document.getElementById(TABLE_ID + "-body");
    if (!tbody) return;
    var colspan = COLS.length;
    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="' + colspan + '" style="text-align:center;padding:40px;color:var(--text-light)">暂无数据</td></tr>';
      if (A && A.renderTableHead) A.renderTableHead(TABLE_ID, COLS);
      if (A && A.markFixedColumns) A.markFixedColumns(TABLE_ID, { left: false });
      if (A && A.syncRowColClasses) A.syncRowColClasses(TABLE_ID);
      renderPaginationBar(0);
      return;
    }
    tbody.innerHTML = rows
      .map(function (r, idx) {
        var serial = total - (state.page - 1) * state.pageSize - idx;
        return (
          "<tr>" +
          "<td>" +
          H(String(serial)) +
          '</td><td class="text-sm">' +
          H(r.name) +
          '</td><td class="text-sm col-role-id" title="' +
          H(r.roleId) +
          '">' +
          H(r.roleId) +
          '</td><td class="text-sm">' +
          H(r.remark || "—") +
          '</td><td class="text-sm">' +
          H(formatSlash(r.created)) +
          "</td><td>" +
          '<label class="table-switch" title="' +
          (r.enabled ? "启用" : "停用") +
          '"><input type="checkbox" class="sr-toggle" data-id="' +
          H(r.id) +
          '"' +
          (r.enabled ? " checked" : "") +
          ' /><span class="table-switch__slider"></span></label></td>' +
          '<td class="col-actions col-fixed-right">' +
          '<button type="button" class="btn-text btn-sm sr-edit" data-id="' +
          H(r.id) +
          '">修改</button> ' +
          '<button type="button" class="btn-text btn-sm text-danger sr-del" data-id="' +
          H(r.id) +
          '">删除</button>' +
          "</td></tr>"
        );
      })
      .join("");
    if (A && A.renderTableHead) A.renderTableHead(TABLE_ID, COLS);
    if (A && A.markFixedColumns) A.markFixedColumns(TABLE_ID, { left: false });
    if (A && A.syncRowColClasses) A.syncRowColClasses(TABLE_ID);
    var srRoot = document.getElementById("sys-admin-root");
    var srWrap = srRoot && srRoot.firstElementChild;
    if (srWrap && srWrap._srRebuildColList) srWrap._srRebuildColList();
    renderPaginationBar(total);
  }

  function syncFiltersFromState(wrap) {
    var sn = wrap.querySelector("#sr-filter-name");
    var sid = wrap.querySelector("#sr-filter-id");
    if (sn) sn.value = state.nameKw;
    if (sid) sid.value = state.idKw;
  }

  function render(root) {
    root.innerHTML = buildPageShell();
    var wrap = root.firstElementChild;
    if (!wrap) return;

    function sync() {
      syncFiltersFromState(wrap);
      renderTable();
    }

    wrap._srSync = sync;

    initRolesQuery(wrap, sync);
    initRolesTableChrome(wrap, sync);

    wrap.addEventListener("click", function (event) {
      var t = event.target;
      if (t.id === "sr-add") {
        openRoleModal(null, sync);
        return;
      }
      if (t.classList.contains("sr-edit")) {
        var eid = t.getAttribute("data-id");
        var role = loadRoles().find(function (r) {
          return r.id === eid;
        });
        if (role) openRoleModal(role, sync);
        return;
      }
      if (t.classList.contains("sr-del")) {
        var did = t.getAttribute("data-id");
        global.LadsUi.confirm("确认删除该角色吗？", function () {
          var list = loadRoles().filter(function (r) {
            return r.id !== did;
          });
          saveRoles(list);
          global.LadsStorage.appendLog("角色删除", did);
          global.LadsBus.emit("toast", { text: "已删除" });
          state.page = 1;
          sync();
        });
        return;
      }
    });

    wrap.addEventListener("change", function (event) {
      var el = event.target;
      if (el.classList.contains("sr-toggle")) {
        var tid = el.getAttribute("data-id");
        var list = loadRoles();
        var r = list.find(function (x) {
          return x.id === tid;
        });
        if (r) {
          r.enabled = el.checked;
          saveRoles(list);
          global.LadsStorage.appendLog("角色状态", r.name + " → " + (r.enabled ? "已启用" : "已禁用"));
        }
        sync();
      }
    });

    sync();
  }

  global.LadsModules = global.LadsModules || {};
  global.LadsModules.sysRoles = {
    title: "角色管理",
    subtitle: "系统管理 · 角色与权限集",
    render: render,
  };
})(window);
