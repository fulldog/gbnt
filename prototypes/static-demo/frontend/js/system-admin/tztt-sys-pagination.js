/**
 * 系统管理列表 · TZTT 标准分页（依赖 table-skeleton.js 的 renderPagination）
 */
(function (global) {
  function bindPageSize(container, pageSize, onPageSizeChange) {
    if (!container || typeof onPageSizeChange !== "function") return;
    container.querySelectorAll(".pagi-option").forEach(function (opt) {
      opt.addEventListener("click", function (e) {
        e.stopPropagation();
        var v = parseInt(opt.getAttribute("data-val"), 10);
        if (!v || v === pageSize) return;
        onPageSizeChange(v);
      });
    });
  }

  function render(containerId, total, page, pageSize, goPageFn, onPageSizeChange) {
    if (typeof renderPagination !== "function") return;
    renderPagination(containerId, total, page, pageSize, goPageFn);
    bindPageSize(document.getElementById(containerId), pageSize, onPageSizeChange);
  }

  global.TzttSysPagination = { render: render };
})(window);
