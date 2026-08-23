(function () {
  AppIcons.injectAll(document);

  var form = document.getElementById('mLoginForm');
  var btn = document.getElementById('mLoginBtn');
  var username = document.getElementById('mUsername');
  var password = document.getElementById('mPassword');
  var pwdToggle = document.getElementById('mPwdToggle');
  var container = document.getElementById('v40-slider-container');
  var handle = document.getElementById('v40-handle');
  var progress = document.getElementById('v40-progress');
  var text = document.getElementById('v40-text');
  var icon = document.getElementById('v40-icon');
  if (!form || !btn || !username || !password || !container || !handle || !progress || !text || !icon) return;

  var PAD = 3;
  var verified = false;
  var dragging = false;
  var startX = 0;
  var startLeft = PAD;
  var maxDrag = 0;
  var ac = new AbortController();
  var signal = ac.signal;

  function canSubmit() {
    return !!(username.value.trim() && password.value && verified);
  }

  function syncLoginBtn() {
    btn.disabled = !canSubmit();
  }

  /** 手柄 left 最大值：右侧留 PAD，避免顶死 */
  function maxOffset() {
    return Math.max(PAD, container.offsetWidth - handle.offsetWidth - PAD);
  }

  function readLeft() {
    var n = parseInt(handle.style.left, 10);
    return isNaN(n) ? PAD : n;
  }

  function setHandleIcon(name) {
    icon.innerHTML = '';
    icon.setAttribute('data-icon', name);
    AppIcons.inject(icon, name);
  }

  function resetSlider() {
    verified = false;
    container.classList.remove('success', 'is-dragging');
    // [开发规范 §6.3.2 例外] 拖拽坐标需 JS 赋值（会覆盖 CSS left）
    handle.style.transition = 'left 0.3s, color 0.2s';
    progress.style.transition = 'width 0.3s';
    handle.style.left = PAD + 'px';
    progress.style.width = '0px';
    text.textContent = '请按住滑块拖动';
    setHandleIcon('chevronRight');
    syncLoginBtn();
  }

  function setDragLeft(left) {
    if (left < PAD) left = PAD;
    if (left > maxDrag) left = maxDrag;
    handle.style.left = left + 'px';
    progress.style.width = left + handle.offsetWidth / 2 + 'px';
  }

  function onDown(clientX) {
    if (container.classList.contains('success')) return;
    dragging = true;
    container.classList.add('is-dragging');
    startX = clientX;
    startLeft = readLeft();
    maxDrag = maxOffset();
    handle.style.transition = 'none';
    progress.style.transition = 'none';
  }

  function onMove(clientX) {
    if (!dragging) return;
    setDragLeft(startLeft + (clientX - startX));
  }

  function onUp() {
    if (!dragging) return;
    dragging = false;
    container.classList.remove('is-dragging');
    var currentX = readLeft();
    maxDrag = maxOffset();
    if (currentX >= maxDrag - 5) {
      verified = true;
      container.classList.add('success');
      handle.style.left = maxDrag + 'px';
      progress.style.width = '100%';
      text.textContent = '验证通过';
      setHandleIcon('check');
      syncLoginBtn();
    } else {
      handle.style.transition = 'left 0.3s';
      progress.style.transition = 'width 0.3s';
      handle.style.left = PAD + 'px';
      progress.style.width = '0px';
    }
  }

  handle.addEventListener(
    'mousedown',
    function (e) {
      onDown(e.clientX);
      e.preventDefault();
    },
    { signal: signal }
  );
  handle.addEventListener(
    'touchstart',
    function (e) {
      if (!e.touches || !e.touches[0]) return;
      onDown(e.touches[0].clientX);
      e.preventDefault();
    },
    { passive: false, signal: signal }
  );

  document.addEventListener(
    'mousemove',
    function (e) {
      onMove(e.clientX);
    },
    { signal: signal }
  );
  document.addEventListener(
    'touchmove',
    function (e) {
      if (!dragging || !e.touches || !e.touches[0]) return;
      onMove(e.touches[0].clientX);
      e.preventDefault();
    },
    { passive: false, signal: signal }
  );
  document.addEventListener('mouseup', onUp, { signal: signal });
  document.addEventListener('touchend', onUp, { signal: signal });
  document.addEventListener('touchcancel', onUp, { signal: signal });

  username.addEventListener('input', syncLoginBtn, { signal: signal });
  password.addEventListener('input', syncLoginBtn, { signal: signal });

  if (pwdToggle) {
    pwdToggle.addEventListener(
      'click',
      function () {
        var show = password.type === 'password';
        password.type = show ? 'text' : 'password';
        pwdToggle.setAttribute('aria-label', show ? '隐藏密码' : '显示密码');
        pwdToggle.setAttribute('aria-pressed', show ? 'true' : 'false');
        var iconEl = pwdToggle.querySelector('[data-icon]');
        if (iconEl) {
          iconEl.innerHTML = '';
          iconEl.setAttribute('data-icon', show ? 'eye' : 'eyeOff');
          AppIcons.inject(iconEl, show ? 'eye' : 'eyeOff');
        }
      },
      { signal: signal }
    );
  }

  document.addEventListener(
    'hsf-page-leave',
    function () {
      ac.abort();
    },
    { once: true }
  );

  form.addEventListener(
    'submit',
    function (e) {
      e.preventDefault();
      if (window.AppLog) AppLog.info('m-login', 'submit');
      if (!canSubmit()) {
        if (window.AppLog) AppLog.warn('m-login', 'submit blocked: form incomplete');
        return;
      }
      var agree = document.getElementById('mAgree');
      if (!agree || !agree.checked) {
        if (window.AppLog) AppLog.warn('m-login', 'submit blocked: agreement unchecked');
        AppUI.toast('请阅读并同意用户协议与隐私政策', 'error');
        return;
      }
      var res = AppData.login(username.value.trim(), password.value);
      if (!res.ok) {
        if (window.AppLog) AppLog.warn('m-login', 'login failed', res);
        AppUI.toast(res.message || '登录失败', 'error');
        resetSlider();
        return;
      }
      if (window.AppLog) AppLog.info('m-login', 'login ok');
      if (window.HSFNav) HSFNav.go('./todo.html');
      else location.href = './todo.html';
    },
    { signal: signal }
  );

  resetSlider();
})();
