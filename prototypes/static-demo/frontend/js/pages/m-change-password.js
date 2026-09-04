/**
 * 修改密码：旧密码 / 新密码 / 确认；成功后回登录页
 */
(function () {
  var session = AppStorage.get('session', null);
  if (!session) {
    if (window.HSFNav) HSFNav.go('./login.html');
    else location.href = './login.html';
    return;
  }

  var form = document.getElementById('mPwdForm');
  var oldEl = document.getElementById('mPwdOld');
  var newEl = document.getElementById('mPwdNew');
  var confirmEl = document.getElementById('mPwdConfirm');
  var submitEl = document.getElementById('mPwdSubmit');
  if (!form || !oldEl || !newEl || !confirmEl || !submitEl) return;

  if (window.AppLog) AppLog.info('m-change-password', 'page ready');

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var res = AppData.changePassword(oldEl.value, newEl.value, confirmEl.value);
    if (!res.ok) {
      AppUI.toast(res.message || '修改失败', 'error');
      if (window.AppLog) AppLog.warn('m-change-password', res.message || 'fail');
      return;
    }
    AppUI.toast('密码已修改，请重新登录', 'success');
    if (window.AppLog) AppLog.info('m-change-password', 'ok');
    setTimeout(function () {
      if (window.HSFNav) HSFNav.go('./login.html');
      else location.href = './login.html';
    }, 450);
  });
})();
