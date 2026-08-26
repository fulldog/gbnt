/**
 * 系统管理 · 操作日志（showcase 列表：query-card + vben-table-std + 固定列）
 */
(function (global) {
  "use strict";

  var currentPage = 1;
  var pageSize = 20;
  var updateTableShadow = function () {};

  var DEMO_OP_LOGS = [
    { action: "查询字典数据", detail: "分页查询路域数据字典项", operator: "wanglei", time: new Date("2026-05-16T16:27:04").getTime() },
    { action: "查询用户列表", detail: "查询系统用户", operator: "wanglei", time: new Date("2026-05-16T16:26:58").getTime() },
    { action: "部门新增", detail: "新增江北运营管理部子部门", operator: "chenjing", time: new Date("2026-05-15T16:25:43").getTime() },
    { action: "查询组织架构", detail: "查询部门树与层级关系", operator: "wanglei", time: new Date("2026-05-15T16:25:33").getTime() },
    { action: "角色编辑", detail: "更新资产管理员权限", operator: "wanglei", time: new Date("2026-05-14T16:25:26").getTime() },
    { action: "设备新增", detail: "新增监控设备台账", operator: "chenjing", time: new Date("2026-05-13T16:24:10").getTime() },
    { action: "合同查询", detail: "查询合同台账列表", operator: "zhangtao", time: new Date("2026-05-12T16:23:55").getTime() },
    { action: "导出操作日志", detail: "导出操作日志报表", operator: "wanglei", time: new Date("2026-05-11T15:12:08").getTime() },
  ];

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  function pad(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function fmt(d) {
    return (
      d.getFullYear() +
      "-" +
      pad(d.getMonth() + 1) +
      "-" +
      pad(d.getDate()) +
      " " +
      pad(d.getHours()) +
      ":" +
      pad(d.getMinutes()) +
      ":" +
      pad(d.getSeconds())
    );
  }

  function pseudoCost(detail, idx) {
    var t = String(detail || "").length + idx * 7;
    return (Math.max(1, (t % 16) + 1) / 1000).toFixed(3) + "s";
  }

  function pseudoIp(account, idx) {
    var n = 0;
    var s = String(account || "admin");
    for (var i = 0; i < s.length; i++) n += s.charCodeAt(i);
    return (
      "60." +
      ((n + idx) % 200) +
      "." +
      ((n * 3 + idx) % 250) +
      "." +
      (((n + idx * 7) % 200) + 20)
    );
  }

  function mapInvokeMethod(module, action) {
    var map = {
      数据字典: "Dict",
      人员管理: "User",
      角色管理: "Role",
      组织架构: "Organization",
      设备管理: "Device",
      合同管理: "Contract",
      资产管理: "Asset",
      财务管理: "Finance",
      系统管理: "System",
    };
    var ctrl = map[module] || "System";
    var act = String(action || "");
    var method = "page";
    if (act.indexOf("新增") >= 0 || act.indexOf("添加") >= 0) method = "save";
    else if (act.indexOf("删除") >= 0) method = "remove";
    else if (act.indexOf("编辑") >= 0 || act.indexOf("修改") >= 0 || act.indexOf("更新") >= 0) method = "update";
    else if (act.indexOf("导出") >= 0) method = "export";
    return "com.roaddomain.system.controller." + ctrl + "Controller." + method;
  }

  function buildRequestParams(row) {
    return JSON.stringify({
      module: row.module,
      action: row.action,
      account: row.account,
      limit: String(pageSize),
      page: String(currentPage),
      sort: "createTime",
      order: "desc",
    });
  }

  function buildResponseResult(row) {
    if (row.status === "异常") {
      return JSON.stringify({ code: 500, message: "服务异常", data: null });
    }
    return JSON.stringify({
      code: 0,
      message: "操作成功",
      data: {
        list: [
          {
            id: row.id,
            account: row.account,
            module: row.module,
            action: row.action,
            opTime: row.opTime,
          },
        ],
        count: 1,
      },
    });
  }

  function mapModule(action, detail) {
    var txt = (String(action || "") + " " + String(detail || "")).toLowerCase();
    if (txt.indexOf("字典") >= 0) return "数据字典";
    if (txt.indexOf("用户") >= 0) return "人员管理";
    if (txt.indexOf("角色") >= 0) return "角色管理";
    if (txt.indexOf("组织") >= 0 || txt.indexOf("部门") >= 0) return "组织架构";
    if (txt.indexOf("设备") >= 0 || txt.indexOf("监控") >= 0) return "设备管理";
    if (txt.indexOf("合同") >= 0) return "合同管理";
    if (txt.indexOf("资产") >= 0 || txt.indexOf("服务区") >= 0 || txt.indexOf("土地") >= 0) return "资产管理";
    if (txt.indexOf("财务") >= 0 || txt.indexOf("收款") >= 0) return "财务管理";
    if (txt.indexOf("街道台账") >= 0 || txt.indexOf("汇总") >= 0) return "汇总管理";
    return "系统管理";
  }

  function mapOpType(action, detail) {
    var txt = String(action || "") + " " + String(detail || "");
    if (txt.indexOf("导入") >= 0) return "import";
    if (txt.indexOf("导出") >= 0) return "export";
    if (txt.indexOf("新增") >= 0 || txt.indexOf("添加") >= 0 || txt.indexOf("创建") >= 0) return "create";
    if (txt.indexOf("删除") >= 0 || txt.indexOf("清空") >= 0) return "delete";
    if (txt.indexOf("修改") >= 0 || txt.indexOf("编辑") >= 0 || txt.indexOf("更新") >= 0) return "update";
    return "query";
  }

  function toRows(logs) {
    return logs.map(function (log, idx) {
      var ms = Number(log && log.time) || Date.now();
      var d = new Date(ms);
      return {
        id: "ol_" + idx + "_" + ms,
        account: String((log && log.operator) || "admin"),
        username: "管理员",
        module: mapModule(log && log.action, log && log.detail),
        action: String((log && log.action) || "查询"),
        path: "/api/system/" + (String((log && log.action) || "query").toLowerCase().replace(/\s+/g, "-") || "query"),
        method: "GET",
        status: idx % 6 === 0 ? "异常" : "正常",
        opType: mapOpType(log && log.action, log && log.detail),
        cost: pseudoCost(log && log.detail, idx),
        opTime: fmt(d),
        detail: String((log && log.detail) || "系统操作"),
        ip: pseudoIp(log && log.operator, idx),
        invokeMethod: mapInvokeMethod(mapModule(log && log.action, log && log.detail), log && log.action),
        requestParams: "",
        responseResult: "",
      };
    }).map(function (row, idx) {
      row.requestParams = buildRequestParams(row);
      row.responseResult = buildResponseResult(row);
      return row;
    });
  }

  function detailStatusHtml(status) {
    if (status === "异常") {
      return '<span class="sys-oplog-status sys-oplog-status--bad">异常</span>';
    }
    return '<span class="sys-oplog-status">正常</span>';
  }

  function detailPairRow(label1, val1, label2, val2Html) {
    return (
      "<tr>" +
      "<th>" +
      escapeHtml(label1) +
      "</th><td>" +
      escapeHtml(val1) +
      "</td><th>" +
      escapeHtml(label2) +
      "</th><td>" +
      val2Html +
      "</td></tr>"
    );
  }

  function detailFullRow(label, contentHtml, isJson) {
    return (
      "<tr><th>" +
      escapeHtml(label) +
      '</th><td colspan="3"' +
      (isJson ? ' class="ol-detail-json"' : "") +
      ">" +
      contentHtml +
      "</td></tr>"
    );
  }

  function buildDetailHtml(row) {
    if (!row) return '<p class="muted">暂无详情</p>';
    var operator = row.username + "(" + row.account + ")";
    return (
      '<table class="ol-detail-table"><tbody>' +
      detailPairRow("操作人", operator, "IP地址", escapeHtml(row.ip)) +
      detailPairRow("操作模块", row.module, "操作功能", escapeHtml(row.detail || row.action)) +
      detailPairRow("操作时间", row.opTime, "请求耗时", escapeHtml(row.cost)) +
      detailPairRow("请求方式", row.method, "请求状态", detailStatusHtml(row.status)) +
      detailFullRow("请求地址", escapeHtml(row.path), false) +
      detailFullRow("调用方法", escapeHtml(row.invokeMethod), false) +
      detailFullRow("请求参数", escapeHtml(row.requestParams), true) +
      detailFullRow("返回结果", escapeHtml(row.responseResult), true) +
      "</tbody></table>"
    );
  }

  function openOpLogDetail(row) {
    var body = $("ol-detail-body");
    if (!body) return;
    body.innerHTML = buildDetailHtml(row);
    if (typeof global.openModal === "function") {
      global.openModal("modalOpLogDetail");
      return;
    }
    var overlay = $("modalOpLogDetail");
    if (overlay) overlay.classList.add("active");
  }

  function loadLogs() {
    var logs = global.LadsStorage.get("logs", []);
    if (!Array.isArray(logs)) logs = [];
    if (logs.length < DEMO_OP_LOGS.length) {
      logs = logs.concat(DEMO_OP_LOGS.slice(0, DEMO_OP_LOGS.length - logs.length));
    }
    return logs;
  }

  function getFilters() {
    return {
      account: ($("ol-filter-account") && $("ol-filter-account").value.trim()) || "",
      module: ($("ol-filter-module") && $("ol-filter-module").value.trim()) || "",
      status: ($("ol-filter-status") && $("ol-filter-status").value) || "",
      opType: ($("ol-filter-optype") && $("ol-filter-optype").value) || "",
      startAt: ($("ol-filter-start") && $("ol-filter-start").value) || "",
      endAt: ($("ol-filter-end") && $("ol-filter-end").value) || "",
    };
  }

  function filterRows(rows) {
    var f = getFilters();
    var start = f.startAt ? new Date(f.startAt).getTime() : 0;
    var end = f.endAt ? new Date(f.endAt).getTime() : Number.MAX_SAFE_INTEGER;
    return rows.filter(function (r) {
      if (f.account && r.account.indexOf(f.account) < 0) return false;
      if (f.module && r.module.indexOf(f.module) < 0) return false;
      if (f.status && r.status !== f.status) return false;
      if (f.opType && r.opType !== f.opType) return false;
      var t = new Date(r.opTime).getTime();
      if (t < start || t > end) return false;
      return true;
    });
  }

  function totalPages(count) {
    return Math.max(1, Math.ceil(count / pageSize));
  }

  function paginate(list) {
    var start = (currentPage - 1) * pageSize;
    return list.slice(start, start + pageSize);
  }

  function cellText(val, opts) {
    opts = opts || {};
    var text = val != null && String(val).trim() !== "" ? String(val) : "—";
    var style = opts.style || "";
    var title = opts.title != null ? opts.title : text;
    return (
      "<td" +
      (style ? ' style="' + style + '"' : "") +
      ' title="' +
      escapeAttr(title) +
      '">' +
      escapeHtml(text) +
      "</td>"
    );
  }

  function cellStatus(label) {
    if (label === "异常") {
      return '<td><span class="sys-oplog-status sys-oplog-status--bad">' + escapeHtml(label) + "</span></td>";
    }
    if (label === "正常") {
      return '<td><span class="sys-oplog-status">' + escapeHtml(label) + "</span></td>";
    }
    return cellText(label);
  }

  function renderPagination(total) {
    var right = $("ol-pagi-right");
    var totalEl = $("ol-pagi-total");
    if (totalEl) totalEl.textContent = "共 " + total + " 条记录";
    if (!right) return;

    var pages = totalPages(total);
    if (currentPage > pages) currentPage = pages;

    var html = "";
    html +=
      '<div class="pagi-btn disabled" title="第一页"><svg viewBox="0 0 24 24"><path d="M18.41 16.59L13.82 12l4.59-4.59L17 6l-6 6 6 6 1.41-1.41zM6 6h2v12H6z"/></svg></div>';
    html +=
      '<div class="pagi-btn' +
      (currentPage <= 1 ? " disabled" : "") +
      '" data-pagi="prev"><svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg></div>';
    for (var p = 1; p <= pages && p <= 5; p++) {
      html += '<div class="pagi-btn pagi-num' + (p === currentPage ? " active" : "") + '" data-page="' + p + '">' + p + "</div>";
    }
    html +=
      '<div class="pagi-btn' +
      (currentPage >= pages ? " disabled" : "") +
      '" data-pagi="next"><svg viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg></div>';
    right.innerHTML = html;

    right.querySelectorAll("[data-page]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        currentPage = parseInt(btn.getAttribute("data-page"), 10);
        renderTable();
      });
    });
    var prev = right.querySelector('[data-pagi="prev"]');
    var next = right.querySelector('[data-pagi="next"]');
    if (prev && !prev.classList.contains("disabled")) {
      prev.addEventListener("click", function () {
        currentPage -= 1;
        renderTable();
      });
    }
    if (next && !next.classList.contains("disabled")) {
      next.addEventListener("click", function () {
        currentPage += 1;
        renderTable();
      });
    }
  }

  function renderTable() {
    var tbody = $("ol-tbody");
    if (!tbody) return;

    var all = filterRows(toRows(loadLogs()));
    renderPagination(all.length);
    var list = paginate(all);
    var baseIndex = (currentPage - 1) * pageSize;

    if (!list.length) {
      tbody.innerHTML =
        '<tr><td colspan="11" style="text-align:center;padding:40px;color:#999">暂无记录</td></tr>';
      setTimeout(updateTableShadow, 50);
      return;
    }

    tbody.innerHTML = list
      .map(function (log, i) {
        return (
          "<tr data-id=\"" +
          escapeAttr(log.id) +
          "\">" +
          '<td class="col-fixed-left" style="text-align:center">' +
          (baseIndex + i + 1) +
          "</td>" +
          cellText(log.account) +
          cellText(log.username) +
          cellText(log.module) +
          cellText(log.action, { title: log.detail }) +
          cellText(log.path) +
          cellText(log.method) +
          cellStatus(log.status) +
          cellText(log.cost) +
          cellText(log.opTime) +
          '<td class="col-fixed-right">' +
          '<a class="op-link ol-detail" href="#" data-id="' +
          escapeAttr(log.id) +
          '">详情</a>' +
          "</td>" +
          "</tr>"
        );
      })
      .join("");

    tbody.querySelectorAll(".ol-detail").forEach(function (el) {
      el.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        var id = el.getAttribute("data-id");
        var cur = all.find(function (x) {
          return x.id === id;
        });
        openOpLogDetail(cur);
      });
    });

    setTimeout(updateTableShadow, 50);
  }

  function resetFilters() {
    if ($("ol-filter-account")) $("ol-filter-account").value = "";
    if ($("ol-filter-module")) $("ol-filter-module").value = "";
    if ($("ol-filter-status")) $("ol-filter-status").value = "";
    if ($("ol-filter-optype")) $("ol-filter-optype").value = "";
    if ($("ol-filter-start")) $("ol-filter-start").value = "";
    if ($("ol-filter-end")) $("ol-filter-end").value = "";
  }

  function initQuery() {
    var root = $("query-group-ol");
    var trigger = $("ol-toggle-btn");
    if (trigger && root) {
      var textSpan = trigger.querySelector(".text");
      trigger.onclick = function (e) {
        e.stopPropagation();
        var isCollapsed = root.classList.toggle("collapsed");
        if (textSpan) textSpan.innerText = isCollapsed ? "展开" : "收起";
        window.dispatchEvent(new Event("resize"));
      };
    }

    var btnSearch = $("ol-btn-search");
    var btnReset = $("ol-btn-reset");
    if (btnSearch) {
      btnSearch.addEventListener("click", function () {
        currentPage = 1;
        renderTable();
      });
    }
    if (btnReset) {
      btnReset.addEventListener("click", function () {
        resetFilters();
        currentPage = 1;
        renderTable();
      });
    }
  }

  function initTableChrome() {
    var root = $("combined-table-ol");
    if (!root) return;

    var wrap = $("ol-scroll-wrap");
    var table = $("ol-main-table");
    var loader = $("ol-loader");
    var colPanel = $("ol-col-panel");

    var searchBtn = $("ol-btn-toggle-query");
    var queryGroup = $("query-group-ol");
    if (searchBtn && queryGroup) {
      searchBtn.onclick = function (e) {
        e.stopPropagation();
        var isHidden = queryGroup.style.display === "none";
        queryGroup.style.display = isHidden ? "" : "none";
        window.dispatchEvent(new Event("resize"));
      };
    }

    updateTableShadow = function () {
      if (!wrap) return;
      var sl = wrap.scrollLeft;
      var max = wrap.scrollWidth - wrap.clientWidth;
      wrap.classList.toggle("is-scrolling-left", sl > 0);
      wrap.classList.toggle("is-scrolling-right", sl < max - 1);
    };
    if (wrap) {
      wrap.addEventListener("scroll", updateTableShadow);
      window.addEventListener("resize", updateTableShadow);
      setTimeout(updateTableShadow, 200);
    }

    var btnFullscreen = $("ol-fullscreen");
    if (btnFullscreen) {
      btnFullscreen.onclick = function (e) {
        e.stopPropagation();
        var container = document.querySelector(".content-container.ol-page");
        if (!container) return;
        var isFull = container.classList.toggle("vben-table-fullscreen");
        document.body.style.overflow = isFull ? "hidden" : "";
        setTimeout(updateTableShadow, 400);
      };
    }

    var btnRefresh = $("btn-refresh");
    if (btnRefresh && loader) {
      btnRefresh.onclick = function (e) {
        e.stopPropagation();
        var svg = this.querySelector("svg");
        if (svg) svg.style.animation = "spin 1s linear infinite";
        loader.classList.add("show");
        setTimeout(function () {
          if (svg) svg.style.animation = "";
          loader.classList.remove("show");
          renderTable();
          updateTableShadow();
        }, 800);
      };
    }

    var btnCol = $("btn-col-settings");
    var colListWrap = $("ol-col-list-container");
    if (table && colListWrap) {
      var headers = Array.from(table.querySelectorAll("thead th"));
      colListWrap.innerHTML = headers
        .map(function (th, idx) {
          var title = th.querySelector(".th-title");
          var label = title ? title.textContent.trim() : th.innerText.trim();
          return (
            '<div class="col-list-item">' +
            '<input type="checkbox" checked id="ol-chk-' +
            idx +
            '" data-idx="' +
            idx +
            '">' +
            '<label for="ol-chk-' +
            idx +
            '" style="cursor:pointer;flex:1;">' +
            label +
            "</label></div>"
          );
        })
        .join("");

      if (btnCol && colPanel) {
        btnCol.onclick = function (e) {
          e.stopPropagation();
          colPanel.classList.toggle("show");
        };
        document.addEventListener("click", function () {
          colPanel.classList.remove("show");
        });
        colPanel.onclick = function (e) {
          e.stopPropagation();
        };
      }

      colListWrap.addEventListener("change", function (e) {
        if (!e.target.dataset || e.target.dataset.idx === undefined) return;
        var idx = parseInt(e.target.dataset.idx, 10);
        var show = e.target.checked;
        var cells = table.querySelectorAll("tr > *:nth-child(" + (idx + 1) + ")");
        cells.forEach(function (c) {
          c.style.display = show ? "" : "none";
        });
        updateTableShadow();
      });
    }

    var pagiTrigger = $("ol-pagi-select-trigger");
    var pagiDropdown = $("ol-pagi-dropdown");
    var pagiSizeText = $("ol-pagi-current-size");
    if (pagiTrigger && pagiDropdown) {
      pagiTrigger.onclick = function (e) {
        e.stopPropagation();
        var isOpen = pagiDropdown.classList.toggle("show");
        pagiTrigger.classList.toggle("active", isOpen);
      };
      pagiDropdown.onclick = function (e) {
        var opt = e.target.closest(".pagi-option");
        if (!opt) return;
        e.stopPropagation();
        pagiDropdown.querySelectorAll(".pagi-option").forEach(function (o) {
          o.classList.remove("selected");
        });
        opt.classList.add("selected");
        if (pagiSizeText) pagiSizeText.innerText = opt.innerText;
        pageSize = parseInt(opt.dataset.val, 10) || 20;
        currentPage = 1;
        pagiDropdown.classList.remove("show");
        pagiTrigger.classList.remove("active");
        renderTable();
      };
      document.addEventListener("click", function () {
        pagiDropdown.classList.remove("show");
        pagiTrigger.classList.remove("active");
      });
    }

    var btnExport = $("ol-btn-export");
    if (btnExport) {
      btnExport.addEventListener("click", function () {
        if (global.LadsBus && global.LadsBus.emit) {
          global.LadsBus.emit("toast", { text: "日志导出（演示）" });
        } else if (typeof Toast !== "undefined" && Toast.show) {
          Toast.show("日志导出（演示）");
        }
      });
    }
  }

  function init() {
    initQuery();
    initTableChrome();
    renderTable();
  }

  global.LadsModules = global.LadsModules || {};
  global.LadsModules.sysOpLog = {
    title: "操作日志",
    subtitle: "系统管理 · 操作审计",
    render: function () {
      init();
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
