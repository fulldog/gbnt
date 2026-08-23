/**
 * 导航：按当前页高亮；栈 B 无 ?api=
 */
(function (global) {
  function currentPage() {
    var path = (global.location.pathname || '').split('/').pop() || 'portal.html';
    return path.toLowerCase();
  }

  function rewriteNavLinks() {
    document.querySelectorAll('a[data-page]').forEach(function (a) {
      var page = a.getAttribute('data-page');
      if (page) a.setAttribute('href', './' + page);
    });
  }

  function markActiveNav() {
    var page = currentPage();
    document.querySelectorAll('a[data-page]').forEach(function (a) {
      var target = (a.getAttribute('data-page') || '').toLowerCase();
      a.classList.toggle('is-active', target === page);
    });
    document.querySelectorAll('.app-sidebar__group').forEach(function (g) {
      var hasActive = !!g.querySelector('a[data-page].is-active');
      if (hasActive) g.classList.add('is-open');
    });
  }

  function setBreadcrumb(rootText, currentText) {
    var rootEl = document.querySelector('[data-breadcrumb-root]');
    var curEl = document.getElementById('appBreadcrumbCurrent');
    if (rootEl && rootText) rootEl.textContent = rootText;
    if (curEl && currentText) curEl.textContent = currentText;
    if (currentText) {
      document.dispatchEvent(
        new CustomEvent('app-menu-change', {
          detail: { title: currentText, path: global.location.pathname },
        })
      );
    }
  }

  function requireSession(loginHref) {
    var session = global.AppStorage && global.AppStorage.get('session', null);
    if (!session || !session.username) {
      global.location.href = loginHref || './login.html';
      return null;
    }
    return session;
  }

  global.AppNav = {
    currentPage: currentPage,
    rewriteNavLinks: rewriteNavLinks,
    markActiveNav: markActiveNav,
    setBreadcrumb: setBreadcrumb,
    requireSession: requireSession,
  };
})(window);
