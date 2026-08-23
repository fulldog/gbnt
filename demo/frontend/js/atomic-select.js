/**
 * 智能单选/多选下拉 — 对齐 PFF supermarket 057 所属部门 / 058 多选项目
 */
(function (global) {
  'use strict';

  var singleInstances = {};
  var multiInstances = {};

  function closeAllExcept(kind, rootId) {
    var map = kind === 'multi' ? multiInstances : singleInstances;
    Object.keys(map).forEach(function (id) {
      if (id !== rootId && map[id]) map[id].closeDropdown();
    });
  }

  function bindGlobalClose() {
    if (global.__hsfAtomicSelectBound) return;
    global.__hsfAtomicSelectBound = true;
    document.addEventListener('click', function () {
      Object.keys(singleInstances).forEach(function (id) {
        if (singleInstances[id]) singleInstances[id].closeDropdown();
      });
      Object.keys(multiInstances).forEach(function (id) {
        if (multiInstances[id]) multiInstances[id].closeDropdown();
      });
    });
    window.addEventListener('resize', function () {
      Object.keys(singleInstances).forEach(function (id) {
        var inst = singleInstances[id];
        if (inst && inst.dropdown && inst.dropdown.classList.contains('show') && inst.positionDropdown) {
          inst.positionDropdown();
        }
      });
      Object.keys(multiInstances).forEach(function (id) {
        var inst = multiInstances[id];
        if (inst && inst.dropdown && inst.dropdown.classList.contains('show') && inst.positionDropdown) {
          inst.positionDropdown();
        }
      });
    });
  }

  function positionDropdown(trigger, dropdown, useFixed) {
    dropdown.classList.remove('pop-up', 'is-fixed');
    dropdown.style.top = '';
    dropdown.style.left = '';
    dropdown.style.width = '';
    dropdown.style.bottom = '';
    if (!useFixed) {
      var rect = dropdown.getBoundingClientRect();
      dropdown.classList.toggle('pop-up', rect.bottom > window.innerHeight);
      return;
    }
    var tRect = trigger.getBoundingClientRect();
    dropdown.classList.add('is-fixed');
    dropdown.style.left = tRect.left + 'px';
    dropdown.style.width = tRect.width + 'px';
    var spaceBelow = window.innerHeight - tRect.bottom - 8;
    if (spaceBelow >= 120) {
      dropdown.style.top = tRect.bottom + 4 + 'px';
    } else {
      dropdown.style.top = Math.max(8, tRect.top - dropdown.offsetHeight - 4) + 'px';
    }
  }

  function createSingle(rootId, opts) {
    opts = opts || {};
    bindGlobalClose();
    var root = document.getElementById(rootId);
    if (!root) return null;

    var placeholder = opts.placeholder || '请选择';
    var searchPh = opts.searchPlaceholder || '输入关键词搜索...';
    var useFixed = opts.fixedDropdown !== false;
    var options = opts.options || [];

    root.classList.add('atomic-select-box');
    root.style.setProperty('--as-placeholder', '"' + placeholder + '"');
    root.innerHTML =
      '<div class="select-trigger" id="' +
      rootId +
      '-trigger">' +
      '<span class="select-text" id="' +
      rootId +
      '-display"></span>' +
      '<div class="icon-area">' +
      '<svg class="clear-btn" id="' +
      rootId +
      '-clear" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>' +
      '</svg>' +
      '<svg class="arrow-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5H7z"/></svg>' +
      '</div></div>' +
      '<div class="select-dropdown" id="' +
      rootId +
      '-dropdown">' +
      '<div class="search-bar">' +
      '<input type="text" class="search-input" id="' +
      rootId +
      '-search" placeholder="' +
      searchPh +
      '" autocomplete="off" />' +
      '</div>' +
      '<div class="option-list" id="' +
      rootId +
      '-list"></div></div>';

    var trigger = document.getElementById(rootId + '-trigger');
    var dropdown = document.getElementById(rootId + '-dropdown');
    var display = document.getElementById(rootId + '-display');
    var searchInput = document.getElementById(rootId + '-search');
    var listContainer = document.getElementById(rootId + '-list');
    var clearBtn = document.getElementById(rootId + '-clear');

    var selectedValue = opts.defaultValue !== undefined ? opts.defaultValue : null;
    var searchKey = '';

    function getOptions() {
      return typeof opts.getOptions === 'function' ? opts.getOptions() : options;
    }

    function renderOptions() {
      var list = getOptions().filter(function (item) {
        return !searchKey || String(item.label || '').toLowerCase().indexOf(searchKey.toLowerCase()) !== -1;
      });
      if (!list.length) {
        listContainer.innerHTML = '<div class="no-data">暂无匹配数据</div>';
        return;
      }
      listContainer.innerHTML = list
        .map(function (item) {
          var sel = selectedValue === item.value;
          return (
            '<div class="option-item' +
            (sel ? ' selected' : '') +
            '" data-val="' +
            String(item.value).replace(/"/g, '&quot;') +
            '">' +
            item.label +
            '</div>'
          );
        })
        .join('');
    }

    function syncDisplay() {
      var list = getOptions();
      var node = null;
      for (var i = 0; i < list.length; i++) {
        if (list[i].value === selectedValue) {
          node = list[i];
          break;
        }
      }
      if (node) {
        display.textContent = node.label;
        root.classList.toggle('has-val', String(node.value) !== '');
      } else {
        display.textContent = '';
        root.classList.remove('has-val');
      }
    }

    function closeDropdown() {
      dropdown.classList.remove('show');
      trigger.classList.remove('active');
      dropdown.classList.remove('is-fixed', 'pop-up');
      dropdown.style.top = '';
      dropdown.style.left = '';
      dropdown.style.width = '';
    }

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      closeAllExcept('single', rootId);
      var isShow = dropdown.classList.toggle('show');
      trigger.classList.toggle('active', isShow);
      if (isShow) {
        searchKey = '';
        searchInput.value = '';
        renderOptions();
        listContainer.scrollTop = 0;
        requestAnimationFrame(function () {
          positionDropdown(trigger, dropdown, useFixed);
        });
        searchInput.focus();
      } else {
        closeDropdown();
      }
    });

    listContainer.addEventListener('click', function (e) {
      var item = e.target.closest('.option-item');
      if (!item) return;
      e.stopPropagation();
      var raw = item.getAttribute('data-val');
      var list = getOptions();
      var matched = null;
      for (var i = 0; i < list.length; i++) {
        if (String(list[i].value) === raw) {
          matched = list[i];
          break;
        }
      }
      selectedValue = matched ? matched.value : raw;
      syncDisplay();
      closeDropdown();
      if (typeof opts.onChange === 'function') opts.onChange(selectedValue, matched);
    });

    searchInput.addEventListener('input', function () {
      searchKey = searchInput.value.trim();
      renderOptions();
    });
    searchInput.addEventListener('click', function (e) {
      e.stopPropagation();
    });

    clearBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      selectedValue = opts.allowEmpty === false ? selectedValue : opts.emptyValue !== undefined ? opts.emptyValue : null;
      syncDisplay();
      closeDropdown();
      if (typeof opts.onChange === 'function') opts.onChange(selectedValue, null);
    });

    dropdown.addEventListener('click', function (e) {
      e.stopPropagation();
    });

    syncDisplay();
    renderOptions();

    var api = {
      dropdown: dropdown,
      closeDropdown: closeDropdown,
      positionDropdown: function () {
        positionDropdown(trigger, dropdown, useFixed);
      },
      getValue: function () {
        return selectedValue;
      },
      setValue: function (val) {
        selectedValue = val;
        syncDisplay();
      },
      reset: function () {
        selectedValue = opts.defaultValue !== undefined ? opts.defaultValue : null;
        syncDisplay();
      },
    };
    singleInstances[rootId] = api;
    return api;
  }

  function createMulti(rootId, opts) {
    opts = opts || {};
    bindGlobalClose();
    var root = document.getElementById(rootId);
    if (!root) return null;

    var placeholder = opts.placeholder || '请选择';
    var searchPh = opts.searchPlaceholder || '输入关键词搜索...';
    var useFixed = opts.fixedDropdown !== false;
    var maxTagDisplay = opts.maxTagDisplay !== undefined ? opts.maxTagDisplay : 1;
    var options = opts.options || [];

    root.classList.add('atomic-select-box', 'multi');
    root.innerHTML =
      '<div class="select-trigger" id="' +
      rootId +
      '-trigger">' +
      '<div class="tag-container" id="' +
      rootId +
      '-tags"><span class="placeholder-text">' +
      placeholder +
      '</span></div>' +
      '<svg class="arrow-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5H7z"/></svg>' +
      '</div>' +
      '<div class="select-dropdown" id="' +
      rootId +
      '-dropdown">' +
      '<div class="search-bar">' +
      '<input type="text" class="search-input" id="' +
      rootId +
      '-search" placeholder="' +
      searchPh +
      '" autocomplete="off" />' +
      '</div>' +
      '<div class="option-list" id="' +
      rootId +
      '-list"></div>' +
      '<div class="tp-footer">' +
      '<button type="button" class="btn-clear" id="' +
      rootId +
      '-clear">清除</button>' +
      '<button type="button" class="btn-ok" id="' +
      rootId +
      '-ok">确定</button>' +
      '</div></div>';

    var trigger = document.getElementById(rootId + '-trigger');
    var dropdown = document.getElementById(rootId + '-dropdown');
    var tagsContainer = document.getElementById(rootId + '-tags');
    var searchInput = document.getElementById(rootId + '-search');
    var listContainer = document.getElementById(rootId + '-list');
    var clearBtn = document.getElementById(rootId + '-clear');
    var okBtn = document.getElementById(rootId + '-ok');

    var selectedValues = (opts.defaultValues || []).slice();
    var searchKey = '';

    function getOptions() {
      return typeof opts.getOptions === 'function' ? opts.getOptions() : options;
    }

    function renderOptions() {
      var list = getOptions().filter(function (item) {
        return !searchKey || String(item.label || '').indexOf(searchKey) !== -1;
      });
      if (!list.length) {
        listContainer.innerHTML = '<div class="no-data">无匹配结果</div>';
        return;
      }
      listContainer.innerHTML = list
        .map(function (item) {
          var sel = selectedValues.indexOf(item.value) !== -1;
          return (
            '<div class="option-item' +
            (sel ? ' selected' : '') +
            '" data-val="' +
            String(item.value).replace(/"/g, '&quot;') +
            '">' +
            '<div class="checkbox"></div><span>' +
            item.label +
            '</span></div>'
          );
        })
        .join('');
    }

    function updateDisplay() {
      if (!selectedValues.length) {
        tagsContainer.innerHTML = '<span class="placeholder-text">' + placeholder + '</span>';
        root.classList.remove('has-val');
        return;
      }
      root.classList.add('has-val');
      var list = getOptions();
      var selectedObjs = list.filter(function (d) {
        return selectedValues.indexOf(d.value) !== -1;
      });
      var html = selectedObjs
        .slice(0, maxTagDisplay)
        .map(function (d) {
          return '<span class="tag-item-mini">' + d.label + '</span>';
        })
        .join('');
      if (selectedObjs.length > maxTagDisplay) {
        html += '<span class="tag-more">+' + (selectedObjs.length - maxTagDisplay) + '...</span>';
      }
      tagsContainer.innerHTML = html;
    }

    function closeDropdown() {
      dropdown.classList.remove('show');
      trigger.classList.remove('active');
      dropdown.classList.remove('is-fixed', 'pop-up');
      dropdown.style.top = '';
      dropdown.style.left = '';
      dropdown.style.width = '';
    }

    function commitChange() {
      if (typeof opts.onChange === 'function') {
        opts.onChange(selectedValues.slice(), getOptions().filter(function (d) {
          return selectedValues.indexOf(d.value) !== -1;
        }));
      }
    }

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      closeAllExcept('multi', rootId);
      var isShow = dropdown.classList.toggle('show');
      trigger.classList.toggle('active', isShow);
      if (isShow) {
        searchKey = '';
        searchInput.value = '';
        renderOptions();
        listContainer.scrollTop = 0;
        requestAnimationFrame(function () {
          positionDropdown(trigger, dropdown, useFixed);
        });
        searchInput.focus();
      } else {
        closeDropdown();
      }
    });

    listContainer.addEventListener('click', function (e) {
      var item = e.target.closest('.option-item');
      if (!item) return;
      e.stopPropagation();
      var raw = item.getAttribute('data-val');
      var list = getOptions();
      var val = raw;
      for (var i = 0; i < list.length; i++) {
        if (String(list[i].value) === raw) {
          val = list[i].value;
          break;
        }
      }
      var idx = selectedValues.indexOf(val);
      if (idx > -1) selectedValues.splice(idx, 1);
      else selectedValues.push(val);
      renderOptions();
      updateDisplay();
    });

    searchInput.addEventListener('input', function () {
      searchKey = searchInput.value.trim();
      renderOptions();
    });
    searchInput.addEventListener('click', function (e) {
      e.stopPropagation();
    });

    clearBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      selectedValues = [];
      renderOptions();
      updateDisplay();
    });

    okBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      closeDropdown();
      commitChange();
    });

    dropdown.addEventListener('click', function (e) {
      e.stopPropagation();
    });

    updateDisplay();
    renderOptions();

    var api = {
      dropdown: dropdown,
      closeDropdown: closeDropdown,
      positionDropdown: function () {
        positionDropdown(trigger, dropdown, useFixed);
      },
      getValues: function () {
        return selectedValues.slice();
      },
      setValues: function (vals) {
        selectedValues = (vals || []).slice();
        updateDisplay();
        renderOptions();
      },
      reset: function () {
        selectedValues = (opts.defaultValues || []).slice();
        updateDisplay();
        renderOptions();
      },
    };
    multiInstances[rootId] = api;
    return api;
  }

  global.HSFAtomicSelect = {
    create: createSingle,
    createMulti: createMulti,
  };
})(window);
