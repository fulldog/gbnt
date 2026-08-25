/**
 * 小程序端软跳转：保留手机壳 + 流体背景，只替换 #app-viewport 内容
 * 解决多页整页刷新导致的背景/外壳重挂闪屏
 *
 * 用法：
 *   HSFNav.go('./todo.html')
 *   页面内 <a href="./xxx.html"> 自动拦截（同目录 miniapp）
 *   跳转前派发 hsf-page-leave，便于页脚本释放 document 级监听
 */
(function (global) {
  'use strict';

  var navBusy = false;
  /**  bump 后软跳转会强制重载 watermark 等公共脚本，避免旧水印逻辑残留 */
  /**  bump 后软跳转会强制重载 watermark / mp-photos / well-water-photos 等公共脚本 */
  var FRAMEWORK_ASSET_VER = 'well-sign-2';
  var FRAMEWORK_SCRIPT_HINTS = [
    'logger.js',
    'icons.js',
    'config.js',
    'storage.js',
    'region-2023.js',
    'mp-region-picker.js',
    'seed.js',
    'data.js',
    'project-code.js',
    'ui.js',
    'watermark.js',
    'mp-photos.js',
    'mp-media.js',
    'image-compress.js',
    'picker-date-loop.js',
    'mp-signature.js',
    'well-submit-rules.js',
    'well-water-photos.js',
    'device-shell.js',
    'mp-nav.js',
    'fluid-bg',
  ];

  function getViewport() {
    return (
      document.getElementById('app-viewport') ||
      document.querySelector('.app-device__viewport')
    );
  }

  function canSoftNavigate(href) {
    if (!document.querySelector('.app-device')) return false;
    if (document.body.classList.contains('demo-phone-host')) return false;
    try {
      var url = new URL(href, global.location.href);
      if (url.origin !== global.location.origin) return false;
      if (url.pathname.indexOf('/miniapp/') === -1) return false;
      if (/\/demo-phone\.html$/i.test(url.pathname)) return false;
      return true;
    } catch (e) {
      return false;
    }
  }

  function resolveUrl(href, base) {
    return new URL(href, base || global.location.href).href;
  }

  function isFrameworkScript(src) {
    return FRAMEWORK_SCRIPT_HINTS.some(function (name) {
      return src.indexOf(name) !== -1;
    });
  }

  function isPageScript(src) {
    return /\/frontend\/js\/pages\//.test(src) || /\/js\/pages\//.test(src);
  }

  function emitLeave() {
    try {
      document.dispatchEvent(new CustomEvent('hsf-page-leave'));
    } catch (e) {
      /* ignore */
    }
  }

  function applyStatusFromViewport(viewport) {
    if (!global.HSFDevice) return;
    var mode = (viewport.dataset.mpStatus || 'solid').toLowerCase();
    if (typeof global.HSFDevice.setStatusMode === 'function') {
      global.HSFDevice.setStatusMode(mode === 'transparent' ? 'transparent' : 'solid');
    }
    if (typeof global.HSFDevice.setNavTitle === 'function') {
      global.HSFDevice.setNavTitle(viewport.dataset.mpTitle || '');
    }
    if (typeof global.HSFDevice.setNavBack === 'function') {
      global.HSFDevice.setNavBack(viewport.dataset.mpBack || '');
    }
  }

  function syncDataset(fromEl, toEl) {
    ['mpStatus', 'mpTitle', 'mpBack'].forEach(function (key) {
      if (fromEl.dataset[key] != null) toEl.dataset[key] = fromEl.dataset[key];
      else delete toEl.dataset[key];
    });
  }

  function ensureStylesheet(absHref) {
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    for (var i = 0; i < links.length; i++) {
      if (links[i].href === absHref) return Promise.resolve();
      try {
        if (new URL(links[i].href).pathname === new URL(absHref).pathname) {
          return Promise.resolve();
        }
      } catch (e) {
        /* ignore */
      }
    }
    return new Promise(function (resolve, reject) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = absHref;
      link.onload = function () {
        resolve();
      };
      link.onerror = reject;
      document.head.appendChild(link);
    });
  }

  function ensureStylesheets(doc, pageUrl) {
    var tasks = [];
    doc.querySelectorAll('head link[rel="stylesheet"]').forEach(function (node) {
      var href = node.getAttribute('href');
      if (!href) return;
      tasks.push(ensureStylesheet(resolveUrl(href, pageUrl)));
    });
    return Promise.all(tasks);
  }

  function removeActivePageScripts() {
    document.querySelectorAll('script[data-hsf-page-script="1"]').forEach(function (node) {
      node.remove();
    });
  }

  function scriptPathname(src) {
    try {
      return new URL(src, global.location.href).pathname;
    } catch (e) {
      return '';
    }
  }

  function scriptAlreadyLoaded(absSrc) {
    var targetPath = scriptPathname(absSrc);
    if (!targetPath) return false;
    var scripts = document.querySelectorAll('script[src]');
    for (var i = 0; i < scripts.length; i++) {
      if (scriptPathname(scripts[i].src) === targetPath) return true;
    }
    return false;
  }

  function removeFrameworkScript(absSrc) {
    var targetPath = scriptPathname(absSrc);
    if (!targetPath) return;
    var scripts = document.querySelectorAll('script[src]');
    for (var i = 0; i < scripts.length; i++) {
      if (scriptPathname(scripts[i].src) === targetPath && scripts[i].parentNode) {
        scripts[i].parentNode.removeChild(scripts[i]);
      }
    }
  }

  /** 公共脚本：首屏未引入的依赖在软跳转时补载；关键模块带版本号热更新 */
  function ensureFrameworkScript(absSrc) {
    var path = scriptPathname(absSrc) || absSrc;
    var isHotReload = /(?:watermark|well-water-photos|well-submit-rules|mp-photos|mp-signature)\.js$/i.test(path);
    var isIcons = /icons\.js$/i.test(path);
    if (isHotReload) {
      removeFrameworkScript(absSrc);
    } else if (scriptAlreadyLoaded(absSrc)) {
      if (isIcons && (!global.AppIcons || typeof global.AppIcons.injectAll !== 'function')) {
        removeFrameworkScript(absSrc);
      } else {
        return Promise.resolve();
      }
    } else if (isIcons && global.AppIcons && typeof global.AppIcons.injectAll !== 'function') {
      removeFrameworkScript(absSrc);
    }
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      var src = absSrc;
      if (isHotReload) {
        src =
          absSrc +
          (absSrc.indexOf('?') >= 0 ? '&' : '?') +
          'v=' +
          FRAMEWORK_ASSET_VER;
      }
      script.src = src;
      script.setAttribute('data-hsf-framework', '1');
      script.onload = function () {
        if (global.AppLog) global.AppLog.info('mp-nav', '补载公共脚本', src);
        resolve();
      };
      script.onerror = reject;
      document.body.appendChild(script);
    });
  }

  function loadPageScript(absSrc) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = absSrc + (absSrc.indexOf('?') >= 0 ? '&' : '?') + '_hsf=' + Date.now();
      script.setAttribute('data-hsf-page-script', '1');
      script.onload = function () {
        resolve();
      };
      script.onerror = reject;
      document.body.appendChild(script);
    });
  }

  function runPageScripts(doc, pageUrl) {
    removeActivePageScripts();
    var scripts = doc.body ? doc.body.querySelectorAll('script') : [];
    var chain = Promise.resolve();
    scripts.forEach(function (node) {
      chain = chain.then(function () {
        var src = node.getAttribute('src');
        if (!src) {
          var code = (node.textContent || '').trim();
          if (!code) return;
          var s = document.createElement('script');
          s.textContent = code;
          s.setAttribute('data-hsf-page-script', '1');
          document.body.appendChild(s);
          return;
        }
        var abs = resolveUrl(src, pageUrl);
        if (isFrameworkScript(src)) {
          return ensureFrameworkScript(abs);
        }
        // pages/* 每次重载；其它依赖（如 maplibre-gl.js）只补载一次
        if (isPageScript(src)) {
          return loadPageScript(abs);
        }
        return ensureFrameworkScript(abs);
      });
    });
    return chain;
  }

  function applyPageDocument(doc) {
    document.title = doc.title || document.title;
    var viewport = getViewport();
    if (!viewport) throw new Error('viewport missing');
    var fetched = doc.getElementById('app-viewport');
    if (!fetched) throw new Error('fetched viewport missing');
    syncDataset(fetched, viewport);
    viewport.innerHTML = fetched.innerHTML;
    applyStatusFromViewport(viewport);
    if (global.AppIcons && typeof global.AppIcons.injectAll === 'function') {
      global.AppIcons.injectAll(viewport);
    }
  }

  function softNavigate(href, replace, fromHistory) {
    if (navBusy) return Promise.resolve(false);
    if (!canSoftNavigate(href)) {
      if (replace) global.location.replace(href);
      else global.location.href = href;
      return Promise.resolve(false);
    }

    navBusy = true;
    var url = new URL(href, global.location.href);
    var viewport = getViewport();
    if (viewport) viewport.classList.add('hsf-viewport--navigating');
    emitLeave();

    return fetch(url.href, { credentials: 'same-origin', cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('fetch ' + res.status);
        return res.text();
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        if (!fromHistory) {
          var state = { hsfSoftNav: true };
          if (replace) global.history.replaceState(state, '', url.href);
          else global.history.pushState(state, '', url.href);
        }
        applyPageDocument(doc);
        return ensureStylesheets(doc, url.href).then(function () {
          return runPageScripts(doc, url.href);
        });
      })
      .then(function () {
        try {
          document.dispatchEvent(
            new CustomEvent('hsf-page-navigated', { detail: { url: url.href } })
          );
        } catch (e) {
          /* ignore */
        }
        return true;
      })
      .catch(function (err) {
        if (global.AppLog) global.AppLog.warn('mp-nav', '软跳转失败，回退整页', err);
        if (replace) global.location.replace(url.href);
        else global.location.href = url.href;
        return false;
      })
      .finally(function () {
        navBusy = false;
        if (viewport) viewport.classList.remove('hsf-viewport--navigating');
      });
  }

  function onDocumentClick(e) {
    if (e.defaultPrevented) return;
    if (e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) === '#') return;
    if (a.target && a.target !== '_self') return;
    if (!canSoftNavigate(href)) return;
    e.preventDefault();
    softNavigate(href, false, false);
  }

  document.addEventListener('click', onDocumentClick);

  global.addEventListener('popstate', function () {
    if (!document.querySelector('.app-device')) return;
    softNavigate(global.location.href, true, true);
  });

  // 首次进入打上 history state，便于后退也走软跳
  if (document.querySelector('.app-device')) {
    try {
      if (!global.history.state || !global.history.state.hsfSoftNav) {
        global.history.replaceState({ hsfSoftNav: true }, '', global.location.href);
      }
    } catch (e) {
      /* ignore */
    }
  }

  global.HSFNav = {
    go: function (href, replace) {
      return softNavigate(href, !!replace, false);
    },
    canSoftNavigate: canSoftNavigate,
  };
})(window);
