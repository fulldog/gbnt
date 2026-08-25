/**
 * 移动端手机壳挂载：流体背景 + phone.png + 小程序顶栏
 * 资源来源：应急局航空器管理平台 demo-phone / device-shell
 *
 * 页面配置（写在 #app-viewport 上）：
 *   data-mp-status="transparent" | "solid"   顶栏背景；登录/主界面用 transparent，子页用 solid（默认）
 *   data-mp-title="标题文案"                 导航行左侧标题（可空）
 *   data-mp-back="./todo.html"               有则显示返回箭头
 */
(function (global) {
  'use strict';

  var VIEWPORT_ID = 'app-viewport';

  function asset(path) {
    return '../frontend/assets/phone/' + path;
  }

  var STATUS_SYS_HTML =
    '<div class="app-device__sys" aria-hidden="true">' +
    '<span class="app-device__signal"><i></i><i></i><i></i><i></i></span>' +
    '<span class="app-device__net">5G</span>' +
    '<span class="app-device__battery">' +
    '<span class="app-device__battery-body"><span class="app-device__battery-num">87</span></span>' +
    '<span class="app-device__battery-cap"></span>' +
    '</span>' +
    '</div>';

  var CAPSULE_HTML =
    '<div class="mp-capsule" aria-hidden="true">' +
    '<span class="mp-capsule__item mp-capsule__item--more">' +
    '<span class="mp-capsule__dots"><i></i><i></i><i></i></span>' +
    '</span>' +
    '<span class="mp-capsule__divider"></span>' +
    '<span class="mp-capsule__item mp-capsule__item--close">' +
    '<span class="mp-capsule__close"></span>' +
    '</span>' +
    '</div>';

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function readPageConfig(contentRoot) {
    var ds = (contentRoot && contentRoot.dataset) || {};
    var mode = (ds.mpStatus || 'solid').toLowerCase();
    if (mode !== 'transparent' && mode !== 'solid') mode = 'solid';
    return {
      statusMode: mode,
      title: ds.mpTitle != null ? String(ds.mpTitle) : '',
      backHref: ds.mpBack != null ? String(ds.mpBack) : '',
    };
  }

  function getStatusEl() {
    return document.querySelector('.app-device__status');
  }

  /** @param {'transparent'|'solid'} mode */
  function setStatusMode(mode) {
    var el = getStatusEl();
    if (!el) return;
    var next = mode === 'transparent' ? 'transparent' : 'solid';
    el.classList.toggle('app-device__status--transparent', next === 'transparent');
    el.classList.toggle('app-device__status--solid', next === 'solid');
  }

  function setNavTitle(title) {
    var el = document.querySelector('.app-device__nav-title');
    if (!el) return;
    el.textContent = title || '';
  }

  function setNavBack(href) {
    var slot = document.querySelector('.app-device__nav-left');
    if (!slot) return;
    slot.innerHTML = '';
    if (!href) {
      slot.hidden = true;
      slot.classList.add('is-empty');
      return;
    }
    slot.hidden = false;
    slot.classList.remove('is-empty');
    var a = document.createElement('a');
    a.className = 'app-device__nav-back';
    a.href = href;
    a.setAttribute('aria-label', '返回');
    a.innerHTML =
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"></polyline></svg>';
    slot.appendChild(a);
  }

  function updateDeviceTime() {
    var el = document.querySelector('.app-device__time');
    if (!el) return;
    var d = new Date();
    el.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function initFluidBg() {
    if (!global.Color4Bg) return;
    var host = document.getElementById('appHost');
    if (!host || document.getElementById('colorbgcanvas')) return;
    var BgClass = global.Color4Bg.AestheticFluidBg || global.Color4Bg['美学流体Bg'];
    if (!BgClass) return;
    new BgClass({
      dom: 'appHost',
      colors: ['#d6e4f5', '#ffffff', '#c5d8ef', '#e8f0fa', '#ebebeb', '#f0f4f8'],
      loop: true,
    });
  }

  function mountShell() {
    if (document.querySelector('.app-device')) return;
    var contentRoot = document.getElementById(VIEWPORT_ID);
    if (!contentRoot) return;

    var cfg = readPageConfig(contentRoot);

    var body = document.body;
    body.classList.add('app-host');
    body.id = 'appHost';

    var device = document.createElement('div');
    device.className = 'app-device';

    var screen = document.createElement('div');
    screen.className = 'app-device__screen';

    var status = document.createElement('div');
    status.className =
      'app-device__status app-device__status--' +
      (cfg.statusMode === 'transparent' ? 'transparent' : 'solid');
    status.innerHTML =
      '<div class="app-device__status-row app-device__status-row--sys">' +
      '<span class="app-device__time">9:41</span>' +
      STATUS_SYS_HTML +
      '</div>' +
      '<div class="app-device__status-row app-device__status-row--nav">' +
      '<div class="app-device__nav-left"></div>' +
      '<span class="app-device__nav-title"></span>' +
      CAPSULE_HTML +
      '</div>';

    var viewport = document.createElement('div');
    viewport.className = 'app-device__viewport';
    viewport.id = VIEWPORT_ID;
    // 保留页面配置，便于后续脚本读取
    if (contentRoot.dataset.mpStatus) viewport.dataset.mpStatus = contentRoot.dataset.mpStatus;
    if (contentRoot.dataset.mpTitle != null) viewport.dataset.mpTitle = contentRoot.dataset.mpTitle;
    if (contentRoot.dataset.mpBack != null) viewport.dataset.mpBack = contentRoot.dataset.mpBack;

    while (contentRoot.firstChild) {
      viewport.appendChild(contentRoot.firstChild);
    }
    contentRoot.replaceWith(viewport);

    var homeBar = document.createElement('div');
    homeBar.className = 'app-device__home-indicator';

    screen.appendChild(status);
    screen.appendChild(viewport);
    screen.appendChild(homeBar);

    var shellImg = document.createElement('img');
    shellImg.className = 'app-device__shell';
    shellImg.src = asset('phone.png');
    shellImg.alt = '';
    shellImg.draggable = false;

    device.appendChild(screen);
    device.appendChild(shellImg);
    body.insertBefore(device, body.firstChild);

    setNavBack(cfg.backHref);
    setNavTitle(cfg.title);
    updateDeviceTime();
    initFluidBg();
    document.documentElement.classList.add('hsf-shell-ready');
  }

  mountShell();
  document.addEventListener('DOMContentLoaded', function () {
    updateDeviceTime();
    setInterval(updateDeviceTime, 30000);
    initFluidBg();
  });

  global.HSFDevice = {
    mountShell: mountShell,
    updateDeviceTime: updateDeviceTime,
    setStatusMode: setStatusMode,
    setNavTitle: setNavTitle,
    setNavBack: setNavBack,
    getMountRoot: function () {
      return document.getElementById(VIEWPORT_ID) || document.querySelector('.app-device__viewport');
    },
  };
})(window);
