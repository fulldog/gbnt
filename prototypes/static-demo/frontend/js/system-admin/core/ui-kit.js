(function (global) {
  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function showModal(options) {
    var modal = document.getElementById("global-modal");
    if (!modal) {
      console.error("[LadsUi] 缺少 #global-modal 节点，无法打开弹窗。请在页面 body 添加：<div id=\"global-modal\" class=\"modal hidden\"></div>");
      if (options.title === "操作确认" && options.onOk) {
        if (window.confirm(String(options.body || "").replace(/<[^>]+>/g, "") || "确认操作？")) {
          options.onOk(function () {});
        } else if (options.onCancel) {
          options.onCancel();
        }
      }
      return;
    }
    var modalCardClass = "modal-card" + (options.className ? " " + options.className : "");
    modal.classList.remove("hidden");
    var titleHtml = escapeHtml(options.title || "提示");
    var headerBlock = options.headerExtra
      ? '<div class="modal-card__header"><h3>' + titleHtml + "</h3>" + options.headerExtra + "</div>"
      : "<h3>" + titleHtml + "</h3>";
    modal.innerHTML =
      '<div class="' +
      modalCardClass +
      '">' +
      headerBlock +
      (options.body || "") +
      "<footer>" +
      '<button class="ghost-btn" id="modal-cancel">' +
      escapeHtml(options.cancelText || "取消") +
      "</button>" +
      '<button class="primary-btn" id="modal-ok">' +
      escapeHtml(options.okText || "确定") +
      "</button>" +
      "</footer></div>";

    var close = function () {
      if (options.onBeforeClose) {
        try {
          options.onBeforeClose();
        } catch (e) {
          /* ignore teardown errors */
        }
      }
      modal.classList.add("hidden");
      modal.innerHTML = "";
    };

    modal.querySelector("#modal-cancel").addEventListener("click", function () {
      close();
      if (options.onCancel) options.onCancel();
    });
    modal.querySelector("#modal-ok").addEventListener("click", function () {
      if (options.onOk) options.onOk(close);
      else close();
    });
    if (options.onMount) options.onMount(modal, close);
  }

  function confirm(message, onOk) {
    showModal({
      title: "操作确认",
      body: '<p class="muted">' + escapeHtml(message) + "</p>",
      onOk: function (close) {
        onOk();
        close();
      },
    });
  }

  function buildPager(state, total) {
    var pages = Math.max(1, Math.ceil(total / state.pageSize));
    if (state.page > pages) state.page = pages;
    var start = Math.max(1, state.page - 2);
    var end = Math.min(pages, start + 4);
    var pageButtons = "";
    for (var i = start; i <= end; i += 1) {
      pageButtons +=
        '<button class="ghost-btn pager-btn ' +
        (i === state.page ? "active" : "") +
        '" data-page="' +
        i +
        '">' +
        i +
        "</button>";
    }
    return (
      '<div class="pagination">' +
      '<span class="muted">共 ' +
      total +
      " 条</span>" +
      '<select class="pager-select" id="page-size"><option>5</option><option>8</option><option>10</option><option>15</option></select>' +
      '<span class="muted">条/页</span>' +
      '<button class="ghost-btn" data-page="' +
      Math.max(1, state.page - 1) +
      '">上一页</button>' +
      '<div class="pager-pages">' +
      pageButtons +
      "</div>" +
      '<button class="ghost-btn" data-page="' +
      Math.min(pages, state.page + 1) +
      '">下一页</button>' +
      '<span class="muted">第 ' +
      state.page +
      "/" +
      pages +
      " 页</span>" +
      "</div>"
    );
  }

  function bindPager(container, state, total, onChange) {
    var select = container.querySelector("#page-size");
    if (select) {
      select.value = String(state.pageSize);
      select.addEventListener("change", function () {
        state.pageSize = Number(select.value);
        state.page = 1;
        onChange();
      });
    }
    container.querySelectorAll("[data-page]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.page = Number(btn.getAttribute("data-page"));
        onChange();
      });
    });
  }

  function bindFilterToggle(container) {
    var toggle = container.querySelector("#toggle-expand");
    var grid = container.querySelector(".filters-grid");
    if (!toggle || !grid) return;
    toggle.addEventListener("click", function () {
      var collapsed = grid.classList.contains("collapsed");
      if (collapsed) {
        grid.classList.remove("collapsed");
        toggle.textContent = "收起";
      } else {
        grid.classList.add("collapsed");
        toggle.textContent = "展开";
      }
    });
  }

  global.LadsUi = {
    showModal: showModal,
    confirm: confirm,
    escapeHtml: escapeHtml,
    buildPager: buildPager,
    bindPager: bindPager,
    bindFilterToggle: bindFilterToggle,
  };
})(window);
