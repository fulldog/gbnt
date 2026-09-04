/**
 * 汇总管理页 · 筛选与表格壳（对齐专项整改 query-card）
 */
(function (global) {
  'use strict';

  function $(id) {
    return document.getElementById(id);
  }

  function defaultDateRange() {
    var now = new Date();
    var y = now.getFullYear();
    var m = String(now.getMonth() + 1).padStart(2, '0');
    var start = y + '-01-01';
    var end = y + '-' + m + '-' + String(now.getDate()).padStart(2, '0');
    return { start: start, end: end };
  }

  function streetOptions() {
    var list = global.HSFLedgerData ? global.HSFLedgerData.streets() : [];
    var opts = [{ value: '', label: '全部街道' }];
    list.forEach(function (s) {
      opts.push({ value: s.name, label: s.name });
    });
    return opts;
  }

  function initFilters(cfg) {
    cfg = cfg || {};
    var streetSelect = null;
    if (global.HSFAtomicSelect) {
      streetSelect = global.HSFAtomicSelect.create('ld-filter-street', {
        placeholder: '全部街道',
        searchPlaceholder: '搜索街道',
        defaultValue: cfg.defaultStreet || '蒋官屯街道',
        options: streetOptions(),
      });
    }
    var dr = defaultDateRange();
    var dateRangePicker = null;
    if (global.HSFRangePicker) {
      dateRangePicker = global.HSFRangePicker.create('ld-filter-date-range', {
        defaultStart: dr.start,
        defaultEnd: dr.end,
      });
    }

    function readFilters() {
      var street = streetSelect ? streetSelect.getValue() : '';
      var dates = dateRangePicker ? dateRangePicker.getValue() : { start: '', end: '' };
      return {
        street: street || cfg.defaultStreet || '蒋官屯街道',
        dateStart: dates.start || '',
        dateEnd: dates.end || '',
      };
    }

    function reset() {
      if (streetSelect) streetSelect.setValue(cfg.defaultStreet || '蒋官屯街道');
      var d = defaultDateRange();
      if (dateRangePicker) dateRangePicker.reset(d.start, d.end);
    }

    var btnSearch = $('ld-btn-search');
    var btnReset = $('ld-btn-reset');
    if (btnSearch) btnSearch.addEventListener('click', cfg.onSearch);
    if (btnReset) {
      btnReset.addEventListener('click', function () {
        reset();
        cfg.onSearch();
      });
    }

    var queryRoot = $('query-group-ld');
    var foldTrigger = $('ld-toggle-btn');
    if (foldTrigger && queryRoot) {
      var textSpan = foldTrigger.querySelector('.text');
      foldTrigger.addEventListener('click', function (e) {
        e.stopPropagation();
        var isCollapsed = queryRoot.classList.toggle('collapsed');
        if (textSpan) textSpan.textContent = isCollapsed ? '展开' : '收起';
        window.dispatchEvent(new Event('resize'));
      });
    }

    return { readFilters: readFilters, reset: reset };
  }

  function initTableChrome(cfg) {
    cfg = cfg || {};
    var root = $('combined-table-ld');
    var wrap = $('ld-scroll-wrap');
    var btnExport = $('ld-btn-export');
    var btnRefresh = $('ld-btn-refresh');
    var btnFs = $('ld-btn-fullscreen');
    var btnToggle = $('ld-btn-toggle-query');
    var queryRoot = $('query-group-ld');

    if (btnExport) btnExport.addEventListener('click', cfg.onExport);
    if (btnRefresh) btnRefresh.addEventListener('click', cfg.onRefresh);
    if (btnToggle && queryRoot) {
      btnToggle.addEventListener('click', function () {
        var isHidden = queryRoot.style.display === 'none';
        queryRoot.style.display = isHidden ? '' : 'none';
        window.dispatchEvent(new Event('resize'));
      });
    }
    if (btnFs) {
      btnFs.addEventListener('click', function (e) {
        e.stopPropagation();
        var container = document.querySelector('.ld-page.content-container') || $('pageContent');
        if (!container) return;
        var isFull = container.classList.toggle('vben-table-fullscreen');
        document.body.style.overflow = isFull ? 'hidden' : '';
        window.dispatchEvent(new Event('resize'));
      });
    }
    var scrollEl = wrap ? wrap.querySelector('.ld-table-scroll-inner') : null;
    var scrollTarget = scrollEl || wrap;
    if (scrollTarget && wrap) {
      function updateScrollState() {
        var sl = scrollTarget.scrollLeft;
        var max = scrollTarget.scrollWidth - scrollTarget.clientWidth;
        wrap.classList.toggle('is-scrolling-h', sl > 1);
        wrap.classList.toggle('is-scrolling-left', sl > 1);
        wrap.classList.toggle('is-scrolling-right', max > 1 && sl < max - 1);
      }
      scrollTarget.addEventListener('scroll', updateScrollState);
      window.addEventListener('resize', function () {
        updateScrollState();
        var table = document.getElementById('ld-main-table');
        if (table && table.classList.contains('ledger-sheet-table--survey')) {
          applyStickyColumns(table, 4);
        }
      });
      updateScrollState();
    }
  }

  function applyStickyColumns(table, count) {
    if (!table || !count) return;
    var cols = table.querySelectorAll('colgroup col');
    var tw = table.getBoundingClientRect().width;
    if (!tw) return;
    var left = 0;
    for (var j = 0; j < count; j++) {
      var pct = cols[j] ? parseFloat(cols[j].style.width) || 0 : 0;
      var offset = left;
      table.querySelectorAll('.ld-sticky-col-' + j).forEach(function (el) {
        el.style.left = offset + 'px';
      });
      left += (pct / 100) * tw;
    }
  }

  function afterTableRender(table, stickyCount) {
    if (!table) return;
    requestAnimationFrame(function () {
      applyStickyColumns(table, stickyCount);
      var wrap = $('ld-scroll-wrap');
      var scrollEl = wrap && wrap.querySelector('.ld-table-scroll-inner');
      if (wrap && scrollEl) {
        var sl = scrollEl.scrollLeft;
        var max = scrollEl.scrollWidth - scrollEl.clientWidth;
        wrap.classList.toggle('is-scrolling-h', sl > 1);
        wrap.classList.toggle('is-scrolling-left', sl > 1);
        wrap.classList.toggle('is-scrolling-right', max > 1 && sl < max - 1);
      }
    });
  }

  function renderColgroup(widths) {
    var html = '<colgroup>';
    (widths || []).forEach(function (w) {
      html += '<col style="width:' + w + '%" />';
    });
    html += '</colgroup>';
    return html;
  }

  var STREET_COL_WIDTHS = [3, 5, 6, 7, 6, 5, 5, 7, 6, 6, 5, 5, 5, 5, 12, 11];
  var SURVEY_COL_WIDTHS = [
    7, 7, 5, 5, 6, 5, 5, 6, 5, 5, 4, 4, 4, 4, 4, 4, 3, 3, 3, 3, 3, 5,
  ];

  global.HSFLedgerCommon = {
    initFilters: initFilters,
    initTableChrome: initTableChrome,
    renderColgroup: renderColgroup,
    applyStickyColumns: applyStickyColumns,
    afterTableRender: afterTableRender,
    STREET_COL_WIDTHS: STREET_COL_WIDTHS,
    SURVEY_COL_WIDTHS: SURVEY_COL_WIDTHS,
  };
})(window);
