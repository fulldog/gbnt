/**
 * FixedColumn — 固定列滚动阴影检测
 * 自动监听 .fixed-table-container 的滚动事件，
 * 添加/移除 is-scrolling-left / is-scrolling-right 类
 */
(function() {
  function bindScroll(el) {
    el.addEventListener('scroll', function() {
      this.classList.toggle('is-scrolling-left', this.scrollLeft > 5);
      this.classList.toggle('is-scrolling-right', this.scrollLeft < this.scrollWidth - this.clientWidth - 5);
    });
  }

  // 监听已有和未来添加的 .fixed-table-container
  function init() {
    document.querySelectorAll('.fixed-table-container').forEach(bindScroll);
    new MutationObserver(function() {
      document.querySelectorAll('.fixed-table-container:not([data-fixed-bound])').forEach(function(el) {
        el.setAttribute('data-fixed-bound', '1');
        bindScroll(el);
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
