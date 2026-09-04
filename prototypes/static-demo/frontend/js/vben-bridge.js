/**
 * 将 HSF_NAV 转为 vben-sidebar 所需 menu 结构。
 * path 使用以 / 开头的「相对项目根」形式。
 */
(function () {
  function normPath(p) {
    if (!p) return '';
    p = String(p).replace(/^\//, '');
    return '/' + p;
  }

  function toMenuItem(node) {
    var item = { title: node.label };
    if (node.icon) item.icon = node.icon;
    if (node.path) item.path = normPath(node.path);
    if (node.openInNewTab) item.openInNewTab = true;
    return item;
  }

  var nav = window.HSF_NAV || [];
  var menu = [];
  for (var i = 0; i < nav.length; i++) {
    var m = nav[i];
    if (m.children && m.children.length) {
      var kids = [];
      for (var j = 0; j < m.children.length; j++) {
        var c = m.children[j];
        if (c.path) kids.push(toMenuItem(c));
      }
      if (kids.length) {
        var group = { title: m.label, children: kids };
        if (m.icon) group.icon = m.icon;
        menu.push(group);
      }
    } else if (m.path) {
      menu.push(toMenuItem(m));
    }
  }
  window.HSF_VBEN_MENU = menu;
})();
