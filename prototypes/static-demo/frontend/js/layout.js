/**
 * Admin 骨架：会话校验（vben 壳由 vben/* 组件负责）
 */
(function (global) {
  if (global.AppNav && global.AppStorage && document.querySelector('vben-header')) {
    global.AppNav.requireSession('./login.html');
  }

  if (global.AppIcons) {
    global.AppIcons.injectAll(document);
  }

  if (global.AppLog) global.AppLog.info('layout', 'Vben Admin 骨架就绪');
})(window);
