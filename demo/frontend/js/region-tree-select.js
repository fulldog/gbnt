/**
 * 行政区划树形下拉（对齐物资智管 AssetsTreeSelect / su-f-unit-trigger）
 */
(function (global) {
  'use strict';

  var instances = {};

  function flattenTree(data, out) {
    out = out || [];
    (data || []).forEach(function (item) {
      out.push(item);
      if (item.children && item.children.length) flattenTree(item.children, out);
    });
    return out;
  }

  function buildRegionTree() {
    var orgs = (global.AppStorage && global.AppStorage.get('orgs', [])) || [];
    var tree = [
      {
        id: 'all',
        label: '全部',
        level: 1,
        street: '',
        village: '',
        children: [],
      },
    ];
    orgs.forEach(function (street) {
      if (street.type !== 'street') return;
      var node = {
        id: 'street:' + street.name,
        label: street.name,
        level: 1,
        street: street.name,
        village: '',
        children: [],
      };
      orgs.forEach(function (child) {
        if (
          child.parentId === street.id &&
          (child.type === 'village' || child.type === 'community')
        ) {
          node.children.push({
            id: 'village:' + street.name + ':' + child.name,
            label: child.name,
            level: 2,
            street: street.name,
            village: child.name,
            children: [],
          });
        }
      });
      tree.push(node);
    });
    return tree;
  }

  function create(rootId, opts) {
    opts = opts || {};
    var root = document.getElementById(rootId);
    if (!root) return null;

    var placeholder = opts.placeholder || '请选择行政区划';
    var searchPh = opts.searchPlaceholder || '搜索街道或村/社区';

    root.classList.add('atomic-tree-select', 'hsf-tree-select');
    root.innerHTML =
      '<div class="select-trigger" id="' +
      rootId +
      '-trigger">' +
      '<span class="select-text" id="' +
      rootId +
      '-display"></span>' +
      '<div class="select-trigger__icons">' +
      '<svg class="clear-btn" id="' +
      rootId +
      '-clear" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>' +
      '</svg>' +
      '<svg class="arrow-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5H7z"/></svg>' +
      '</div></div>' +
      '<div class="tree-dropdown" id="' +
      rootId +
      '-dropdown">' +
      '<div class="search-bar">' +
      '<input type="text" class="search-input" id="' +
      rootId +
      '-search" placeholder="' +
      searchPh +
      '" autocomplete="off" />' +
      '</div>' +
      '<div class="tree-list" id="' +
      rootId +
      '-list"></div></div>';

    var trigger = document.getElementById(rootId + '-trigger');
    var dropdown = document.getElementById(rootId + '-dropdown');
    var display = document.getElementById(rootId + '-display');
    var searchInput = document.getElementById(rootId + '-search');
    var listContainer = document.getElementById(rootId + '-list');
    var clearBtn = document.getElementById(rootId + '-clear');

    var expandedIds = opts.defaultExpandedIds ? opts.defaultExpandedIds.slice() : [];
    var selectedId =
      opts.defaultValue !== undefined
        ? opts.defaultValue
        : opts.includeAll === false
          ? ''
          : 'all';
    var searchKey = '';
    var flatData = [];

    function buildDefaultExpandedIds() {
      var ids = [];
      (global.AppStorage && global.AppStorage.get('orgs', []) || []).forEach(function (org) {
        if (org.type === 'street') ids.push('street:' + org.name);
      });
      return ids;
    }

    if (!expandedIds.length && opts.expandStreets !== false) {
      expandedIds = buildDefaultExpandedIds();
    }

    function getTreeData() {
      var tree =
        typeof opts.getTree === 'function' ? opts.getTree() : buildRegionTree();
      if (opts.includeAll === false) {
        return tree.filter(function (node) {
          return node.id !== 'all';
        });
      }
      return tree;
    }

    function rebuildFlat() {
      flatData = flattenTree(getTreeData(), []);
    }

    function nodeHtml(node) {
      var hasChild = node.children && node.children.length > 0;
      var isExpanded = expandedIds.indexOf(node.id) !== -1;
      var isSelected = selectedId === node.id;
      var level = node.level || 1;
      return (
        '<div class="tree-node level-' +
        level +
        (isSelected ? ' selected' : '') +
        '" data-id="' +
        node.id +
        '">' +
        '<div class="node-arrow ' +
        (!hasChild ? 'hidden' : isExpanded ? '' : 'collapsed') +
        '" data-id="' +
        node.id +
        '">' +
        '<svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5H7z"/></svg></div>' +
        '<span class="node-label">' +
        node.label +
        '</span></div>'
      );
    }

    function renderTree() {
      rebuildFlat();
      var filtered = flatData.filter(function (node) {
        return !searchKey || String(node.label || '').indexOf(searchKey) !== -1;
      });
      if (!filtered.length) {
        listContainer.innerHTML = '<div class="no-result">无匹配区划</div>';
        return;
      }
      listContainer.innerHTML = filtered
        .map(function (node) {
          if (!searchKey) {
            var parent = null;
            for (var i = 0; i < flatData.length; i++) {
              var p = flatData[i];
              if (p.children && p.children.indexOf(node) !== -1) {
                parent = p;
                break;
              }
            }
            if (parent && expandedIds.indexOf(parent.id) === -1) return '';
          }
          return nodeHtml(node);
        })
        .join('');
    }

    function syncDisplay() {
      rebuildFlat();
      var node = null;
      for (var i = 0; i < flatData.length; i++) {
        if (flatData[i].id === selectedId) {
          node = flatData[i];
          break;
        }
      }
      if (node && node.id !== 'all' && selectedId) {
        display.textContent =
          node.village && node.street ? node.street + ' / ' + node.village : node.label;
        root.classList.add('has-val');
      } else {
        display.textContent = '';
        root.classList.remove('has-val');
      }
    }

    function resetDropdownPosition() {
      dropdown.classList.remove('is-fixed', 'pop-up');
      dropdown.style.top = '';
      dropdown.style.left = '';
      dropdown.style.width = '';
      dropdown.style.bottom = '';
    }

    function positionDropdown() {
      resetDropdownPosition();
      var rect = trigger.getBoundingClientRect();
      dropdown.classList.add('is-fixed');
      dropdown.style.left = rect.left + 'px';
      dropdown.style.width = rect.width + 'px';
      var spaceBelow = window.innerHeight - rect.bottom - 8;
      if (spaceBelow >= 120) {
        dropdown.style.top = rect.bottom + 4 + 'px';
      } else {
        dropdown.style.top = Math.max(8, rect.top - dropdown.offsetHeight - 4) + 'px';
      }
    }

    function closeDropdown() {
      dropdown.classList.remove('show');
      trigger.classList.remove('active');
      resetDropdownPosition();
    }

    function closeOthers() {
      Object.keys(instances).forEach(function (id) {
        if (id !== rootId && instances[id]) instances[id].closeDropdown();
      });
    }

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      closeOthers();
      var isShow = dropdown.classList.toggle('show');
      trigger.classList.toggle('active', isShow);
      if (isShow) {
        searchKey = '';
        searchInput.value = '';
        renderTree();
        listContainer.scrollTop = 0;
        requestAnimationFrame(positionDropdown);
        searchInput.focus();
      } else {
        resetDropdownPosition();
      }
    });

    listContainer.addEventListener('click', function (e) {
      e.stopPropagation();
      var arrow = e.target.closest('.node-arrow');
      var nodeEl = e.target.closest('.tree-node');
      if (arrow && !arrow.classList.contains('hidden')) {
        var aid = arrow.getAttribute('data-id');
        var idx = expandedIds.indexOf(aid);
        if (idx > -1) expandedIds.splice(idx, 1);
        else expandedIds.push(aid);
        renderTree();
        return;
      }
      if (!nodeEl) return;
      selectedId = nodeEl.getAttribute('data-id');
      syncDisplay();
      closeDropdown();
      var picked = null;
      for (var j = 0; j < flatData.length; j++) {
        if (flatData[j].id === selectedId) {
          picked = flatData[j];
          break;
        }
      }
      if (typeof opts.onChange === 'function') opts.onChange(selectedId, picked);
    });

    searchInput.addEventListener('input', function () {
      searchKey = searchInput.value.trim();
      renderTree();
    });
    searchInput.addEventListener('click', function (e) {
      e.stopPropagation();
    });

    clearBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      selectedId = opts.includeAll === false ? '' : 'all';
      syncDisplay();
      closeDropdown();
      if (typeof opts.onChange === 'function') {
        opts.onChange(selectedId, null);
      }
    });

    if (!global.__hsfTreeSelectDocBound) {
      global.__hsfTreeSelectDocBound = true;
      document.addEventListener('click', function () {
        Object.keys(instances).forEach(function (id) {
          if (instances[id]) instances[id].closeDropdown();
        });
      });
      window.addEventListener('resize', function () {
        Object.keys(instances).forEach(function (id) {
          var inst = instances[id];
          if (inst && inst.dropdown && inst.dropdown.classList.contains('show') && inst.positionDropdown) {
            inst.positionDropdown();
          }
        });
      });
    }

    syncDisplay();
    renderTree();

    var api = {
      dropdown: dropdown,
      closeDropdown: closeDropdown,
      positionDropdown: positionDropdown,
      getValue: function () {
        return selectedId;
      },
      getRegion: function () {
        rebuildFlat();
        for (var i = 0; i < flatData.length; i++) {
          if (flatData[i].id === selectedId) {
            return { street: flatData[i].street || '', village: flatData[i].village || '' };
          }
        }
        return { street: '', village: '' };
      },
      reset: function () {
        selectedId = opts.includeAll === false ? '' : 'all';
        syncDisplay();
      },
      setValue: function (id) {
        selectedId = id || (opts.includeAll === false ? '' : 'all');
        syncDisplay();
      },
    };
    instances[rootId] = api;
    return api;
  }

  global.HSFRegionTreeSelect = {
    create: create,
    buildRegionTree: buildRegionTree,
  };
})(window);
