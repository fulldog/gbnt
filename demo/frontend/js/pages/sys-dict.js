(function () {
  if (!AppNav.requireSession('./login.html')) return;
  AppNav.setBreadcrumb('系统配置', '数据字典');
  AppIcons.injectAll(document);
  var dict = AppStorage.get('dict', {}) || {};
  var wrap = document.getElementById('dictWrap');
  function block(title, items) {
    return (
      '<div class="sys-dict-block"><h2 class="sys-block-title">' +
      title +
      '</h2><div class="app-table-wrap"><table class="app-table"><thead><tr><th>值</th><th>名称</th></tr></thead><tbody>' +
      (items || [])
        .map(function (it) {
          return '<tr><td>' + it.value + '</td><td>' + it.label + '</td></tr>';
        })
        .join('') +
      '</tbody></table></div></div>'
    );
  }
  wrap.innerHTML = block('问题类型', dict.issueTypes) + block('整改状态', dict.issueStatus);
})();
