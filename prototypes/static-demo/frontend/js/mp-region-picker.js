/**
 * 移动端行政区划三列滚筒（街道 / 社区·新村 / 自然村）
 * 与巡查上报 `m-report.js` 选择器一致；待办筛选等场景传入自定义 tree（可含「全部」）
 */
(function (global) {
  'use strict';

  var DEFAULT_ITEM_H = 44;

  function buildBaseTree() {
    if (global.HSFRegion2023 && typeof global.HSFRegion2023.buildTree === 'function') {
      return global.HSFRegion2023.buildTree();
    }
    var orgs = (global.AppStorage && global.AppStorage.get('orgs', [])) || [];
    var streets = [];
    orgs.forEach(function (street) {
      if (street.type !== 'street') return;
      var children = [];
      orgs.forEach(function (child) {
        if (
          child.parentId === street.id &&
          (child.type === 'village' || child.type === 'community')
        ) {
          children.push({
            value: child.name,
            label: child.name,
            children: [],
          });
        }
      });
      if (!children.length) return;
      streets.push({
        value: street.name,
        label: street.name,
        children: children,
      });
    });
    return streets;
  }

  function villageNaturals(villageOpt) {
    return (villageOpt && villageOpt.children) || [];
  }

  function indexOf(opts, value) {
    for (var i = 0; i < opts.length; i++) {
      if (opts[i].value === value) return i;
    }
    return 0;
  }

  function snapCol(el, maxIndex, itemH) {
    if (!el) return 0;
    var h = itemH || DEFAULT_ITEM_H;
    var idx = Math.round(el.scrollTop / h);
    if (idx < 0) idx = 0;
    if (idx > maxIndex) idx = maxIndex;
    el.scrollTop = idx * h;
    markActiveItem(el, idx);
    return idx;
  }

  function markActiveItem(el, idx) {
    if (!el) return;
    var items = el.querySelectorAll('.m-picker__item');
    items.forEach(function (node, i) {
      node.classList.toggle('is-active', i === idx);
    });
  }

  function colHtml(opts) {
    return (
      '<div class="m-picker__pad"></div>' +
      (opts || [])
        .map(function (o) {
          return '<div class="m-picker__item">' + o.label + '</div>';
        })
        .join('') +
      '<div class="m-picker__pad"></div>'
    );
  }

  /**
   * @param {object} config
   * @param {HTMLElement} config.host
   * @param {Array} config.tree
   * @param {{ street?: string, village?: string, naturalVillage?: string }} config.value
   * @param {number} [config.itemH]
   * @param {string} [config.idPrefix]
   * @param {function} [config.onOk]
   * @param {function} [config.onCancel]
   * @param {function} [config.onEmpty]
   * @returns {{ root: HTMLElement, close: function(boolean) }|null}
   */
  function openCascade(config) {
    config = config || {};
    var tree = config.tree || buildBaseTree();
    var value = config.value || {};
    var host = config.host;
    var itemH = config.itemH || DEFAULT_ITEM_H;
    var idPrefix = config.idPrefix || 'mRegionPicker';

    if (!host) return null;
    if (!tree.length) {
      if (typeof config.onEmpty === 'function') config.onEmpty();
      return null;
    }

    var streetIndex = indexOf(tree, value.street || '');
    var villages = tree[streetIndex].children || [];
    var villageIndex = indexOf(villages, value.village || '');
    var villageOpt = villages[villageIndex] || villages[0];
    var naturals = villageNaturals(villageOpt);
    var naturalIndex = indexOf(naturals, value.naturalVillage || '');
    var cascade = {
      streetIndex: streetIndex,
      villageIndex: villageIndex,
      naturalIndex: naturalIndex,
    };

    var mask = document.createElement('div');
    mask.className = 'm-picker m-picker--region3';
    mask.setAttribute('role', 'dialog');
    mask.setAttribute('aria-modal', 'true');
    mask.setAttribute('aria-label', '行政区划');

    mask.innerHTML =
      '<div class="m-picker__mask" data-act="cancel"></div>' +
      '<div class="m-picker__panel">' +
      '<div class="m-picker__hd">' +
      '<button type="button" class="m-picker__btn" data-act="cancel">取消</button>' +
      '<span class="m-picker__title">行政区划</span>' +
      '<button type="button" class="m-picker__btn m-picker__btn--ok" data-act="ok">确定</button>' +
      '</div>' +
      '<div class="m-picker__bd m-picker__bd--cascade">' +
      '<div class="m-picker__indicator" aria-hidden="true"></div>' +
      '<div class="m-picker__cascade">' +
      '<div class="m-picker__col" id="' +
      idPrefix +
      'Street" aria-label="街道">' +
      colHtml(tree) +
      '</div>' +
      '<div class="m-picker__col" id="' +
      idPrefix +
      'Village" aria-label="社区或新村">' +
      colHtml(villages) +
      '</div>' +
      '<div class="m-picker__col" id="' +
      idPrefix +
      'Natural" aria-label="自然村">' +
      colHtml(naturals) +
      '</div>' +
      '</div>' +
      '</div>' +
      '</div>';

    host.appendChild(mask);

    var streetCol = mask.querySelector('#' + idPrefix + 'Street');
    var villageCol = mask.querySelector('#' + idPrefix + 'Village');
    var naturalCol = mask.querySelector('#' + idPrefix + 'Natural');
    var scrollTimer = null;

    function bindColScroll(el, onSnap) {
      el.addEventListener('scroll', function () {
        if (scrollTimer) clearTimeout(scrollTimer);
        scrollTimer = setTimeout(onSnap, 80);
      });
    }

    streetCol.scrollTop = streetIndex * itemH;
    villageCol.scrollTop = villageIndex * itemH;
    markActiveItem(streetCol, streetIndex);
    markActiveItem(villageCol, villageIndex);

    function syncNaturalCol() {
      var streetOpt = tree[cascade.streetIndex] || tree[0];
      var villagesList = streetOpt.children || [];
      var currentVillage = villagesList[cascade.villageIndex] || villagesList[0];
      var list = villageNaturals(currentVillage);
      if (!list.length) {
        cascade.naturalIndex = 0;
        naturalCol.innerHTML = colHtml([]);
        naturalCol.scrollTop = 0;
        return;
      }
      if (cascade.naturalIndex >= list.length) cascade.naturalIndex = 0;
      naturalCol.innerHTML = colHtml(list);
      naturalCol.scrollTop = cascade.naturalIndex * itemH;
      markActiveItem(naturalCol, cascade.naturalIndex);
    }

    syncNaturalCol();

    function refreshVillages() {
      var streetOpt = tree[cascade.streetIndex] || tree[0];
      var next = streetOpt.children || [];
      cascade.villageIndex = 0;
      cascade.naturalIndex = 0;
      villageCol.innerHTML = colHtml(next);
      villageCol.scrollTop = 0;
      markActiveItem(villageCol, 0);
      syncNaturalCol();
    }

    bindColScroll(streetCol, function () {
      var next = snapCol(streetCol, tree.length - 1, itemH);
      if (next !== cascade.streetIndex) {
        cascade.streetIndex = next;
        refreshVillages();
      } else {
        cascade.streetIndex = next;
      }
      markActiveItem(streetCol, cascade.streetIndex);
    });

    bindColScroll(villageCol, function () {
      var streetOpt = tree[cascade.streetIndex] || tree[0];
      var list = streetOpt.children || [];
      var next = snapCol(villageCol, list.length - 1, itemH);
      if (next !== cascade.villageIndex) {
        cascade.villageIndex = next;
        cascade.naturalIndex = 0;
        syncNaturalCol();
      } else {
        cascade.villageIndex = next;
      }
      markActiveItem(villageCol, cascade.villageIndex);
    });

    bindColScroll(naturalCol, function () {
      var streetOpt = tree[cascade.streetIndex] || tree[0];
      var villagesList = streetOpt.children || [];
      var villageOptInner = villagesList[cascade.villageIndex] || villagesList[0];
      var list = villageNaturals(villageOptInner);
      if (!list.length) {
        cascade.naturalIndex = 0;
        return;
      }
      cascade.naturalIndex = snapCol(naturalCol, list.length - 1, itemH);
      markActiveItem(naturalCol, cascade.naturalIndex);
    });

    function readValues() {
      var streetOpt = tree[cascade.streetIndex] || tree[0];
      var villagesList = streetOpt.children || [];
      var villageOptInner = villagesList[cascade.villageIndex] || villagesList[0];
      var naturalsList = villageNaturals(villageOptInner);
      var naturalOpt = naturalsList.length
        ? naturalsList[cascade.naturalIndex] || naturalsList[0]
        : null;
      return {
        street: streetOpt ? streetOpt.value : '',
        village: villageOptInner ? villageOptInner.value : '',
        naturalVillage: naturalOpt ? naturalOpt.value : '',
      };
    }

    function close(commit) {
      mask.classList.remove('is-open');
      setTimeout(function () {
        if (mask.parentNode) mask.parentNode.removeChild(mask);
      }, 220);
      if (commit) {
        if (typeof config.onOk === 'function') config.onOk(readValues());
      } else if (typeof config.onCancel === 'function') {
        config.onCancel();
      }
    }

    requestAnimationFrame(function () {
      mask.classList.add('is-open');
    });

    mask.addEventListener('click', function (e) {
      var act = e.target.getAttribute('data-act');
      if (act === 'cancel') close(false);
      if (act === 'ok') close(true);
    });

    return { root: mask, close: close };
  }

  global.HSFMpRegionPicker = {
    ITEM_H: DEFAULT_ITEM_H,
    buildBaseTree: buildBaseTree,
    villageNaturals: villageNaturals,
    indexOf: indexOf,
    openCascade: openCascade,
  };
})(window);
