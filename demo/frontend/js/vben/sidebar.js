/**
 * Vben Sidebar — 高标农田专项整治平台
 */
(function () {
  var Icons = {
    collapseLeft:
      '<svg viewBox="0 0 24 24"><path d="M17.59 18L19 16.59 14.42 12 19 7.41 17.59 6l-6 6zM11 18l1.41-1.41L7.83 12l4.58-4.59L11 6l-6 6z"/></svg>',
    collapseRight:
      '<svg viewBox="0 0 24 24"><path d="M6.41 6L5 7.41 9.58 12 5 16.59 6.41 18l6-6zM13 6l-1.41 1.41L16.17 12l-4.58 4.59L13 18l6-6z"/></svg>',
    chevronDown:
      '<svg viewBox="0 0 24 24"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>',
  };

  function getProjectBase() {
    if (window.HSF_BASE != null && String(window.HSF_BASE).length) {
      var b = String(window.HSF_BASE);
      if (b.slice(-1) !== '/') b += '/';
      return b;
    }
    var script = document.querySelector('script[src*="vben/sidebar.js"]');
    if (script) {
      var src = script.getAttribute('src') || '';
      if (src.indexOf('frontend/') !== -1) return src.split('frontend/')[0];
    }
    return '../';
  }

  function getMenuItems() {
    return window.HSF_VBEN_MENU && window.HSF_VBEN_MENU.length ? window.HSF_VBEN_MENU : [];
  }

  function buildMenuIconHtml(iconKey) {
    var iconLib = window.Icons || {};
    var mapped = iconLib[iconKey];
    if (!mapped) return '';
    return '<div class="menu-icon menu-icon--outline">' + mapped + '</div>';
  }

  class VbenSidebar extends HTMLElement {
    constructor() {
      super();
      this.render();
    }

    render() {
      this.innerHTML =
        '<div class="sidebar-container" id="sidebar">' +
        '<div class="logo-area" id="sidebar-logo"></div>' +
        '<div class="menu-wrapper" id="menu-root"></div>' +
        '<div class="sidebar-footer">' +
        '<div class="collapse-btn-box" id="btn-collapse-mini">' +
        Icons.collapseLeft +
        '</div></div></div>';
    }

    connectedCallback() {
      var self = this;
      setTimeout(function () {
        self.loadLogo();
        self.renderMenu();
        self.bindEvents();
        self.highlightCurrentMenu();
      }, 0);

      document.addEventListener('app-toggle-mini', function () {
        self.toggleMini();
      });
      document.addEventListener('app-toggle-hide', function () {
        var sidebar = self.querySelector('#sidebar');
        if (sidebar) sidebar.classList.toggle('hidden');
      });
    }

    toggleMini() {
      var sidebar = this.querySelector('#sidebar');
      if (!sidebar) return;
      sidebar.classList.toggle('mini');
      var iconBox = this.querySelector('#btn-collapse-mini');
      var isMini = sidebar.classList.contains('mini');
      if (iconBox) iconBox.innerHTML = isMini ? Icons.collapseRight : Icons.collapseLeft;
    }

    loadLogo() {
      var container = this.querySelector('#sidebar-logo');
      if (!container) return;
      var base = getProjectBase();
      var logoSrc = base + 'media/favicon.png';
      var homeHref = base + 'web/workbench.html';
      var title =
        (window.AppConfig && window.AppConfig.appName) || '高标农田专项整治平台';
      container.innerHTML =
        '<a class="sidebar-logo-link" href="' +
        homeHref +
        '" title="' +
        title +
        '">' +
        '<img src="' +
        logoSrc +
        '" alt="" class="sidebar-logo-img" />' +
        '</a>';
    }

    renderMenu() {
      var menuRoot = this.querySelector('#menu-root');
      if (!menuRoot) return;

      function createMenuHtml(items, level) {
        var html = '';
        items.forEach(function (item) {
          var hasChild = item.children && item.children.length > 0;
          var iconHtml = item.icon ? buildMenuIconHtml(item.icon) : '';
          var arrowHtml = hasChild ? '<div class="arrow-icon">' + Icons.chevronDown + '</div>' : '';
          html +=
            '<div class="menu-group">' +
            '<div class="menu-item" data-path="' +
            (item.path || '') +
            '" data-title="' +
            item.title +
            '" data-level="' +
            level +
            '" data-has-child="' +
            hasChild +
            '">' +
            iconHtml +
            '<span>' +
            item.title +
            '</span>' +
            arrowHtml +
            '</div>' +
            (hasChild
              ? '<div class="submenu"><div>' + createMenuHtml(item.children, level + 1) + '</div></div>'
              : '') +
            '</div>';
        });
        return html;
      }

      menuRoot.innerHTML = createMenuHtml(getMenuItems(), 1);
    }

    highlightCurrentMenu() {
      var currentPath = decodeURIComponent(window.location.pathname).replace(/\\/g, '/');
      var menuItems = this.querySelectorAll('.menu-item');

      menuItems.forEach(function (item) {
        var itemPath = item.dataset.path;
        if (!itemPath || itemPath.length < 2) return;
        var cleanItemPath = itemPath.replace(/^(\.\.\/|\.\/)+/, '/');
        if (currentPath.indexOf(cleanItemPath) !== -1 || currentPath.endsWith(cleanItemPath.slice(1))) {
          item.classList.add('active');
          var parent = item.parentElement;
          while (parent) {
            var submenu = parent.closest('.submenu');
            if (submenu) {
              submenu.classList.add('open');
              var parentMenuItem = submenu.previousElementSibling;
              if (parentMenuItem) parentMenuItem.classList.add('expanded');
              parent = submenu.parentElement;
            } else {
              break;
            }
          }
          setTimeout(function () {
            document.dispatchEvent(
              new CustomEvent('app-menu-change', {
                detail: { title: item.dataset.title, path: itemPath },
              })
            );
          }, 100);
        }
      });
    }

    bindEvents() {
      var self = this;
      var menuRoot = this.querySelector('#menu-root');
      if (!menuRoot) return;

      menuRoot.addEventListener('click', function (e) {
        var menuItem = e.target.closest('.menu-item');
        if (!menuItem) return;

        var sidebar = self.querySelector('#sidebar');
        if (sidebar && sidebar.classList.contains('mini')) {
          self.toggleMini();
          return;
        }

        var hasChild = menuItem.dataset.hasChild === 'true';
        if (hasChild) {
          var isOpening = !menuItem.classList.contains('expanded');
          if (isOpening) {
            var parentContainer = menuItem.parentElement.parentElement;
            var siblingsExpanded = parentContainer.querySelectorAll(
              ':scope > .menu-group > .menu-item.expanded'
            );
            siblingsExpanded.forEach(function (sibling) {
              if (sibling !== menuItem) {
                sibling.classList.remove('expanded');
                if (sibling.nextElementSibling) sibling.nextElementSibling.classList.remove('open');
              }
            });
          }
          menuItem.classList.toggle('expanded');
          var submenu = menuItem.nextElementSibling;
          if (submenu) submenu.classList.toggle('open');
        } else {
          var path = menuItem.dataset.path;
          if (path && path !== '#') {
            var basePath = getProjectBase();
            var cleanPath = path.startsWith('/') ? path.substring(1) : path;
            window.location.href = basePath + cleanPath;
          }
        }
      });

      var collapseBtn = this.querySelector('#btn-collapse-mini');
      if (collapseBtn) {
        collapseBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          self.toggleMini();
        });
      }
    }
  }

  if (!customElements.get('vben-sidebar')) {
    customElements.define('vben-sidebar', VbenSidebar);
  }
})();
