/**
 * 单日日期选择器（管理端日历下拉，对齐 range-picker 视觉）
 */
(function (global) {
  'use strict';

  var WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

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

  function addMonths(y, m, delta) {
    var dt = new Date(y, m - 1 + delta, 1);
    return { y: dt.getFullYear(), m: dt.getMonth() + 1 };
  }

  function defaultDisplay(ymd) {
    var p = parseYmd(ymd);
    if (!p) return '';
    return p.y + '年' + pad2(p.m) + '月' + pad2(p.d) + '日';
  }

  function create(mountId, options) {
    options = options || {};
    var root = typeof mountId === 'string' ? document.getElementById(mountId) : mountId;
    if (!root) return null;

    root.classList.add('hsf-date-picker');
    root.innerHTML =
      '<div class="input-box" data-dp-trigger>' +
      '<span class="input-text" data-dp-display></span>' +
      '<div class="icon-group">' +
      '<svg class="clear-btn" data-dp-clear viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />' +
      '</svg>' +
      '<svg class="calendar-icon" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z" />' +
      '</svg>' +
      '</div></div>';

    var trigger = root.querySelector('[data-dp-trigger]');
    var display = root.querySelector('[data-dp-display]');
    var clearBtn = root.querySelector('[data-dp-clear]');

    var dropdown = document.createElement('div');
    dropdown.className = 'hsf-date-picker__dropdown';
    dropdown.setAttribute('data-dp-dropdown', '');
    dropdown.innerHTML =
      '<div class="dp-panel">' +
      '<div class="dp-header">' +
      '<button type="button" class="dp-nav" data-dp-prev aria-label="上一月">‹</button>' +
      '<div class="dp-title" data-dp-title></div>' +
      '<button type="button" class="dp-nav" data-dp-next aria-label="下一月">›</button>' +
      '</div>' +
      '<div class="dp-weekdays">' +
      WEEKDAYS.map(function (w) {
        return '<span>' + w + '</span>';
      }).join('') +
      '</div>' +
      '<div class="dp-grid" data-dp-grid></div>' +
      '</div>';

    var titleEl = dropdown.querySelector('[data-dp-title]');
    var gridEl = dropdown.querySelector('[data-dp-grid]');
    var now = new Date();
    var view = { y: now.getFullYear(), m: now.getMonth() + 1 };
    var value = options.value || options.defaultValue || '';
    var open = false;
    var formatDisplay =
      typeof options.formatDisplay === 'function' ? options.formatDisplay : defaultDisplay;

    function syncDisplay() {
      if (value) {
        display.textContent = formatDisplay(value);
        root.classList.add('has-val');
      } else {
        display.textContent = '';
        root.classList.remove('has-val');
      }
    }

    function renderGrid() {
      titleEl.textContent = view.y + '年 ' + pad2(view.m) + '月';
      var firstDow = new Date(view.y, view.m - 1, 1).getDay();
      var total = daysInMonth(view.y, view.m);
      var html = '';
      var i;
      for (i = 0; i < firstDow; i++) {
        html += '<div class="dp-cell is-empty"></div>';
      }
      for (i = 1; i <= total; i++) {
        var date = formatYmd(view.y, view.m, i);
        var cls = 'dp-cell';
        if (date === value) cls += ' is-selected';
        var today = formatYmd(now.getFullYear(), now.getMonth() + 1, now.getDate());
        if (date === today) cls += ' is-today';
        html +=
          '<button type="button" class="' +
          cls +
          '" data-date="' +
          date +
          '">' +
          i +
          '</button>';
      }
      gridEl.innerHTML = html;
    }

    function placeDropdown() {
      var rect = trigger.getBoundingClientRect();
      var width = 280;
      var gap = 6;
      var margin = 8;
      var left = rect.left;
      if (left + width > window.innerWidth - margin) {
        left = Math.max(margin, rect.right - width);
      }

      dropdown.style.position = 'fixed';
      dropdown.style.left = left + 'px';
      dropdown.style.width = width + 'px';
      dropdown.style.zIndex = '100060';
      dropdown.style.bottom = 'auto';

      var panelHeight = dropdown.offsetHeight || 320;
      var spaceBelow = window.innerHeight - rect.bottom - gap;
      var spaceAbove = rect.top - gap;
      var top;

      if (panelHeight <= spaceBelow) {
        top = rect.bottom + gap;
        dropdown.classList.remove('is-drop-up');
      } else if (panelHeight <= spaceAbove) {
        top = rect.top - gap - panelHeight;
        dropdown.classList.add('is-drop-up');
      } else if (spaceAbove >= spaceBelow) {
        top = Math.max(margin, rect.top - gap - panelHeight);
        dropdown.classList.add('is-drop-up');
      } else {
        top = rect.bottom + gap;
        dropdown.classList.remove('is-drop-up');
      }

      var maxTop = window.innerHeight - panelHeight - margin;
      if (top > maxTop) top = maxTop;
      if (top < margin) top = margin;
      dropdown.style.top = top + 'px';
    }

    function openDropdown() {
      var anchor = parseYmd(value);
      if (anchor) view = { y: anchor.y, m: anchor.m };
      else view = { y: now.getFullYear(), m: now.getMonth() + 1 };
      renderGrid();
      if (!dropdown.parentNode) document.body.appendChild(dropdown);
      dropdown.classList.add('show');
      trigger.classList.add('active');
      open = true;
      placeDropdown();
    }

    function closeDropdown() {
      dropdown.classList.remove('show', 'is-drop-up');
      trigger.classList.remove('active');
      open = false;
      if (dropdown.parentNode) dropdown.parentNode.removeChild(dropdown);
    }

    function setValue(next, silent) {
      value = next || '';
      syncDisplay();
      if (!silent && typeof options.onChange === 'function') {
        options.onChange(value);
      }
    }

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      if (open) closeDropdown();
      else openDropdown();
    });

    clearBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      setValue('');
      closeDropdown();
    });

    dropdown.addEventListener('click', function (e) {
      e.stopPropagation();
      if (e.target.closest('[data-dp-prev]')) {
        view = addMonths(view.y, view.m, -1);
        renderGrid();
        return;
      }
      if (e.target.closest('[data-dp-next]')) {
        view = addMonths(view.y, view.m, 1);
        renderGrid();
        return;
      }
      var cell = e.target.closest('.dp-cell[data-date]');
      if (!cell) return;
      setValue(cell.getAttribute('data-date'));
      closeDropdown();
    });

    function onDocClick() {
      if (open) closeDropdown();
    }

    function onScrollOrResize() {
      if (open) placeDropdown();
    }

    document.addEventListener('click', onDocClick);
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);

    syncDisplay();

    return {
      getValue: function () {
        return value;
      },
      setValue: function (v) {
        setValue(v || '', true);
      },
      reset: function () {
        setValue(options.defaultValue || '', true);
      },
      destroy: function () {
        closeDropdown();
        document.removeEventListener('click', onDocClick);
        window.removeEventListener('resize', onScrollOrResize);
        window.removeEventListener('scroll', onScrollOrResize, true);
        root.innerHTML = '';
      },
    };
  }

  global.HSFDatePicker = { create: create };
})(window);
