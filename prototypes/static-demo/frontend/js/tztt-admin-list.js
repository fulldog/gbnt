/**
 * TZTT 后台列表页通用工具（localStorage 原型）
 * 各业务页内联脚本依赖 window.TzttAdmin
 */
(function (g) {
  var T = {};
  T.escapeHtml = function (s) {
    if (s == null || s === '') return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };
  T.val = function (id) {
    var el = document.getElementById(id);
    return el ? String(el.value != null ? el.value : '').trim() : '';
  };
  T.setVal = function (id, v) {
    var el = document.getElementById(id);
    if (el) el.value = v != null ? String(v) : '';
  };
  T.toast = function (msg) {
    if (typeof Toast !== 'undefined' && Toast.show) Toast.show(msg);
    else alert(msg);
  };
  T.readArr = function (key) {
    try {
      var d = localStorage.getItem(key);
      if (!d) return null;
      var a = JSON.parse(d);
      return Array.isArray(a) ? a : null;
    } catch (e) {
      return null;
    }
  };
  T.writeArr = function (key, arr) {
    try {
      localStorage.setItem(key, JSON.stringify(arr));
    } catch (e) {}
  };
  T.ensureSeed = function (key, seedArr) {
    var a = T.readArr(key);
    if (a == null) {
      a = JSON.parse(JSON.stringify(seedArr));
      T.writeArr(key, a);
    }
    return a;
  };
  T.nextId = function (arr) {
    if (!arr.length) return 1;
    var m = 0;
    for (var i = 0; i < arr.length; i++) {
      var id = arr[i].id;
      if (typeof id === 'number' && !isNaN(id) && id > m) m = id;
    }
    return m + 1;
  };
  T.fmtShort = function (s) {
    if (s == null || s === '') return '—';
    return String(s).replace('T', ' ').slice(0, 16);
  };
  T.wrapRefresh = function (fn) {
    if (typeof TableLoading !== 'undefined' && TableLoading.wrap) {
      return function () {
        return TableLoading.wrap(fn);
      };
    }
    return fn;
  };
  T.colLabels = function (cols) {
    if (!cols || !cols.length) return [];
    return cols.map(function (c) {
      return typeof c === 'string' ? c : String(c.label != null ? c.label : '');
    });
  };
  T.syncRowColClasses = function (tableId) {
    if (typeof syncRowColClasses === 'function') syncRowColClasses(tableId);
  };
  T.renderTableHead = function (tableId, cols) {
    if (typeof renderTableHead !== 'function') return;
    renderTableHead(tableId, cols);
  };
  T.renderPagination = function (total, page, pageSize, fnName) {
    if (typeof renderPagination !== 'function') return;
    renderPagination('section-pagination', total, page, pageSize, fnName);
  };

  /** 固定左右列 class（与 CRM markFixedColumns 一致） */
  T.markFixedColumns = function (tableId, opts) {
    opts = opts || {};
    var r = document.querySelector('#' + tableId + '-head tr');
    if (!r || !r.children.length) return;
    if (opts.left !== false && r.children[0]) r.children[0].classList.add('col-fixed-left');
    if (opts.right !== false) r.children[r.children.length - 1].classList.add('col-fixed-right');
    var box = document.querySelector('#' + tableId);
    if (box) {
      var container = box.closest('.fixed-table-container');
      if (container) container.dispatchEvent(new Event('scroll'));
    }
  };

  var QG_TOGGLE_SVG =
    '<svg viewBox="0 0 24 24"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" fill="currentColor"/></svg>';

  /** 渲染单个筛选项控件 HTML */
  T.renderQueryFieldControl = function (field) {
    var f = field || {};
    if (f.html != null) return String(f.html);
    var id = T.escapeHtml(f.id || '');
    var ph = T.escapeHtml(f.placeholder || '请输入');
    if (f.type === 'select') {
      var opts = f.options || [];
      var buf = ['<select class="vben-select" id="', id, '">'];
      opts.forEach(function (o) {
        if (typeof o === 'string') {
          var val = o === '全部' ? '' : o;
          buf.push('<option value="', T.escapeHtml(val), '">', T.escapeHtml(o), '</option>');
        } else {
          buf.push(
            '<option value="',
            T.escapeHtml(o.value != null ? o.value : ''),
            '"',
            o.selected ? ' selected' : '',
            '>',
            T.escapeHtml(o.label != null ? o.label : o.value),
            '</option>'
          );
        }
      });
      buf.push('</select>');
      return buf.join('');
    }
    if (f.type === 'datetime-local') {
      return (
        '<input class="vben-input" id="' +
        id +
        '" type="datetime-local" step="' +
        T.escapeHtml(f.step != null ? f.step : '60') +
        '" />'
      );
    }
    return '<input class="vben-input" id="' + id + '" type="text" placeholder="' + ph + '" />';
  };

  /**
   * 生成 query-card HTML（默认收起时只显示前 visibleCount 项 + 操作按钮）
   * cfg: { id, visibleCount?, fields[], resetId?, searchId?, toggleId? }
   * field: { label, id?, type?, options?, placeholder?, span?, fold?, html? }
   */
  T.buildQueryCardHtml = function (cfg) {
    cfg = cfg || {};
    var cardId = cfg.id || 'query-group-' + Date.now();
    var visibleCount = cfg.visibleCount != null ? cfg.visibleCount : 2;
    var fields = cfg.fields || [];
    var resetId = cfg.resetId || 'qg-reset';
    var searchId = cfg.searchId || 'qg-search';
    var toggleId = cfg.toggleId || 'qg-toggle';
    var hasFold = false;
    var items = fields.map(function (f, i) {
      var fold = f.fold != null ? !!f.fold : i >= visibleCount;
      if (fold) hasFold = true;
      var cls = 'qg-item' + (fold ? ' is-fold' : '');
      if (f.span) cls += ' qg-span-' + f.span;
      return (
        '<div class="' +
        cls +
        '"><span class="qg-label">' +
        T.escapeHtml(f.label || '') +
        '</span><div class="qg-wrap">' +
        T.renderQueryFieldControl(f) +
        '</div></div>'
      );
    });
    var actions =
      '<div class="qg-item qg-actions">' +
      '<button type="button" class="qg-ghost" id="' +
      T.escapeHtml(resetId) +
      '">重置</button>' +
      '<button type="button" class="qg-primary" id="' +
      T.escapeHtml(searchId) +
      '">查询</button>' +
      (hasFold
        ? '<span class="qg-toggle" id="' +
          T.escapeHtml(toggleId) +
          '">' +
          QG_TOGGLE_SVG +
          '<span>展开</span></span>'
        : '') +
      '</div>';
    return (
      '<div class="query-card collapsed' +
      (hasFold ? '' : ' query-card--no-fold') +
      '" id="' +
      T.escapeHtml(cardId) +
      '"><div class="qg-grid">' +
      items.join('') +
      actions +
      '</div></div>'
    );
  };

  /** 绑定展开/收起；可选 onSearch / onReset */
  T.bindQueryCard = function (scope, cfg) {
    cfg = cfg || {};
    var root = typeof scope === 'string' ? document.getElementById(scope) : scope;
    if (!root) return;
    var cardId = cfg.cardId || cfg.id;
    var card = cardId ? document.getElementById(cardId) : root.querySelector('.query-card');
    if (!card) return;

    var toggle = cfg.toggleId
      ? root.querySelector('#' + cfg.toggleId) || document.getElementById(cfg.toggleId)
      : card.querySelector('.qg-toggle');
    if (toggle) {
      toggle.addEventListener('click', function () {
        card.classList.toggle('collapsed');
        var span = toggle.querySelector('span');
        if (span) span.textContent = card.classList.contains('collapsed') ? '展开' : '收起';
      });
    }

    var searchBtn = cfg.searchId
      ? root.querySelector('#' + cfg.searchId) || document.getElementById(cfg.searchId)
      : null;
    if (searchBtn && cfg.onSearch) {
      searchBtn.addEventListener('click', function (e) {
        e.preventDefault();
        cfg.onSearch();
      });
    }

    var resetBtn = cfg.resetId
      ? root.querySelector('#' + cfg.resetId) || document.getElementById(cfg.resetId)
      : null;
    if (resetBtn && cfg.onReset) {
      resetBtn.addEventListener('click', function (e) {
        e.preventDefault();
        cfg.onReset();
      });
    }
  };

  /** 表格工具栏：筛选显隐 / 刷新 / 全屏 */
  T.bindTableToolbar = function (scope, cfg) {
    cfg = cfg || {};
    var root = typeof scope === 'string' ? document.getElementById(scope) : scope;
    if (!root) return;
    var cardId = cfg.queryCardId || cfg.cardId;

    var toggleFilter = cfg.toggleFilterId ? root.querySelector('#' + cfg.toggleFilterId) : null;
    if (toggleFilter) {
      toggleFilter.addEventListener('click', function () {
        var q = cardId ? document.getElementById(cardId) : root.querySelector('.query-card');
        if (q) q.style.display = q.style.display === 'none' ? '' : 'none';
      });
    }

    var refreshBtn = cfg.refreshId ? root.querySelector('#' + cfg.refreshId) : null;
    if (refreshBtn && cfg.onRefresh) {
      refreshBtn.addEventListener('click', function () {
        var run = cfg.wrapRefresh === false ? cfg.onRefresh : T.wrapRefresh(cfg.onRefresh);
        run();
      });
    }

    var fsBtn = cfg.fullscreenId ? root.querySelector('#' + cfg.fullscreenId) : null;
    if (fsBtn) {
      fsBtn.addEventListener('click', function () {
        document.body.classList.toggle('tbl-fullscreen');
      });
    }
  };

  g.TzttAdmin = T;
})(typeof window !== 'undefined' ? window : this);

