/**
 * 全局 SVG 图标（2px 圆润线框）
 */
window.AppIcons = (function () {
  var ATTR =
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

  var PATHS = {
    menu: '<line x1="4" y1="7" x2="20" y2="7"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="17" x2="20" y2="17"></line>',
    workplace:
      '<rect x="3" y="4" width="18" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="18" x2="12" y2="21"></line>',
    list: '<line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line>',
    well: '<circle cx="12" cy="12" r="7"></circle><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>',
    road: '<path d="M4 19l4-14h8l4 14"></path><line x1="9" y1="12" x2="15" y2="12"></line>',
    bridge: '<path d="M3 17h18"></path><path d="M5 17V10a7 7 0 0 1 14 0v7"></path><line x1="8" y1="17" x2="8" y2="12"></line><line x1="16" y1="17" x2="16" y2="12"></line>',
    ledger: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="16" y2="17"></line>',
    org: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>',
    settings:
      '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>',
    log: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="12" y2="17"></line>',
    dict: '<rect x="3" y="4" width="18" height="16" rx="2"></rect><line x1="7" y1="8" x2="17" y2="8"></line><line x1="7" y1="12" x2="17" y2="12"></line><line x1="7" y1="16" x2="13" y2="16"></line>',
    check: '<polyline points="20 6 9 17 4 12"></polyline>',
    close: '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>',
    search: '<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.5" y2="16.5"></line>',
    refresh: '<polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>',
    upload: '<path d="M12 21V9"></path><polyline points="7 14 12 9 17 14"></polyline><path d="M5 3h14"></path>',
    download: '<path d="M12 3v12"></path><polyline points="7 10 12 15 17 10"></polyline><path d="M5 21h14"></path>',
    camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle>',
    flash:
      '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>',
    flashOff:
      '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon><line x1="3" y1="3" x2="21" y2="21"></line>',
    switchCam:
      '<polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>',
    eyeOff:
      '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line>',
    home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline>',
    chevronDown: '<polyline points="6 9 12 15 18 9"></polyline>',
    chevronLeft: '<polyline points="15 18 9 12 15 6"></polyline>',
    chevronRight: '<polyline points="9 18 15 12 9 6"></polyline>',
    phone: '<rect x="7" y="2" width="10" height="20" rx="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line>',
    mapPin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle>',
    clock:
      '<circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15.5 14"></polyline>',
  };

  /** 填充类图标（非描边），viewBox 可为 1024 */
  var FILL_ICONS = {
    brush: {
      viewBox: '0 0 1024 1024',
      body:
        '<path d="M635.392 806.4c-2.048 0-3.584 0-5.632-0.512-158.208-35.328-309.76-49.152-395.264-35.84-7.68 1.024-15.36-1.024-20.992-6.144-18.944-16.896-34.304-64-13.824-108.032 38.4-81.408 167.936-105.984 385.024-73.216 13.824 2.048 23.552 15.36 21.504 29.184-2.048 13.824-15.36 23.552-29.184 21.504-255.488-38.4-315.904 15.872-329.728 41.472-8.704 15.872-7.168 32.768-4.096 42.496 92.672-10.24 241.152 4.096 394.24 38.4 109.568-0.512 242.688-22.528 292.864-31.744V478.72L482.816 258.048 226.304 328.192c-20.48 39.424-97.792 187.392-152.064 279.04-1.024 8.192 1.536 17.408 11.264 20.992 23.552 8.704 78.848-18.432 137.216-128 35.84-68.096 81.408-105.472 134.144-112.128 85.504-10.24 155.648 68.096 158.72 71.168 9.216 10.752 8.192 26.624-2.048 36.352-10.752 9.216-26.624 8.192-36.352-2.048-0.512-0.512-55.296-61.44-114.688-54.272-35.328 4.096-67.072 32.768-94.72 84.992-73.728 139.264-151.552 169.472-200.192 152.064-33.28-12.288-51.2-46.592-43.008-83.456 0.512-2.56 1.536-5.12 3.072-7.68C89.6 481.28 185.344 296.96 185.856 294.912c3.072-6.144 9.216-11.264 15.872-12.8l276.48-75.776c6.144-1.536 12.288-1.024 17.92 1.536l471.04 231.936c8.704 4.096 14.336 13.312 14.336 23.04v282.112c0 12.288-8.704 22.528-20.48 25.088-6.656 1.024-182.784 36.352-325.632 36.352z" fill="currentColor"></path><path d="M49.664 770.56c-7.68 0-14.848-3.584-19.968-9.728-8.704-11.264-6.656-27.136 4.096-35.84l732.16-578.56c12.8-9.728 28.16-14.336 44.032-12.288 15.872 2.048 29.696 10.24 39.424 23.04 18.944 25.088 14.336 60.928-9.728 80.384L666.112 378.88c-3.072 5.632-3.072 9.216-3.072 9.216 8.704 11.264 6.144 27.136-5.12 35.84-11.264 8.704-27.136 6.144-35.84-5.12-8.704-11.776-17.92-39.936 3.584-71.68 1.536-2.048 3.072-4.096 5.12-5.632l176.64-144.384c3.072-2.56 3.584-7.168 1.024-10.24-1.536-2.048-3.584-2.56-5.12-3.072-1.536 0-3.584 0-5.632 1.536l-732.16 578.56c-4.608 4.608-10.24 6.656-15.872 6.656z" fill="currentColor"></path>',
    },
  };

  function svg(name, className) {
    var cls = className ? ' class="' + className + '"' : '';
    var fill = FILL_ICONS[name];
    if (fill) {
      return (
        '<svg viewBox="' +
        fill.viewBox +
        '"' +
        cls +
        ' aria-hidden="true">' +
        fill.body +
        '</svg>'
      );
    }
    var body = PATHS[name];
    if (!body) return '';
    return '<svg viewBox="0 0 24 24"' + cls + ' ' + ATTR + '>' + body + '</svg>';
  }

  function inject(el, name, className) {
    if (!el) return;
    el.innerHTML = svg(name, className);
  }

  function injectAll(root) {
    (root || document).querySelectorAll('[data-icon]').forEach(function (el) {
      inject(el, el.getAttribute('data-icon'));
    });
  }

  return {
    svg: svg,
    inject: inject,
    injectAll: injectAll,
    names: Object.keys(PATHS).concat(Object.keys(FILL_ICONS)),
  };
})();
