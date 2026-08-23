/**
 * 通用筛选栏折叠：超过 data-fb-collapse-after（默认 2）个筛选项时显示「展开/收起」
 * 依赖结构：.filter-bar > .filter-bar__grid > .filter-bar__cell（操作格带 .filter-bar__cell--actions）
 */
(function (global) {
  "use strict";

  var DEFAULT_AFTER = 2;
  var expandedById = {};
  var delegateBound = false;

  function parseAfter(root) {
    var n = parseInt(String(root.getAttribute("data-fb-collapse-after") || DEFAULT_AFTER), 10);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_AFTER;
  }

  function setCollapsed(root, collapsed) {
    if (collapsed) root.classList.remove("filter-bar--expanded");
    else root.classList.add("filter-bar--expanded");

    var toggleBtn = root.querySelector("[data-fb-toggle]");
    if (toggleBtn) {
      toggleBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
      var label = toggleBtn.querySelector(".filter-bar__toggle-text");
      if (label) label.textContent = collapsed ? "展开" : "收起";
    }

    if (root.id) expandedById[root.id] = !collapsed;
  }

  function bindDelegate() {
    if (delegateBound) return;
    delegateBound = true;
    document.addEventListener(
      "click",
      function (event) {
        var toggleBtn = event.target.closest ? event.target.closest("[data-fb-toggle]") : null;
        if (!toggleBtn) return;
        var root = toggleBtn.closest ? toggleBtn.closest(".filter-bar") : null;
        if (!root || !root.classList.contains("filter-bar--collapsible")) return;
        event.preventDefault();
        var isExpanded = root.classList.contains("filter-bar--expanded");
        setCollapsed(root, isExpanded);
      },
      false
    );
  }

  function init(root) {
    if (!root || !root.classList.contains("filter-bar")) return;
    bindDelegate();

    var grid = root.querySelector(".filter-bar__grid");
    if (!grid) return;

    var cells = grid.querySelectorAll(":scope > .filter-bar__cell:not(.filter-bar__cell--actions)");
    var after = parseAfter(root);
    var fieldCells = Array.from(cells);

    fieldCells.forEach(function (el, i) {
      el.classList.toggle("filter-bar__cell--extra", i >= after);
    });

    var forceToggle = root.getAttribute("data-fb-show-toggle") === "true";
    var needCollapse = fieldCells.length > after || forceToggle;
    var toggleWrap = root.querySelector(".filter-bar__toggle-wrap");

    if (!needCollapse) {
      root.classList.remove("filter-bar--collapsible", "filter-bar--expanded");
      if (toggleWrap) {
        toggleWrap.hidden = true;
        toggleWrap.setAttribute("hidden", "");
      }
      return;
    }

    root.classList.add("filter-bar--collapsible");
    if (toggleWrap) {
      toggleWrap.hidden = false;
      toggleWrap.removeAttribute("hidden");
    }

    var wasExpanded = root.id && expandedById[root.id];
    setCollapsed(root, !wasExpanded);
  }

  global.FilterBar = { init: init };
})(window);
