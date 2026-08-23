/**
 * 轻提示 / 页内模态（禁止 alert/confirm）
 * 小程序有手机壳时，toast 挂到 .app-device__screen 内，避免落在壳外看不见
 */
(function (global) {
  function ensureToastHost() {
    var el = document.getElementById('appToastHost');
    var screen = document.querySelector('.app-device__screen');
    if (el) {
      if (screen && el.parentNode !== screen) {
        el.classList.add('app-toast-host--in-device');
        screen.appendChild(el);
      }
      return el;
    }
    el = document.createElement('div');
    el.id = 'appToastHost';
    el.className = 'app-toast-host';
    if (screen) {
      el.classList.add('app-toast-host--in-device');
      screen.appendChild(el);
    } else {
      document.body.appendChild(el);
    }
    return el;
  }

  function toast(message, type) {
    var kind = type || 'info';
    var text = message == null ? '' : String(message);
    if (global.AppLog) {
      var level = kind === 'error' ? 'warn' : 'info';
      global.AppLog[level]('ui.toast', text, { type: kind });
    }
    var host = ensureToastHost();
    var item = document.createElement('div');
    item.className = 'app-toast app-toast--' + kind;
    item.textContent = text;
    host.appendChild(item);
    setTimeout(function () {
      item.classList.add('is-out');
      setTimeout(function () {
        if (item.parentNode) item.parentNode.removeChild(item);
      }, 220);
    }, 2200);
  }

  function modal(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var mask = document.createElement('div');
      mask.className = 'app-modal-mask';
      mask.innerHTML =
        '<div class="app-modal" role="dialog" aria-modal="true">' +
        '<div class="app-modal__hd">' +
        (opts.title || '提示') +
        '</div>' +
        '<div class="app-modal__bd"></div>' +
        '<div class="app-modal__ft">' +
        (opts.showCancel === false
          ? ''
          : '<button type="button" class="app-btn" data-act="cancel">' +
            (opts.cancelText || '取消') +
            '</button>') +
        '<button type="button" class="app-btn app-btn--primary" data-act="ok">' +
        (opts.okText || '确定') +
        '</button>' +
        '</div></div>';
      var bd = mask.querySelector('.app-modal__bd');
      if (typeof opts.content === 'string') bd.textContent = opts.content;
      else if (opts.content) bd.appendChild(opts.content);
      function close(val) {
        if (mask.parentNode) mask.parentNode.removeChild(mask);
        resolve(val);
      }
      mask.querySelector('[data-act="ok"]').addEventListener('click', function () {
        close(true);
      });
      var cancel = mask.querySelector('[data-act="cancel"]');
      if (cancel) {
        cancel.addEventListener('click', function () {
          close(false);
        });
      }
      mask.addEventListener('click', function (e) {
        if (e.target === mask && opts.closeOnMask) close(false);
      });
      var screen = document.querySelector('.app-device__screen');
      (screen || document.body).appendChild(mask);
    });
  }

  global.AppUI = { toast: toast, modal: modal };
})(window);
