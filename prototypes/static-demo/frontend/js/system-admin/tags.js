/**
 * 系统管理 · 标签管理（左分组 + 右标签列表）
 */
(function (global) {
  var A = global.TzttAdmin;
  var TABLE_ID = "tblTags";
  var COLS = ["序号", "标签名称", "标签编码", "排序", "已使用", "是否显示", "创建时间", "操作"];
  var QUERY_CARD_ID = "query-group-sys-tags";
  var CRM_CUSTOMERS_KEY = "rd.assetTags";
  var CRM_CUSTOMER_TAG_GROUP = "crm_customer_tag";

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

  var SEED = {
    groups: [
      { id: "tg_asset", name: "资产标签", code: "asset_tag", sort: 1 },
      { id: "tg_contract", name: "合同标签", code: "contract_tag", sort: 2 },
      { id: "tg_device", name: "设备标签", code: "device_tag", sort: 3 },
    ],
    tags: [
      { id: "tag_101", groupId: "tg_asset", name: "高价值", code: "high_value", sort: 1, visible: true, created: "2026-05-01 14:00:00" },
      { id: "tag_102", groupId: "tg_asset", name: "待整改", code: "rectify", sort: 2, visible: true, created: "2026-05-01 14:05:00" },
      { id: "tag_103", groupId: "tg_asset", name: "维修中", code: "maintaining", sort: 3, visible: true, created: "2026-05-02 14:00:00" },
      { id: "tag_104", groupId: "tg_asset", name: "空置", code: "vacant", sort: 4, visible: true, created: "2026-05-02 14:10:00" },
      { id: "tag_105", groupId: "tg_asset", name: "在租", code: "leased", sort: 5, visible: true, created: "2026-05-03 14:00:00" },
      { id: "tag_201", groupId: "tg_contract", name: "即将到期", code: "expiring", sort: 1, visible: true, created: "2026-05-04 11:00:00" },
      { id: "tag_202", groupId: "tg_contract", name: "欠费", code: "overdue", sort: 2, visible: true, created: "2026-05-04 11:10:00" },
      { id: "tag_203", groupId: "tg_contract", name: "续签中", code: "renewing", sort: 3, visible: true, created: "2026-05-05 11:00:00" },
      { id: "tag_301", groupId: "tg_device", name: "重点监控", code: "key_monitor", sort: 1, visible: true, created: "2026-05-06 09:00:00" },
      { id: "tag_302", groupId: "tg_device", name: "离线告警", code: "offline_alert", sort: 2, visible: true, created: "2026-05-06 09:10:00" },
      { id: "tag_303", groupId: "tg_device", name: "待维护", code: "pending_maint", sort: 3, visible: true, created: "2026-05-07 09:00:00" },
    ],
  };

  var state = {
    activeGroupId: "",
    groupKw: "",
    tagNameKw: "",
    visibleKw: "",
    page: 1,
    pageSize: 10,
  };

  function formatNow() {
    var d = new Date();
    function p(n) {
      return (n < 10 ? "0" : "") + n;
    }
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
  }

  function loadModel() {
    var raw = global.LadsStorage.get("sysTagModel", null);
    if (!raw || !Array.isArray(raw.groups) || !Array.isArray(raw.tags)) {
      global.LadsStorage.set("sysTagModel", SEED);
      raw = SEED;
    }
    return {
      groups: raw.groups.slice().sort(function (a, b) {
        return (Number(a.sort) || 0) - (Number(b.sort) || 0);
      }),
      tags: raw.tags.slice(),
    };
  }

  function saveModel(model) {
    global.LadsStorage.set("sysTagModel", model);
  }

  /** 统计各资产标签名被多少位客户使用（按标签名称，同一客户只计一次） */
  function buildCustomerTagUsageMap() {
    var map = {};
    var raw = null;
    try {
      raw = global.localStorage.getItem(CRM_CUSTOMERS_KEY);
    } catch (e) {}
    if (!raw) return map;
    var list = [];
    try {
      list = JSON.parse(raw);
    } catch (e2) {
      return map;
    }
    if (!Array.isArray(list)) return map;
    list.forEach(function (c) {
      if (!c) return;
      var tags = Array.isArray(c.tags) ? c.tags : [];
      var seen = {};
      tags.forEach(function (t) {
        var name = String(t || "").trim();
        if (!name || seen[name]) return;
        seen[name] = true;
        map[name] = (map[name] || 0) + 1;
      });
    });
    return map;
  }

  function slugCode(name, fallback) {
    var base = String(name || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_\u4e00-\u9fa5]/g, "");
    if (base && /^[a-z]/.test(base.replace(/[^\x00-\x7f]/g, "x"))) return base;
    return fallback || "tag_" + Date.now();
  }

  var groupModal = { data: null, isEdit: false, sync: null };
  var tagModal = { data: null, isEdit: false, sync: null, groupId: "" };

  function showGroupFormError(msg) {
    var err = document.getElementById("stg-form-error");
    if (!err) return;
    if (msg) {
      err.textContent = msg;
      err.style.display = "block";
    } else {
      err.textContent = "";
      err.style.display = "none";
    }
  }

  function showTagFormError(msg) {
    var err = document.getElementById("stt-form-error");
    if (!err) return;
    if (msg) {
      err.textContent = msg;
      err.style.display = "block";
    } else {
      err.textContent = "";
      err.style.display = "none";
    }
  }

  function bindTagModalsOnce() {
    if (bindTagModalsOnce._done) return;
    bindTagModalsOnce._done = true;
    var groupBtn = document.getElementById("stgGroupSaveBtn");
    if (groupBtn) groupBtn.addEventListener("click", saveGroupFromModal);
    var tagBtn = document.getElementById("sttTagSaveBtn");
    if (tagBtn) tagBtn.addEventListener("click", saveTagFromModal);
  }

  function openGroupModal(existing, sync) {
    bindTagModalsOnce();
    var isEdit = !!existing;
    var data = existing || { id: "tg_" + Date.now(), name: "", code: "", sort: 99 };
    groupModal.data = data;
    groupModal.isEdit = isEdit;
    groupModal.sync = sync;

    var titleEl = document.getElementById("modalTagGroupEditTitle");
    if (titleEl) titleEl.textContent = isEdit ? "修改标签分组" : "新增标签分组";

    var nameEl = document.getElementById("stg-name");
    if (nameEl) nameEl.value = data.name || "";

    var codeEl = document.getElementById("stg-code");
    if (codeEl) codeEl.value = data.code || "";

    var sortEl = document.getElementById("stg-sort");
    if (sortEl) sortEl.value = String(data.sort != null ? data.sort : 99);

    showGroupFormError("");
    if (typeof openModal === "function") openModal("modalTagGroupEdit");
    else if (nameEl) nameEl.focus();
  }

  function saveGroupFromModal() {
    var data = groupModal.data;
    var isEdit = groupModal.isEdit;
    var sync = groupModal.sync;
    if (!data) return;

    var name = document.getElementById("stg-name") ? document.getElementById("stg-name").value.trim() : "";
    var code = document.getElementById("stg-code") ? document.getElementById("stg-code").value.trim() : "";
    var sortRaw = document.getElementById("stg-sort") ? document.getElementById("stg-sort").value : "99";
    var sort = Number(sortRaw);

    if (!name || !code) {
      showGroupFormError("请填写分组名称和编码。");
      return;
    }
    var model = loadModel();
    var dup = model.groups.some(function (g) {
      return g.code === code && g.id !== data.id;
    });
    if (dup) {
      showGroupFormError("分组编码已存在。");
      return;
    }
    var next = { id: data.id, name: name, code: code, sort: isNaN(sort) ? 99 : sort };
    var ix = model.groups.findIndex(function (g) {
      return g.id === data.id;
    });
    if (ix >= 0) model.groups[ix] = next;
    else model.groups.unshift(next);
    saveModel(model);
    if (!state.activeGroupId) state.activeGroupId = next.id;
    global.LadsStorage.appendLog(isEdit ? "标签分组编辑" : "标签分组新增", name);
    global.LadsBus.emit("toast", { text: isEdit ? "已保存分组" : "已新增分组" });
    if (typeof closeModal === "function") closeModal("modalTagGroupEdit");
    if (sync) sync();
  }

  function openTagModal(existing, groupId, sync) {
    bindTagModalsOnce();
    var isEdit = !!existing;
    var data = existing || {
      id: "tag_" + Date.now(),
      groupId: groupId,
      name: "",
      code: "",
      sort: 1,
      visible: true,
      created: formatNow(),
    };
    tagModal.data = data;
    tagModal.isEdit = isEdit;
    tagModal.sync = sync;
    tagModal.groupId = groupId;

    var titleEl = document.getElementById("modalTagEditTitle");
    if (titleEl) titleEl.textContent = isEdit ? "修改标签" : "新增标签";

    var nameEl = document.getElementById("stt-name");
    if (nameEl) nameEl.value = data.name || "";

    var codeEl = document.getElementById("stt-code");
    if (codeEl) codeEl.value = data.code || "";

    var sortEl = document.getElementById("stt-sort");
    if (sortEl) sortEl.value = String(data.sort != null ? data.sort : 1);

    showTagFormError("");
    if (typeof openModal === "function") openModal("modalTagEdit");
    else if (nameEl) nameEl.focus();
  }

  function saveTagFromModal() {
    var data = tagModal.data;
    var isEdit = tagModal.isEdit;
    var sync = tagModal.sync;
    var groupId = tagModal.groupId;
    if (!data) return;

    var name = document.getElementById("stt-name") ? document.getElementById("stt-name").value.trim() : "";
    var code = document.getElementById("stt-code") ? document.getElementById("stt-code").value.trim() : "";
    var sortRaw = document.getElementById("stt-sort") ? document.getElementById("stt-sort").value : "1";
    var sort = Number(sortRaw);
    var visible = isEdit ? data.visible !== false : true;

    if (!name) {
      showTagFormError("请填写标签名称。");
      return;
    }
    if (!code) code = slugCode(name, "tag_" + Date.now());
    var model = loadModel();
    var dup = model.tags.some(function (t) {
      return t.groupId === (data.groupId || groupId) && t.code === code && t.id !== data.id;
    });
    if (dup) {
      showTagFormError("该分组下标签编码已存在。");
      return;
    }
    var next = {
      id: data.id,
      groupId: data.groupId || groupId,
      name: name,
      code: code,
      sort: isNaN(sort) ? 1 : sort,
      visible: visible,
      created: data.created || formatNow(),
    };
    var ix = model.tags.findIndex(function (x) {
      return x.id === data.id;
    });
    if (ix >= 0) model.tags[ix] = next;
    else model.tags.unshift(next);
    saveModel(model);
    global.LadsStorage.appendLog(isEdit ? "标签编辑" : "标签新增", name);
    global.LadsBus.emit("toast", { text: isEdit ? "已保存标签" : "已新增标签" });
    if (typeof closeModal === "function") closeModal("modalTagEdit");
    if (sync) sync();
  }


  global.stGoPage = function (p) {
    var page = Number(p) || 1;
    if (page < 1) page = 1;
    state.page = page;
    var root = document.getElementById("sys-admin-root");
    var w = root && root.firstElementChild;
    if (w && w._stSync) w._stSync();
  };

  function buildQueryCardHtml() {
    if (!A || !A.buildQueryCardHtml) return "";
    return A.buildQueryCardHtml({
      id: QUERY_CARD_ID,
      visibleCount: 2,
      resetId: "st-reset",
      searchId: "st-search",
      toggleId: "st-query-toggle",
      fields: [
        { label: "标签名称", id: "st-name-kw", placeholder: "请输入" },
        {
          label: "是否显示",
          id: "st-visible-kw",
          type: "select",
          options: [
            "全部",
            { value: "1", label: "显示" },
            { value: "0", label: "隐藏" },
          ],
        },
      ],
    });
  }

  function buildGroupListHtml(groups) {
    if (!groups.length) return '<div class="sys-dict-empty">暂无标签分组</div>';
    return groups
      .map(function (g) {
        return (
          '<button type="button" class="sys-dict-type-btn' +
          (g.id === state.activeGroupId ? " is-active" : "") +
          '" data-group-id="' +
          escapeHtml(g.id) +
          '"><span class="sys-dict-type-name">' +
          escapeHtml(g.name) +
          "</span></button>"
        );
      })
      .join("");
  }

  function buildLeftShell() {
    return (
      '<div class="sys-dict-left">' +
      '<div class="sys-dict-left__head"><input id="stg-group-kw" class="sys-org-tree__input" placeholder="输入分组名称搜索" value="' +
      escapeHtml(state.groupKw) +
      '" /></div>' +
      '<div class="sys-dict-left__tools sys-tags-left__tools">' +
      '<button type="button" class="dl-btn--primary" id="stg-group-add">+ 添加</button>' +
      '<button type="button" class="dl-btn--secondary" id="stg-group-edit">修改</button>' +
      '<button type="button" class="dl-btn--secondary" id="stg-group-del">删除</button>' +
      '</div>' +
      '<div class="sys-dict-left__body" id="stg-group-list"></div>' +
      "</div>"
    );
  }

  function buildTableCombinedBoxHtml() {
    var tools =
      '<button type="button" class="tool-btn-primary" id="st-tag-add">' +
      '<svg viewBox="0 0 24 24" style="width:14px;stroke:#fff;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> 新增标签' +
      "</button>" +
      '<div class="tool-icon-btn" id="st-toggle-filter" title="显示/隐藏筛选"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg></div>' +
      '<div class="tool-icon-btn" id="st-refresh" title="刷新表格"><svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg></div>' +
      '<div class="tool-icon-btn" id="st-fullscreen" title="全屏内容区"><svg viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg></div>';
    tools = tools.replace("<div ", "<div ").replace("</div>", "</div>")
    if (typeof buildTableSkeleton === "function") {
      return buildTableSkeleton({ title: "标签列表", tools: tools, tableId: TABLE_ID }).outerHTML;
    }
    return "";
  }

  function buildLayoutShell() {
    return (
      '<div class="sys-tags-split">' +
      buildLeftShell() +
      '<div class="crm-leads-stack">' +
      buildQueryCardHtml() +
      buildTableCombinedBoxHtml() +
      "</div></div>"
    );
  }

  function renderPaginationBar(total) {
    if (global.TzttSysPagination) {
      global.TzttSysPagination.render("section-pagination", total, state.page, state.pageSize, "stGoPage", function (size) {
        state.pageSize = size;
        state.page = 1;
        var root = document.getElementById("sys-admin-root");
        var w = root && root.firstElementChild;
        if (w && w._stSync) w._stSync();
      });
      return;
    }
    if (typeof renderPagination === "function") {
      renderPagination("section-pagination", total, state.page, state.pageSize, "stGoPage");
    }
  }

  function syncFiltersFromState(wrap) {
    var n = wrap.querySelector("#st-name-kw");
    var v = wrap.querySelector("#st-visible-kw");
    if (n) n.value = state.tagNameKw;
    if (v) v.value = state.visibleKw;
  }

  function readFiltersFromDom(wrap) {
    state.tagNameKw = wrap.querySelector("#st-name-kw") ? wrap.querySelector("#st-name-kw").value.trim() : "";
    state.visibleKw = wrap.querySelector("#st-visible-kw") ? wrap.querySelector("#st-visible-kw").value : "";
  }

  function renderTable(pageRows, total, usageMap) {
    var tbody = document.getElementById(TABLE_ID + "-body");
    if (!tbody) return;
    var colspan = COLS.length;
    var showUsage = usageMap != null;
    if (!pageRows.length) {
      tbody.innerHTML =
        '<tr><td colspan="' + colspan + '" style="text-align:center;padding:40px;color:var(--text-light)">暂无标签</td></tr>';
      if (A && A.renderTableHead) A.renderTableHead(TABLE_ID, COLS);
      if (A && A.syncRowColClasses) A.syncRowColClasses(TABLE_ID);
      if (A && A.markFixedColumns) A.markFixedColumns(TABLE_ID, { left: false });
      renderPaginationBar(0);
      return;
    }
    tbody.innerHTML = pageRows
      .map(function (r, idx) {
        var serial = total - (state.page - 1) * state.pageSize - idx;
        var vis = r.visible !== false;
        var usedCell = showUsage
          ? '<td class="text-sm" title="已打该标签的客户数">' + H(String(usageMap[r.name] || 0)) + "</td>"
          : '<td class="text-sm text-muted">—</td>';
        return (
          "<tr>" +
          "<td>" +
          H(String(serial)) +
          '</td><td class="text-sm">' +
          H(r.name) +
          '</td><td class="text-sm" title="' +
          H(r.code) +
          '">' +
          H(r.code) +
          '</td><td class="text-sm">' +
          H(String(r.sort != null ? r.sort : "")) +
          "</td>" +
          usedCell +
          "<td>" +
          '<label class="table-switch" title="' +
          (vis ? "显示" : "隐藏") +
          '"><input type="checkbox" class="st-visible-toggle" data-id="' +
          H(r.id) +
          '"' +
          (vis ? " checked" : "") +
          ' /><span class="table-switch__slider"></span></label></td>' +
          '<td class="text-sm">' +
          H(r.created || "—") +
          '</td><td class="col-actions col-fixed-right">' +
          '<button type="button" class="btn-text btn-sm st-tag-edit" data-id="' +
          H(r.id) +
          '">修改</button> ' +
          '<button type="button" class="btn-text btn-sm text-danger st-tag-del" data-id="' +
          H(r.id) +
          '">删除</button>' +
          "</td></tr>"
        );
      })
      .join("");
    if (A && A.renderTableHead) A.renderTableHead(TABLE_ID, COLS);
    if (A && A.syncRowColClasses) A.syncRowColClasses(TABLE_ID);
    if (A && A.markFixedColumns) A.markFixedColumns(TABLE_ID, { left: false });
    renderPaginationBar(total);
  }


  /** 布局诊断：控制台过滤 [tags-layout] */
  function debugTagsLayout(reason) {
    var pick = function (sel) {
      return document.querySelector(sel);
    };
    var nodes = {
      content: pick(".sys-tags-page .content-container.page-crm-leads"),
      root: document.getElementById("sys-admin-root"),
      dmRight: pick("#sys-admin-root > .dm-right"),
      split: pick(".sys-tags-split"),
      stack: pick(".sys-tags-split > .crm-leads-stack"),
      box: pick(".sys-tags-split .table-combined-box"),
      tableBody: document.getElementById("section-table-body"),
      scroll: pick(".sys-tags-split .fixed-table-container"),
      pagi: document.getElementById("section-pagination"),
    };
    var out = { reason: reason || "sync" };
    Object.keys(nodes).forEach(function (key) {
      var el = nodes[key];
      if (!el) {
        out[key] = null;
        return;
      }
      var r = el.getBoundingClientRect();
      var st = window.getComputedStyle(el);
      out[key] = {
        h: Math.round(r.height),
        bottom: Math.round(r.bottom),
        flex: st.flex,
        overflow: st.overflow,
        minHeight: st.minHeight,
      };
    });
    out.viewportBottom = Math.round(window.innerHeight);
    console.log("[tags-layout]", out);
  }

  function render(root) {
    root.innerHTML = "";
    var wrap = document.createElement("div");
    wrap.className = "dm-right biz-page sys-admin-page sys-tags-page";
    wrap.innerHTML = '<div id="st-layout-root"></div>';
    root.appendChild(wrap);

    var layoutRoot = wrap.querySelector("#st-layout-root");
    if (layoutRoot) layoutRoot.innerHTML = buildLayoutShell();

    function sync() {
      var model = loadModel();
      var groups = model.groups.filter(function (g) {
        return !state.groupKw || g.name.toLowerCase().indexOf(state.groupKw.toLowerCase()) >= 0;
      });
      if (!state.activeGroupId && groups.length) state.activeGroupId = groups[0].id;
      if (groups.length && groups.every(function (g) {
        return g.id !== state.activeGroupId;
      })) {
        state.activeGroupId = groups[0].id;
      }

      var rows = model.tags
        .filter(function (t) {
          if (state.activeGroupId && t.groupId !== state.activeGroupId) return false;
          if (state.tagNameKw && String(t.name || "").indexOf(state.tagNameKw) < 0) return false;
          if (state.visibleKw === "1" && t.visible === false) return false;
          if (state.visibleKw === "0" && t.visible !== false) return false;
          return true;
        })
        .sort(function (a, b) {
          return (Number(a.sort) || 0) - (Number(b.sort) || 0);
        });

      var total = rows.length;
      var pages = Math.max(1, Math.ceil(total / state.pageSize));
      if (state.page > pages) state.page = pages;
      var start = (state.page - 1) * state.pageSize;
      var pageRows = rows.slice(start, start + state.pageSize);

      var listEl = wrap.querySelector("#stg-group-list");
      if (listEl) listEl.innerHTML = buildGroupListHtml(groups);

      syncFiltersFromState(wrap);
      var activeGroup = model.groups.find(function (g) {
        return g.id === state.activeGroupId;
      });
      var usageMap =
        activeGroup && activeGroup.code === CRM_CUSTOMER_TAG_GROUP ? buildCustomerTagUsageMap() : null;
      renderTable(pageRows, total, usageMap);
      requestAnimationFrame(function () {
        debugTagsLayout("sync");
      });
    }

    wrap._stSync = sync;

    var layoutLogTimer;
    window.addEventListener("resize", function () {
      clearTimeout(layoutLogTimer);
      layoutLogTimer = setTimeout(function () {
        debugTagsLayout("resize");
      }, 200);
    });

    if (A && A.bindQueryCard) {
      A.bindQueryCard(wrap, {
        cardId: QUERY_CARD_ID,
        toggleId: "st-query-toggle",
        searchId: "st-search",
        resetId: "st-reset",
        onSearch: function () {
          readFiltersFromDom(wrap);
          state.page = 1;
          sync();
        },
        onReset: function () {
          state.tagNameKw = "";
          state.visibleKw = "";
          state.page = 1;
          sync();
        },
      });
    }

    if (A && A.bindTableToolbar) {
      A.bindTableToolbar(wrap, {
        queryCardId: QUERY_CARD_ID,
        toggleFilterId: "st-toggle-filter",
        refreshId: "st-refresh",
        fullscreenId: "st-fullscreen",
        onRefresh: sync,
      });
    }

    wrap.addEventListener("click", function (e) {
      var t = e.target;
      var groupBtn = t.closest && t.closest("[data-group-id]");
      if (groupBtn) {
        state.activeGroupId = groupBtn.getAttribute("data-group-id");
        state.page = 1;
        sync();
        return;
      }
      if (t.id === "stg-group-add") return openGroupModal(null, sync);
      if (t.id === "stg-group-edit") {
        var model = loadModel();
        var cur = model.groups.find(function (x) {
          return x.id === state.activeGroupId;
        });
        if (!cur) return global.LadsBus.emit("toast", { text: "请先选择标签分组" });
        return openGroupModal(cur, sync);
      }
      if (t.id === "stg-group-del") {
        if (!state.activeGroupId) return;
        global.LadsUi.confirm("确认删除当前标签分组吗？", function () {
          var m = loadModel();
          var gid = state.activeGroupId;
          var gcur = m.groups.find(function (g) {
            return g.id === gid;
          });
          var hasTag = m.tags.some(function (tag) {
            return tag.groupId === gid;
          });
          if (hasTag) {
            global.LadsBus.emit("toast", { text: "请先删除该分组下的标签" });
            return;
          }
          m.groups = m.groups.filter(function (g) {
            return g.id !== gid;
          });
          saveModel(m);
          state.activeGroupId = "";
          global.LadsStorage.appendLog("标签分组删除", (gcur && gcur.name) || gid);
          global.LadsBus.emit("toast", { text: "已删除分组" });
          sync();
        });
        return;
      }
      if (t.id === "st-tag-add") {
        if (!state.activeGroupId) return global.LadsBus.emit("toast", { text: "请先选择标签分组" });
        return openTagModal(null, state.activeGroupId, sync);
      }
      if (t.classList.contains("st-tag-edit")) {
        var tid = t.getAttribute("data-id");
        var m2 = loadModel();
        var row = m2.tags.find(function (x) {
          return x.id === tid;
        });
        if (row) openTagModal(row, row.groupId, sync);
        return;
      }
      if (t.classList.contains("st-tag-del")) {
        var did = t.getAttribute("data-id");
        if (!did) return;
        global.LadsUi.confirm("确认删除该标签吗？", function () {
          var m3 = loadModel();
          var tag = m3.tags.find(function (x) {
            return x.id === did;
          });
          m3.tags = m3.tags.filter(function (x) {
            return x.id !== did;
          });
          saveModel(m3);
          global.LadsStorage.appendLog("标签删除", (tag && tag.name) || did);
          global.LadsBus.emit("toast", { text: "已删除标签" });
          sync();
        });
      }
    });

    wrap.addEventListener("change", function (e) {
      var el = e.target;
      if (el.classList.contains("st-visible-toggle")) {
        var id = el.getAttribute("data-id");
        var m = loadModel();
        var tag = m.tags.find(function (x) {
          return x.id === id;
        });
        if (tag) {
          tag.visible = el.checked;
          saveModel(m);
          global.LadsStorage.appendLog("标签显示状态", tag.name + " → " + (tag.visible ? "显示" : "隐藏"));
        }
        sync();
      }
    });

    wrap.addEventListener("input", function (e) {
      if (e.target.id === "stg-group-kw") {
        state.groupKw = e.target.value.trim();
        sync();
      }
    });

    sync();
  }

  /** 供 CRM / 课程等读取可见标签名列表 */
  global.TzttTagStore = {
    getCustomerUsageCount: function (tagName) {
      var map = buildCustomerTagUsageMap();
      return map[String(tagName || "").trim()] || 0;
    },
    getNamesByGroupCode: function (code) {
      var m = loadModel();
      var g = m.groups.find(function (x) {
        return x.code === code;
      });
      if (!g) return [];
      return m.tags
        .filter(function (t) {
          return t.groupId === g.id && t.visible !== false;
        })
        .sort(function (a, b) {
          return (Number(a.sort) || 0) - (Number(b.sort) || 0);
        })
        .map(function (t) {
          return t.name;
        });
    },
  };

  global.LadsModules = global.LadsModules || {};
  global.LadsModules.sysTags = {
    title: "标签管理",
    subtitle: "系统管理 · 全局标签",
    render: render,
  };
})(window);
