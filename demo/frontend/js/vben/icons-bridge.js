/**
 * 将 AppIcons 暴露为 vben 侧栏所需的 window.Icons
 */
(function () {
  if (!window.AppIcons) return;

  var keys = [
    'workplace',
    'list',
    'ledger',
    'org',
    'users',
    'settings',
    'shield',
    'log',
    'dict',
    'chevronDown',
    'menu',
    'logout',
  ];

  window.Icons = window.Icons || {};
  keys.forEach(function (k) {
    window.Icons[k] = window.AppIcons.svg(k);
  });
})();
