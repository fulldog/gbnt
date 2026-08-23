/**
 * 系统管理 · 智能回复规则（IM 关键词自动回复）
 */
(function (global) {
  var A = global.TzttAdmin;
  var SR = global.TzttImSmartReply;
  var TABLE_ID = "tblSmartReply";
  var COLS = [
    "序号",
    "触发关键词",
    "匹配方式",
    { label: "回复预览", cls: "col-w-text-md" },
    "排序",
    "状态",
    "创建时间",
    "操作",
  ];
  var QUERY_CARD_ID = "query-group-sys-smart-reply";

  function H(s) {
    return A && A.escapeHtml ? A.escapeHtml(s) : String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function formatNow() {
    var d = new Date();
    function p(n) {
      return (n < 10 ? "0" : "") + n;
    }
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
  }

  function matchLabel(type) {
    return type === "all" ? "全部包含" : "任一包含";
  }

  function loadRules() {
    return SR && SR.loadRules ? SR.loadRules() : [];
  }

  function saveRules(list) {
    if (SR && SR.saveRules) SR.saveRules(list);
  }

  var state = {
    page: 1,
    pageSize: 10,
    kwFilter: "",
    enabledFilter: "",
  };

  var modal = { data: null, isEdit: false, sync: null };

  function showFormError(msg) {
    var err = document.getElementById("ssr-form-error");
    if (!err) return;
    if (msg) {
      err.textContent = msg;
      err.style.display = "block";
    } else {
      err.textContent = "";
      err.style.display = "none";
    }
  }

  function bindModalOnce() {
    if (bindModalOnce._done) return;
    bindModalOnce._done = true;
    var btn = document.getElementById("ssrSaveBtn");
    if (btn) btn.addEventListener("click", saveFromModal);
  }

  function openRuleModal(existing, sync) {
    bindModalOnce();
    var isEdit = !!existing;
    var data = existing || {
      id: "sr_" + Date.now(),
      keywords: "",
      reply: "",
      matchType: "any",
      enabled: true,
      sort: 99,
      created: formatNow(),
    };
    modal.data = data;
    modal.isEdit = isEdit;
    modal.sync = sync;

    var titleEl = document.getElementById("modalSmartReplyEditTitle");
    if (titleEl) titleEl.textContent = isEdit ? "编辑规则" : "新增规则";

    var kw = document.getElementById("ssr-keywords");
    if (kw) kw.value = data.keywords || "";

    var mt = document.getElementById("ssr-match-type");
    if (mt) mt.value = data.matchType === "all" ? "all" : "any";

    var reply = document.getElementById("ssr-reply");
    if (reply) reply.value = data.reply || "";

    var sort = document.getElementById("ssr-sort");
    if (sort) sort.value = String(data.sort != null ? data.sort : 99);

    var en = document.getElementById("ssr-enabled");
    if (en) en.checked = data.enabled !== false;

    showFormError("");
    if (typeof global.openModal === "function") global.openModal("modalSmartReplyEdit");
    else if (kw) kw.focus();
  }

  function saveFromModal() {
    var data = modal.data;
    var sync = modal.sync;
    if (!data) return;

    var keywords = document.getElementById("ssr-keywords") ? document.getElementById("ssr-keywords").value.trim() : "";
    var reply = document.getElementById("ssr-reply") ? document.getElementById("ssr-reply").value.trim() : "";
    var matchType = document.getElementById("ssr-match-type") ? document.getElementById("ssr-match-type").value : "any";
    var sortRaw = document.getElementById("ssr-sort") ? document.getElementById("ssr-sort").value : "99";
    var enabled = document.getElementById("ssr-enabled") ? document.getElementById("ssr-enabled").checked : true;
    var sort = Number(sortRaw);

    if (!keywords || !reply) {
      showFormError("请填写触发关键词和自动回复内容。");
      return;
    }

    var list = loadRules();
    var next = {
      id: data.id,
      keywords: keywords,
      reply: reply,
      matchType: matchType === "all" ? "all" : "any",
      enabled: enabled,
      sort: isNaN(sort) ? 99 : sort,
      created: data.created || formatNow(),
    };
    var ix = list.findIndex(function (r) {
      return r.id === data.id;
    });
    if (ix >= 0) list[ix] = next;
    else list.unshift(next);
    saveRules(list);
    if (global.LadsStorage && global.LadsStorage.appendLog) {
      global.LadsStorage.appendLog(modal.isEdit ? "智能回复编辑" : "智能回复新增", keywords.slice(0, 40));
    }
    if (global.LadsBus) global.LadsBus.emit("toast", { text: modal.isEdit ? "已保存" : "已新增规则" });
    if (typeof closeModal === "function") closeModal("modalSmartReplyEdit");
    if (sync) sync();
  }

  function queryRows() {
    var list = loadRules().filter(function (r) {
      if (state.kwFilter) {
        var blob = (r.keywords || "") + (r.reply || "");
        if (blob.indexOf(state.kwFilter) < 0) return false;
      }
      if (state.enabledFilter === "1" && !r.enabled) return false;
      if (state.enabledFilter === "0" && r.enabled) return false;
      return true;
    });
    var total = list.length;
    var pages = Math.max(1, Math.ceil(total / state.pageSize));
    if (state.page > pages) state.page = pages;
    var start = (state.page - 1) * state.pageSize;
    return { rows: list.slice(start, start + state.pageSize), total: total, pages: pages };
  }

  global.ssrGoPage = function (p) {
    var q = queryRows();
    var page = Number(p) || 1;
    if (page < 1) page = 1;
    if (page > q.pages) page = q.pages;
    state.page = page;
    var root = document.getElementById("sys-admin-root");
    var w = root && root.firstElementChild;
    if (w && w._ssrSync) w._ssrSync();
  };

  function buildQueryCardHtml() {
    if (!A || !A.buildQueryCardHtml) return "";
    return A.buildQueryCardHtml({
      id: QUERY_CARD_ID,
      visibleCount: 2,
      resetId: "ssr-reset",
      searchId: "ssr-search",
      toggleId: "ssr-query-toggle",
      fields: [
        { label: "关键词/回复", id: "ssr-kw", placeholder: "搜索关键词或回复内容" },
        {
          label: "状态",
          id: "ssr-enabled-filter",
          type: "select",
          options: [
            { value: "", label: "全部" },
            { value: "1", label: "启用" },
            { value: "0", label: "停用" },
          ],
        },
      ],
    });
  }

  function buildPageShell() {
    return (
      '<div class="crm-leads-stack">' +
      buildQueryCardHtml() +
      '<div class="table-combined-box">' +
      '<div id="section-table-header">' +
      '<div class="table-tools-v102">' +
      '<div class="tools-left-title">智能回复</div>' +
      '<div class="tools-right-ops">' +
      '<button type="button" class="tool-btn-primary" id="ssr-add">' +
      '<svg viewBox="0 0 24 24" style="width:14px;stroke:#fff;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> 新增规则' +
      '</button>' +
      '<div class="tool-icon-btn" id="ssr-toggle-filter" title="显示/隐藏筛选">' +
      '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>' +
      '</div>' +
      '<div class="tool-icon-btn" id="ssr-refresh" title="刷新表格">' +
      '<svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>' +
      '</div>' +
      '<div class="tool-icon-btn" id="ssr-fullscreen" title="全屏内容区">' +
      '<svg viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>' +
      '</div>' +
      '</div></div></div>' +
      '<div id="section-table-body">' +
      '<div class="fixed-table-container">' +
      '<table class="vben-table-std" id="' + TABLE_ID + '">' +
      '<thead id="' + TABLE_ID + '-head"><tr></tr></thead>' +
      '<tbody id="' + TABLE_ID + '-body"></tbody>' +
      '</table></div></div>' +
      '<div id="section-pagination" class="section-pagination"></div>' +
      '</div></div>'
    );
  }

  function renderPaginationBar(total) {
    if (A && A.renderPagination) {
      A.renderPagination(total, state.page, state.pageSize, "ssrGoPage");
      return;
    }
    if (global.TzttSysPagination) {
      global.TzttSysPagination.render("section-pagination", total, state.page, state.pageSize, "ssrGoPage", function (size) {
        state.pageSize = size;
        state.page = 1;
        var root = document.getElementById("sys-admin-root");
        var w = root && root.firstElementChild;
        if (w && w._ssrSync) w._ssrSync();
      });
    }
  }

  function renderTable() {
    var q = queryRows();
    var rows = q.rows;
    var total = q.total;
    var tbody = document.getElementById(TABLE_ID + "-body");
    if (!tbody) return;
    var colspan = COLS.length;
    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="' + colspan + '" style="text-align:center;padding:40px;color:var(--text-light)">暂无数据</td></tr>';
      if (A && A.renderTableHead) A.renderTableHead(TABLE_ID, COLS);
      if (A && A.syncRowColClasses) A.syncRowColClasses(TABLE_ID);
      if (A && A.markFixedColumns) A.markFixedColumns(TABLE_ID);
      renderPaginationBar(0);
      return;
    }
    tbody.innerHTML = rows
      .map(function (r, idx) {
        var serial = total - (state.page - 1) * state.pageSize - idx;
        var preview = (r.reply || "").replace(/\s+/g, " ").slice(0, 48);
        return (
          "<tr>" +
          "<td>" +
          H(String(serial)) +
          "</td><td class=\"text-sm\">" +
          H(r.keywords) +
          "</td><td class=\"text-sm\">" +
          H(matchLabel(r.matchType)) +
          '</td><td class="text-sm col-reply-preview" title="' +
          H(r.reply) +
          '">' +
          H(preview || "—") +
          "</td><td class=\"text-sm\">" +
          H(String(r.sort)) +
          "</td><td>" +
          '<label class="table-switch" title="' +
          (r.enabled ? "启用" : "停用") +
          '"><input type="checkbox" class="ssr-toggle" data-id="' +
          H(r.id) +
          '"' +
          (r.enabled ? " checked" : "") +
          ' /><span class="table-switch__slider"></span></label></td>' +
          '<td class="text-sm">' +
          H(r.created || "—") +
          '</td><td class="col-actions col-fixed-right">' +
          '<button type="button" class="btn-text btn-sm ssr-edit" data-id="' +
          H(r.id) +
          '">修改</button> ' +
          '<button type="button" class="btn-text btn-sm text-danger ssr-del" data-id="' +
          H(r.id) +
          '">删除</button>' +
          "</td></tr>"
        );
      })
      .join("");
    if (A && A.renderTableHead) A.renderTableHead(TABLE_ID, COLS);
    if (A && A.syncRowColClasses) A.syncRowColClasses(TABLE_ID);
    if (A && A.markFixedColumns) A.markFixedColumns(TABLE_ID);
    renderPaginationBar(total);
  }

  function syncFiltersFromState(wrap) {
    var kw = wrap.querySelector("#ssr-kw");
    var ef = wrap.querySelector("#ssr-enabled-filter");
    if (kw) kw.value = state.kwFilter;
    if (ef) ef.value = state.enabledFilter;
  }

  function render(root) {
    var wrap = document.createElement("div");
    wrap.innerHTML = buildPageShell();
    root.appendChild(wrap);

    function sync() {
      syncFiltersFromState(wrap);
      renderTable();
    }

    wrap._ssrSync = sync;

    if (A && A.bindQueryCard) {
      A.bindQueryCard(wrap, {
        cardId: QUERY_CARD_ID,
        toggleId: "ssr-query-toggle",
        searchId: "ssr-search",
        resetId: "ssr-reset",
        onSearch: function () {
          state.kwFilter = wrap.querySelector("#ssr-kw") ? wrap.querySelector("#ssr-kw").value.trim() : "";
          state.enabledFilter = wrap.querySelector("#ssr-enabled-filter") ? wrap.querySelector("#ssr-enabled-filter").value : "";
          state.page = 1;
          sync();
        },
        onReset: function () {
          state.kwFilter = "";
          state.enabledFilter = "";
          state.page = 1;
          sync();
        },
      });
    }
    if (A && A.bindTableToolbar) {
      A.bindTableToolbar(wrap, {
        queryCardId: QUERY_CARD_ID,
        toggleFilterId: "ssr-toggle-filter",
        refreshId: "ssr-refresh",
        fullscreenId: "ssr-fullscreen",
        onRefresh: sync,
      });
    }

    wrap.addEventListener("click", function (event) {
      var t = event.target;
      if (t.id === "ssr-add") {
        openRuleModal(null, sync);
        return;
      }
      if (t.classList.contains("ssr-edit")) {
        var eid = t.getAttribute("data-id");
        var row = loadRules().find(function (r) {
          return r.id === eid;
        });
        if (row) openRuleModal(row, sync);
        return;
      }
      if (t.classList.contains("ssr-del")) {
        var did = t.getAttribute("data-id");
        global.LadsUi.confirm("确认删除该智能回复规则吗？", function () {
          saveRules(
            loadRules().filter(function (r) {
              return r.id !== did;
            })
          );
          if (global.LadsStorage && global.LadsStorage.appendLog) global.LadsStorage.appendLog("智能回复删除", did);
          if (global.LadsBus) global.LadsBus.emit("toast", { text: "已删除" });
          state.page = 1;
          sync();
        });
        return;
      }
    });

    wrap.addEventListener("change", function (event) {
      var el = event.target;
      if (el.classList.contains("ssr-toggle")) {
        var tid = el.getAttribute("data-id");
        var list = loadRules();
        var r = list.find(function (x) {
          return x.id === tid;
        });
        if (r) {
          r.enabled = el.checked;
          saveRules(list);
        }
        sync();
      }
    });

    sync();
  }

  global.LadsModules = global.LadsModules || {};
  global.LadsModules.sysSmartReply = {
    title: "智能回复",
    subtitle: "系统管理 · IM 关键词自动回复",
    render: render,
  };
})(window);
