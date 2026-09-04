/**
 * 管理端登录：固定账密 + Canvas 干扰验证码（每次打开/刷新重新生成）
 */
(function () {
  var REMEMBER_KEY = 'loginRemember';
  var captchaValue = '';

  var usernameEl = document.getElementById('username');
  var passwordEl = document.getElementById('password');
  var rememberEl = document.getElementById('rememberPwd');
  var pwdToggle = document.getElementById('pwdToggle');
  var captchaCanvas = document.getElementById('captchaCanvas');
  var captchaRefresh = document.getElementById('captchaRefresh');
  var captchaInput = document.getElementById('captchaInput');
  var submitBtn = document.getElementById('loginSubmit');
  var appNameEl = document.getElementById('loginAppName');

  if (window.AppConfig && appNameEl && AppConfig.appName) {
    appNameEl.textContent = AppConfig.appName;
  }

  AppIcons.injectAll(document);

  function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function drawCaptcha(code) {
    if (!captchaCanvas) return;
    var ctx = captchaCanvas.getContext('2d');
    var w = captchaCanvas.width;
    var h = captchaCanvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);

    for (var i = 0; i < 6; i++) {
      ctx.strokeStyle = 'rgba(' + rand(1, 92) + ',' + rand(74, 187) + ',' + rand(75, 180) + ',0.35)';
      ctx.lineWidth = rand(1, 2);
      ctx.beginPath();
      ctx.moveTo(rand(0, w), rand(0, h));
      ctx.bezierCurveTo(rand(0, w), rand(0, h), rand(0, w), rand(0, h), rand(0, w), rand(0, h));
      ctx.stroke();
    }

    for (var j = 0; j < 40; j++) {
      ctx.fillStyle = 'rgba(' + rand(80, 180) + ',' + rand(100, 200) + ',' + rand(120, 220) + ',0.45)';
      ctx.beginPath();
      ctx.arc(rand(2, w - 2), rand(2, h - 2), rand(1, 2), 0, Math.PI * 2);
      ctx.fill();
    }

    var chars = String(code).split('');
    var slot = w / (chars.length + 1);
    chars.forEach(function (ch, idx) {
      var x = slot * (idx + 1);
      var y = h / 2 + rand(-4, 6);
      var angle = ((rand(-28, 28) * Math.PI) / 180);
      var size = rand(20, 24);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.font = 'bold ' + size + 'px "JetBrains Mono", "Courier New", monospace';
      ctx.fillStyle = 'rgb(' + rand(1, 60) + ',' + rand(60, 120) + ',' + rand(100, 170) + ')';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ch, 0, 0);
      ctx.restore();
    });

    for (var k = 0; k < 3; k++) {
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, rand(0, h));
      ctx.lineTo(w, rand(0, h));
      ctx.stroke();
    }
  }

  function refreshCaptcha() {
    captchaValue = String(Math.floor(1000 + Math.random() * 9000));
    drawCaptcha(captchaValue);
    if (captchaInput) captchaInput.value = '';
    syncSubmitState();
    AppLog.info('login', '验证码已刷新', captchaValue);
  }

  function canSubmit() {
    if (!usernameEl || !passwordEl || !captchaInput) return false;
    return (
      usernameEl.value.trim() !== '' &&
      passwordEl.value !== '' &&
      captchaInput.value.trim().length === 4
    );
  }

  function syncSubmitState() {
    if (!submitBtn) return;
    var ready = canSubmit();
    submitBtn.disabled = !ready;
  }

  function applyDemoDefaults() {
    var demo = window.AppConfig && AppConfig.demoAccount;
    if (!demo) return;
    if (usernameEl) usernameEl.value = demo.username || '';
    if (passwordEl) passwordEl.value = demo.password || '';
  }

  function loadRemembered() {
    var saved = AppStorage.get(REMEMBER_KEY, null);
    if (saved && saved.remember) {
      if (usernameEl && saved.username) usernameEl.value = saved.username;
      if (passwordEl && saved.password) passwordEl.value = saved.password;
      if (rememberEl) rememberEl.checked = true;
      return;
    }
    applyDemoDefaults();
  }

  function persistRemember(username, password, remember) {
    if (remember) {
      AppStorage.set(REMEMBER_KEY, {
        remember: true,
        username: username,
        password: password,
      });
      return;
    }
    AppStorage.remove(REMEMBER_KEY);
  }

  if (pwdToggle && passwordEl) {
    pwdToggle.addEventListener('click', function () {
      var show = passwordEl.type === 'password';
      passwordEl.type = show ? 'text' : 'password';
      pwdToggle.setAttribute('aria-label', show ? '隐藏密码' : '显示密码');
      pwdToggle.setAttribute('aria-pressed', show ? 'true' : 'false');
      var iconEl = pwdToggle.querySelector('[data-icon]');
      if (iconEl) {
        iconEl.setAttribute('data-icon', show ? 'eye' : 'eyeOff');
        AppIcons.inject(iconEl, show ? 'eye' : 'eyeOff');
      }
    });
  }

  captchaRefresh.addEventListener('click', refreshCaptcha);
  refreshCaptcha();
  loadRemembered();

  [usernameEl, passwordEl, captchaInput].forEach(function (el) {
    if (!el) return;
    el.addEventListener('input', syncSubmitState);
    el.addEventListener('change', syncSubmitState);
  });
  syncSubmitState();

  document.getElementById('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!canSubmit()) return;
    var username = usernameEl.value.trim();
    var password = passwordEl.value;
    var captcha = captchaInput.value.trim();
    var remember = rememberEl && rememberEl.checked;

    if (captcha !== captchaValue) {
      AppUI.toast('验证码不正确', 'error');
      refreshCaptcha();
      return;
    }

    var res = AppData.login(username, password);
    if (!res.ok) {
      AppUI.toast(res.message || '登录失败', 'error');
      refreshCaptcha();
      return;
    }

    persistRemember(username, password, remember);
    AppUI.toast('登录成功');
    location.href = './workbench.html';
  });
})();
