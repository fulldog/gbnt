(function () {
  if (!AppNav.requireSession('./login.html')) return;
  AppNav.setBreadcrumb('系统配置', '操作记录');
  AppIcons.injectAll(document);
  var tbody = document.querySelector('#logTable tbody');
  var logs = AppData.getLogs();
  tbody.innerHTML = logs.length
    ? logs
        .map(function (l) {
          return (
            '<tr><td>' +
            AppData.formatTime(l.time) +
            '</td><td>' +
            (l.user || '—') +
            '</td><td>' +
            (l.action || '—') +
            '</td><td>' +
            (l.detail || '—') +
            '</td></tr>'
          );
        })
        .join('')
    : '<tr><td colspan="4" class="app-empty">暂无记录</td></tr>';
})();
