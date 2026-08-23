/**
 * 我的 · 身份条 + 工作概览 + 设置列表
 */
(function () {
  var session = AppStorage.get('session', null);
  if (!session) {
    if (window.HSFNav) HSFNav.go('./login.html');
    else location.href = './login.html';
    return;
  }
  AppIcons.injectAll(document);
  if (window.AppLog) AppLog.info('m-mine', 'page ready', { user: session.username });

  var ROLE_LABEL = { admin: '管理员', staff: '工作人员' };
  var name = session.name || session.username || '用户';

  document.getElementById('mName').textContent = name;
  document.getElementById('mAvatar').textContent = name.slice(0, 1);
  document.getElementById('mRole').textContent = ROLE_LABEL[session.role] || '工作人员';

  var org = AppData.getOrgs().find(function (o) {
    return o.id === session.orgId;
  });
  document.getElementById('mOrg').textContent = org ? org.name : '—';

  var issues = AppData.getIssues() || [];
  var mineReported = issues.filter(function (i) {
    return i.reporterId === session.staffId || i.reporterName === session.name;
  });
  var minePending = issues.filter(function (i) {
    if (i.status !== 'pending') return false;
    return (
      i.assigneeId === session.staffId ||
      i.assigneeName === session.name ||
      i.reporterId === session.staffId ||
      i.reporterName === session.name
    );
  });
  var mineDone = issues.filter(function (i) {
    if (i.status !== 'done') return false;
    return (
      i.assigneeId === session.staffId ||
      i.assigneeName === session.name ||
      i.reporterId === session.staffId ||
      i.reporterName === session.name
    );
  });

  document.getElementById('mMineStats').innerHTML =
    '<button type="button" class="m-mine__stat" data-scope="reported">' +
    '<div class="m-mine__stat-n">' +
    mineReported.length +
    '</div>' +
    '<div class="m-mine__stat-l">我上报</div>' +
    '</button>' +
    '<button type="button" class="m-mine__stat" data-scope="pending">' +
    '<div class="m-mine__stat-n">' +
    minePending.length +
    '</div>' +
    '<div class="m-mine__stat-l">待整改</div>' +
    '</button>' +
    '<button type="button" class="m-mine__stat" data-scope="done">' +
    '<div class="m-mine__stat-n">' +
    mineDone.length +
    '</div>' +
    '<div class="m-mine__stat-l">已整改</div>' +
    '</button>';

  document.getElementById('mMineStats').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-scope]');
    if (!btn) return;
    var scope = btn.getAttribute('data-scope');
    var href = './mine-list.html?scope=' + encodeURIComponent(scope);
    if (window.HSFNav) HSFNav.go(href);
    else location.href = href;
  });

  document.getElementById('btnLogoutMobile').addEventListener('click', function () {
    AppData.logout();
    if (window.AppLog) AppLog.info('m-mine', 'logout');
    if (window.HSFNav) HSFNav.go('./login.html');
    else location.href = './login.html';
  });
})();
