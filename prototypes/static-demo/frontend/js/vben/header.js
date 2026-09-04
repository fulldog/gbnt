/**
 * Vben Header — 顶栏、面包屑、多页签、菜单搜索、退出
 */
(function () {
  var TAGS_KEY = 'hsf:vben-tags';
  var PRIMARY = '#015cbb';

  function getProjectBase() {
    if (window.HSF_BASE != null && String(window.HSF_BASE).length) {
      var b = String(window.HSF_BASE);
      if (b.slice(-1) !== '/') b += '/';
      return b;
    }
    return '../';
  }

  function flattenMenu(items, out) {
    out = out || [];
    (items || []).forEach(function (item) {
      if (item.path) out.push({ title: item.title, path: item.path });
      if (item.children) flattenMenu(item.children, out);
    });
    return out;
  }

  class TopLoader {
    static start() {
      var oldBar = document.getElementById('top-loader');
      if (oldBar) oldBar.remove();
      var bar = document.createElement('div');
      bar.id = 'top-loader';
      bar.style.cssText =
        'position:fixed;top:0;left:0;width:0;height:2px;background:' +
        PRIMARY +
        ';z-index:99999;transition:width 0.2s ease;';
      document.body.appendChild(bar);
      setTimeout(function () {
        bar.style.width = '30%';
      }, 10);
      setTimeout(function () {
        bar.style.width = '70%';
      }, 200);
      setTimeout(function () {
        bar.style.width = '100%';
      }, 500);
      setTimeout(function () {
        bar.style.opacity = '0';
        setTimeout(function () {
          bar.remove();
        }, 300);
      }, 800);
    }
  }
  window.TopLoader = TopLoader;

  var Icons = {
    menuFold:
      '<svg viewBox="0 0 24 24"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>',
    refresh:
      '<svg viewBox="0 0 24 24"><path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-8 3.58-8 8s3.58 8 8 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>',
    search:
      '<svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>',
    fullscreen:
      '<svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>',
    close:
      '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
    list:
      '<svg viewBox="0 0 24 24"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>',
    moreDown:
      '<svg viewBox="0 0 24 24"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/></svg>',
    closeOther:
      '<svg viewBox="0 0 24 24"><path d="M16.66 4.52l2.83 2.83-2.83 2.83-2.83-2.83 2.83-2.83M16.66 1.69L11 7.34 16.66 13l5.66-5.66-5.66-5.65zm-9.32 0l2.83 2.83-2.83 2.83-2.83-2.83 2.83-2.83M7.34 1.69L1.69 7.34 7.34 13l5.66-5.66-5.66-5.65zM12 15l-5 5h10l-5-5z"/></svg>',
    minus: '<svg viewBox="0 0 24 24"><path d="M19 13H5v-2h14v2z"/></svg>',
    external:
      '<svg viewBox="0 0 24 24"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>',
    pin:
      '<svg viewBox="0 0 24 24"><path d="M16,12V4H17V2H7V4H8V12L6,14V16H11.2V22H12.8V16H18V14L16,12Z" /></svg>',
  };

  var arrowIcon =
    '<svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:currentColor;"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>';

  class VbenHeader extends HTMLElement {
    constructor() {
      super();
      this.menuFlat = flattenMenu(window.HSF_VBEN_MENU || []);
      this.tags = this.loadTags();
      this.render();
    }

    loadTags() {
      try {
        var stored = sessionStorage.getItem(TAGS_KEY);
        if (stored) return JSON.parse(stored);
      } catch (e) {}
      var home = { title: '工作台', path: '/web/workbench.html' };
      var def = window.HSF_VBEN_DEFAULT_TAG || home;
      if (def.path === home.path) {
        return [{ title: home.title, path: home.path, active: true }];
      }
      return [
        { title: home.title, path: home.path, active: false },
        { title: def.title, path: def.path, active: true },
      ];
    }

    saveTags() {
      sessionStorage.setItem(TAGS_KEY, JSON.stringify(this.tags));
    }

    render() {
      this.innerHTML =
        '<div class="header-container">' +
        '<div class="header-left">' +
        '<div id="toggle-btn" class="action-icon" title="隐藏菜单">' +
        Icons.menuFold +
        '</div>' +
        '<div id="refresh-btn" class="action-icon" title="刷新">' +
        Icons.refresh +
        '</div>' +
        '<div id="breadcrumb-container" class="header-breadcrumb"></div>' +
        '</div>' +
        '<div class="header-right">' +
        '<div id="btn-search" class="search-btn">' +
        '<div class="icon">' +
        Icons.search +
        '</div>' +
        '<div class="text">搜索导航菜单</div>' +
        '<div class="key">⌘ K</div>' +
        '</div>' +
        '<div id="btn-fullscreen" class="action-icon" title="全屏">' +
        Icons.fullscreen +
        '</div>' +
        '<div class="popover-container">' +
        '<div class="user-dropdown" id="btn-user">' +
        '<div class="user-avatar-box user-avatar-box--text" id="userAvatarBox">管</div>' +
        '<span class="user-name" id="userNameLabel">管理员</span>' +
        '</div>' +
        '<div class="popover-body user-menu" id="user-menu-box">' +
        '<div class="user-menu-item" id="btn-logout-action">退出登录</div>' +
        '</div></div></div></div>' +
        '<div class="tags-view-container">' +
        '<div id="tags-container"></div>' +
        '<div class="tags-more-btn" id="tags-more-btn">' +
        Icons.moreDown +
        '<div class="tags-dropdown-menu" id="tags-dropdown">' +
        '<div class="tags-dropdown-item" id="tag-act-refresh">' +
        Icons.refresh +
        ' 重新加载</div>' +
        '<div class="tags-dropdown-item" id="tag-act-close">' +
        Icons.close +
        ' 关闭当前</div>' +
        '<div class="tags-dropdown-item" id="tag-act-other">' +
        Icons.closeOther +
        ' 关闭其他</div>' +
        '<div class="tags-dropdown-item" id="tag-act-all">' +
        Icons.minus +
        ' 关闭全部</div>' +
        '<div class="tags-divider"></div>' +
        '<div class="tags-dropdown-item" id="tag-act-window">' +
        Icons.external +
        ' 在新窗口打开</div>' +
        '</div></div></div>' +
        '<div id="search-modal" class="modal-overlay">' +
        '<div class="search-modal-box">' +
        '<div class="search-input-group">' +
        '<div class="search-input-icon">' +
        Icons.search +
        '</div>' +
        '<input type="text" placeholder="搜索导航菜单..." id="search-input" autocomplete="off" />' +
        '</div>' +
        '<div class="search-history" id="search-results-box"></div>' +
        '<div class="modal-footer"><span>↵ 选择</span><span>ESC 关闭</span></div>' +
        '</div></div>' +
        '<div class="v62-overlay v62-overlay-top" id="v62-confirm-overlay">' +
        '<div class="v62-modal-box">' +
        '<div class="v62-header">' +
        '<div class="v62-title-area"><span class="v62-icon v62-icon-info">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>' +
        '</span><span>提示</span></div>' +
        '<div class="v62-close-x" id="v62-logout-close" title="关闭">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' +
        '</div></div>' +
        '<div class="v62-body">确定退出登录吗？</div>' +
        '<div class="v62-footer">' +
        '<button type="button" class="v62-btn" id="v62-logout-cancel">取消</button>' +
        '<button type="button" class="v62-btn v62-btn-primary" id="v62-logout-ok">确定</button>' +
        '</div></div></div>';
    }

    connectedCallback() {
      var self = this;
      this.applySessionUser();
      this.bindEvents();
      setTimeout(function () {
        self.ensureHomeTag();
        self.highlightCurrentTag();
        self.renderTags();
        self.renderSearchResults('');
        if (window.TopLoader) TopLoader.start();
      }, 0);
    }

    ensureHomeTag() {
      var homePath = '/web/workbench.html';
      if (!this.tags.some(function (t) {
        return t.path === homePath;
      })) {
        this.tags.unshift({ title: '工作台', path: homePath, active: false });
      }
    }

    applySessionUser() {
      var session = window.AppStorage && window.AppStorage.get('session', null);
      var name = (session && (session.name || session.username)) || '管理员';
      var label = document.getElementById('userNameLabel');
      var avatar = document.getElementById('userAvatarBox');
      if (label) label.textContent = name;
      if (avatar) avatar.textContent = name.slice(0, 1);
    }

    highlightCurrentTag() {
      var currentPath = decodeURIComponent(window.location.pathname).replace(/\\/g, '/');
      var hasActive = false;
      this.tags.forEach(function (tag) {
        if (tag.path && currentPath.indexOf(tag.path) !== -1) {
          tag.active = true;
          hasActive = true;
        } else {
          tag.active = false;
        }
      });
      if (!hasActive && window.HSF_VBEN_DEFAULT_TAG) {
        var d = window.HSF_VBEN_DEFAULT_TAG;
        var needle = (d.path || '').replace(/^\//, '');
        if (needle && currentPath.indexOf(needle) !== -1) {
          this.tags.forEach(function (t) {
            t.active = false;
          });
          var ex = this.tags.find(function (t) {
            return t.path === d.path;
          });
          if (ex) ex.active = true;
          else this.tags.push({ title: d.title, path: d.path, active: true });
          hasActive = true;
        }
      }
      if (!hasActive && this.tags.length) {
        this.tags[this.tags.length - 1].active = true;
      }
      this.saveTags();
    }

    renderSearchResults(keyword) {
      var box = this.querySelector('#search-results-box');
      if (!box) return;
      var kw = (keyword || '').trim().toLowerCase();
      var list = this.menuFlat.filter(function (item) {
        return !kw || item.title.toLowerCase().indexOf(kw) !== -1;
      });
      if (!list.length) {
        box.innerHTML = '<div class="search-empty">未找到匹配菜单</div>';
        return;
      }
      box.innerHTML = list
        .map(function (item) {
          return (
            '<div class="search-item" data-path="' +
            item.path +
            '"><div class="search-item__left">' +
            Icons.list +
            '<span>' +
            item.title +
            '</span></div></div>'
          );
        })
        .join('');
      var self = this;
      box.querySelectorAll('.search-item').forEach(function (el) {
        el.addEventListener('click', function () {
          var path = el.getAttribute('data-path');
          if (!path) return;
          var base = getProjectBase();
          var clean = path.startsWith('/') ? path.substring(1) : path;
          window.location.href = base + clean;
        });
      });
    }

    renderTags() {
      var container = this.querySelector('#tags-container');
      if (!container) return;
      var self = this;
      container.innerHTML = this.tags
        .map(function (tag, index) {
          var isFirst = index === 0;
          var rightIcon = isFirst
            ? '<div class="tag-pin">' + Icons.pin + '</div>'
            : '<div class="tag-close" data-index="' + index + '">' + Icons.close + '</div>';
          return (
            '<div class="tag-item' +
            (tag.active ? ' active' : '') +
            '" data-index="' +
            index +
            '"><span>' +
            tag.title +
            '</span>' +
            rightIcon +
            '</div>'
          );
        })
        .join('');

      container.querySelectorAll('.tag-item').forEach(function (item) {
        item.addEventListener('click', function (e) {
          if (e.target.closest('.tag-close')) return;
          self.switchTag(parseInt(item.dataset.index, 10));
        });
      });
      container.querySelectorAll('.tag-close').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          self.closeTag(parseInt(btn.dataset.index, 10));
        });
      });
    }

    switchTag(index) {
      var tag = this.tags[index];
      if (!tag || !tag.path) return;
      var basePath = getProjectBase();
      var cleanPath = tag.path.startsWith('/') ? tag.path.substring(1) : tag.path;
      var currentPath = decodeURIComponent(window.location.pathname).replace(/\\/g, '/');
      if (currentPath.indexOf(tag.path) === -1) {
        window.location.href = basePath + cleanPath;
      } else {
        this.tags.forEach(function (t) {
          t.active = false;
        });
        tag.active = true;
        this.saveTags();
        this.renderTags();
      }
    }

    closeTag(index) {
      if (index === 0) return;
      var isCurrent = this.tags[index].active;
      this.tags.splice(index, 1);
      if (isCurrent) {
        var newIndex = Math.max(0, index - 1);
        this.tags[newIndex].active = true;
        this.saveTags();
        this.switchTag(newIndex);
      } else {
        this.saveTags();
        this.renderTags();
      }
    }

    reloadPage() {
      window.location.reload();
    }

    closeOthers() {
      var current = this.tags.find(function (t) {
        return t.active;
      });
      if (this.tags[0].active) this.tags = [this.tags[0]];
      else this.tags = [this.tags[0], current];
      this.saveTags();
      this.renderTags();
    }

    closeAll() {
      this.tags[0].active = true;
      this.tags = [this.tags[0]];
      this.saveTags();
      this.switchTag(0);
    }

    openWindow() {
      var current = this.tags.find(function (t) {
        return t.active;
      });
      if (current && current.path) {
        var basePath = getProjectBase();
        var cleanPath = current.path.startsWith('/') ? current.path.substring(1) : current.path;
        window.open(basePath + cleanPath, '_blank');
      }
    }

    bindEvents() {
      var self = this;
      var modal = this.querySelector('#search-modal');
      var userMenu = this.querySelector('#user-menu-box');
      var tagsDropdown = this.querySelector('#tags-dropdown');

      var openSearch = function () {
        if (modal) modal.classList.add('open');
        var input = self.querySelector('#search-input');
        if (input) {
          input.value = '';
          self.renderSearchResults('');
          input.focus();
        }
      };
      var closeSearch = function () {
        if (modal) modal.classList.remove('open');
      };

      var searchBtn = this.querySelector('#btn-search');
      if (searchBtn) searchBtn.addEventListener('click', openSearch);
      if (modal) {
        modal.addEventListener('click', function (e) {
          if (e.target === modal) closeSearch();
        });
      }
      var searchInput = this.querySelector('#search-input');
      if (searchInput) {
        searchInput.addEventListener('input', function () {
          self.renderSearchResults(searchInput.value);
        });
      }
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeSearch();
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
          e.preventDefault();
          openSearch();
        }
      });

      var fsBtn = this.querySelector('#btn-fullscreen');
      if (fsBtn) {
        fsBtn.addEventListener('click', function () {
          if (!document.fullscreenElement) document.documentElement.requestFullscreen();
          else if (document.exitFullscreen) document.exitFullscreen();
        });
      }

      var refreshBtn = this.querySelector('#refresh-btn');
      if (refreshBtn) refreshBtn.addEventListener('click', function () {
        self.reloadPage();
      });

      var userBtn = this.querySelector('#btn-user');
      if (userBtn) {
        userBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          if (userMenu) userMenu.classList.toggle('show');
          if (tagsDropdown) tagsDropdown.classList.remove('show');
        });
      }

      var logoutBtn = this.querySelector('#btn-logout-action');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', function () {
          if (userMenu) userMenu.classList.remove('show');
          var overlay = document.getElementById('v62-confirm-overlay');
          if (overlay) {
            overlay.classList.add('open');
            document.body.style.overflow = 'hidden';
          }
        });
      }

      var tagsMoreBtn = this.querySelector('#tags-more-btn');
      if (tagsMoreBtn) {
        tagsMoreBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          if (tagsDropdown) tagsDropdown.classList.toggle('show');
          if (userMenu) userMenu.classList.remove('show');
        });
      }

      function bindTagAction(id, fn) {
        var el = self.querySelector(id);
        if (el) el.addEventListener('click', fn);
      }
      bindTagAction('#tag-act-refresh', function () {
        self.reloadPage();
      });
      bindTagAction('#tag-act-close', function () {
        var idx = self.tags.findIndex(function (t) {
          return t.active;
        });
        if (idx > 0) self.closeTag(idx);
      });
      bindTagAction('#tag-act-other', function () {
        self.closeOthers();
      });
      bindTagAction('#tag-act-all', function () {
        self.closeAll();
      });
      bindTagAction('#tag-act-window', function () {
        self.openWindow();
      });

      document.addEventListener('click', function () {
        if (userMenu) userMenu.classList.remove('show');
        if (tagsDropdown) tagsDropdown.classList.remove('show');
      });

      document.addEventListener('app-menu-change', function (e) {
        var title = e.detail.title;
        var path = e.detail.path;
        var breadcrumb = self.querySelector('#breadcrumb-container');
        if (breadcrumb) {
          breadcrumb.innerHTML =
            '<span class="crumb-muted">首页</span>' +
            '<span class="crumb-sep">' +
            arrowIcon +
            '</span>' +
            '<span class="crumb-current">' +
            title +
            '</span>';
        }
        var exists = self.tags.find(function (t) {
          return t.title === title || (t.path && path && (path.indexOf(t.path) !== -1 || t.path.indexOf(path) !== -1));
        });
        self.tags.forEach(function (t) {
          t.active = false;
        });
        if (!exists) self.tags.push({ title: title, path: path, active: true });
        else {
          exists.active = true;
          exists.path = path;
        }
        self.saveTags();
        self.renderTags();
        if (window.TopLoader) TopLoader.start();
      });

      var toggleBtn = this.querySelector('#toggle-btn');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', function () {
          document.dispatchEvent(new CustomEvent('app-toggle-hide'));
        });
      }

      var logoutOverlayInHeader = this.querySelector('#v62-confirm-overlay');
      if (logoutOverlayInHeader && logoutOverlayInHeader.parentNode !== document.body) {
        document.body.appendChild(logoutOverlayInHeader);
      }
      var logoutOverlay = document.getElementById('v62-confirm-overlay');
      if (logoutOverlay) {
        var closeLogoutConfirm = function () {
          logoutOverlay.classList.remove('open');
          document.body.style.overflow = '';
        };
        logoutOverlay.addEventListener('click', function (e) {
          if (e.target === logoutOverlay) closeLogoutConfirm();
        });
        var closeX = logoutOverlay.querySelector('#v62-logout-close');
        var cancelBtn = logoutOverlay.querySelector('#v62-logout-cancel');
        var okBtn = logoutOverlay.querySelector('#v62-logout-ok');
        if (closeX) {
          closeX.addEventListener('click', function (e) {
            e.stopPropagation();
            closeLogoutConfirm();
          });
        }
        if (cancelBtn) {
          cancelBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            closeLogoutConfirm();
          });
        }
        if (okBtn) {
          okBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (window.AppStorage) window.AppStorage.remove('session');
            if (window.AppLog) window.AppLog.info('auth', '退出登录');
            window.location.href = getProjectBase() + 'web/login.html';
          });
        }
      }
    }
  }

  if (!customElements.get('vben-header')) {
    customElements.define('vben-header', VbenHeader);
  }
})();
