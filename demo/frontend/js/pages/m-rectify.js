/**
 * 整改页已并入问题详情；保留入口做跳转兼容
 */
(function () {
  var id = new URLSearchParams(location.search).get('id') || '';
  var href =
    './issue-detail.html' + (id ? '?id=' + encodeURIComponent(id) : '');
  if (window.HSFNav) HSFNav.go(href);
  else location.href = href;
})();
