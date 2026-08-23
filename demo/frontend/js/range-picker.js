/**
 * 日期范围选择器（对齐 PFF supermarket #rp-v1-trigger）
 */
(function (global) {
  'use strict';

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function formatYmd(y, m, d) {
    return y + '-' + pad2(m) + '-' + pad2(d);
  }

  function parseYmd(str) {
    if (!str) return null;
    var parts = String(str).split('-');
    if (parts.length !== 3) return null;
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    var d = parseInt(parts[2], 10);
    if (!y || !m || !d) return null;
    return { y: y, m: m, d: d };
  }

  function daysInMonth(y, m) {
    return new Date(y, m, 0).getDate();
  }

  function compareDate(a, b) {
    if (a === b) return 0;
    return a < b ? -1 : 1;
  }

  function addMonths(y, m, delta) {
    var dt = new Date(y, m - 1 + delta, 1);
    return { y: dt.getFullYear(), m: dt.getMonth() + 1 };
  }

  function buildMonthCells(y, m) {
    var total = daysInMonth(y, m);
    var cells = [];
    for (var d = 1; d <= total; d++) {
      cells.push(formatYmd(y, m, d));
    }
    return cells;
  }

  function renderPanel(headerEl, gridEl, y, m) {
    if (!headerEl || !gridEl) return;
    headerEl.textContent = y + '年 ' + pad2(m) + '月';
    var dates = buildMonthCells(y, m);
    gridEl.innerHTML = dates
      .map(function (date) {
        return '<div class="rp-cell" data-date="' + date + '">' + parseInt(date.slice(-2), 10) + '</div>';
      })
      .join('');
  }

  function create(mountId, options) {
    options = options || {};
    var root = document.getElementById(mountId);
    if (!root) return null;

    root.classList.add('hsf-range-picker');
    root.innerHTML =
      '<div class="input-box" data-rp-trigger>' +
      '<span class="input-text" data-rp-display></span>' +
      '<div class="icon-group">' +
      '<svg class="clear-btn" data-rp-clear viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />' +
      '</svg>' +
      '<svg class="calendar-icon" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z" />' +
      '</svg>' +
      '</div></div>' +
      '<div class="rp-dropdown" data-rp-dropdown>' +
      '<div class="rp-panel">' +
      '<div class="rp-header" data-rp-header-left></div>' +
      '<div class="rp-grid" data-rp-grid-left></div>' +
      '</div>' +
      '<div class="rp-panel">' +
      '<div class="rp-header" data-rp-header-right></div>' +
      '<div class="rp-grid" data-rp-grid-right></div>' +
      '</div></div>';

    var trigger = root.querySelector('[data-rp-trigger]');
    var dropdown = root.querySelector('[data-rp-dropdown]');
    var display = root.querySelector('[data-rp-display]');
    var clearBtn = root.querySelector('[data-rp-clear]');
    var headerLeft = root.querySelector('[data-rp-header-left]');
    var headerRight = root.querySelector('[data-rp-header-right]');
    var gridLeft = root.querySelector('[data-rp-grid-left]');
    var gridRight = root.querySelector('[data-rp-grid-right]');

    var now = new Date();
    var view = addMonths(now.getFullYear(), now.getMonth() + 1, 0);
    var state = { start: options.defaultStart || null, end: options.defaultEnd || null, selecting: false };

    function syncPanels() {
      var anchor = parseYmd(state.start) || parseYmd(state.end) || { y: now.getFullYear(), m: now.getMonth() + 1 };
      view = { y: anchor.y, m: anchor.m };
      var right = addMonths(view.y, view.m, 1);
      renderPanel(headerLeft, gridLeft, view.y, view.m);
      renderPanel(headerRight, gridRight, right.y, right.m);
      updateUI();
    }

    function setDisplay() {
      if (state.start && state.end) {
        display.textContent = state.start + ' ⇀ ' + state.end;
        root.classList.add('has-val');
      } else if (state.start) {
        display.textContent = state.start + ' ⇀ ';
        root.classList.add('has-val');
      } else {
        display.textContent = '';
        root.classList.remove('has-val');
      }
    }

    function updateUI() {
      var cells = root.querySelectorAll('.rp-cell');
      cells.forEach(function (c) {
        var d = c.getAttribute('data-date');
        c.classList.remove(
          'selected-point',
          'in-range',
          'disabled',
          'selecting-range',
          'selecting-range-start',
          'selecting-range-end'
        );
        if (state.selecting && state.start && compareDate(d, state.start) < 0) {
          c.classList.add('disabled');
        }
        if (d === state.start || d === state.end) c.classList.add('selected-point');
        if (state.start && state.end && compareDate(d, state.start) > 0 && compareDate(d, state.end) < 0) {
          c.classList.add('in-range');
        }
      });
    }

    function closeDropdown() {
      dropdown.classList.remove('show');
      trigger.classList.remove('active');
    }

    function openDropdown() {
      syncPanels();
      dropdown.classList.add('show');
      trigger.classList.add('active');
    }

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      if (dropdown.classList.contains('show')) closeDropdown();
      else openDropdown();
    });

    clearBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      state = { start: null, end: null, selecting: false };
      setDisplay();
      updateUI();
      if (typeof options.onChange === 'function') options.onChange(getValue());
    });

    dropdown.addEventListener('click', function (e) {
      var cell = e.target.closest('.rp-cell');
      if (!cell || cell.classList.contains('disabled')) return;
      e.stopPropagation();
      var date = cell.getAttribute('data-date');
      if (!state.selecting) {
        state.start = date;
        state.end = null;
        state.selecting = true;
        root.classList.add('has-val');
      } else {
        if (compareDate(date, state.start) < 0) {
          state.end = state.start;
          state.start = date;
        } else {
          state.end = date;
        }
        state.selecting = false;
        setDisplay();
        closeDropdown();
        if (typeof options.onChange === 'function') options.onChange(getValue());
      }
      updateUI();
    });

    root.addEventListener('mouseover', function (e) {
      var cell = e.target.closest('.rp-cell');
      if (!cell || !state.selecting || !state.start) return;
      var curr = cell.getAttribute('data-date');
      if (compareDate(curr, state.start) < 0) return;
      root.querySelectorAll('.rp-cell').forEach(function (c) {
        var d = c.getAttribute('data-date');
        c.classList.remove('selecting-range', 'selecting-range-start', 'selecting-range-end');
        if (compareDate(d, state.start) >= 0 && compareDate(d, curr) <= 0) {
          c.classList.add('selecting-range');
          if (d === state.start) c.classList.add('selecting-range-start');
          if (d === curr) c.classList.add('selecting-range-end');
        }
      });
    });

    document.addEventListener('click', closeDropdown);

    function getValue() {
      return { start: state.start || '', end: state.end || '' };
    }

    function setValue(start, end) {
      state.start = start || null;
      state.end = end || null;
      state.selecting = false;
      setDisplay();
      updateUI();
    }

    if (state.start && state.end) setDisplay();
    else if (options.defaultStart && options.defaultEnd) setValue(options.defaultStart, options.defaultEnd);
    syncPanels();

    return {
      getValue: getValue,
      setValue: setValue,
      reset: function (start, end) {
        var d = start && end ? { start: start, end: end } : { start: options.defaultStart, end: options.defaultEnd };
        setValue(d.start, d.end);
      },
    };
  }

  global.HSFRangePicker = { create: create };
})(window);
