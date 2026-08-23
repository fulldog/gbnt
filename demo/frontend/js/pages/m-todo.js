(function () {
  var session = AppStorage.get('session', null);
  if (!session) {
    if (window.HSFNav) HSFNav.go('./login.html');
    else location.href = './login.html';
    return;
  }
  AppIcons.injectAll(document);
  if (window.AppLog) AppLog.info('m-todo', 'page ready', { user: session.username });

  var ITEM_H = 44;

  var TYPE_OPTS = [
    { value: 'all', label: '全部' },
    { value: 'well', label: '机井' },
    { value: 'road', label: '道路' },
    { value: 'bridge', label: '桥涵闸' },
    { value: 'forest', label: '林网' },
    { value: 'transformer', label: '变压器' },
  ];
  var STATUS_OPTS = [
    { value: 'all', label: '全部' },
    { value: 'pending', label: '待整改' },
    { value: 'done', label: '已整改' },
  ];

  var issues = AppData.getIssues().slice().sort(sortIssues);
  var filters = { type: 'all', street: 'all', village: 'all', status: 'all' };
  var regionTree = buildRegionTree();
  var search = document.getElementById('mTodoSearch');
  var list = document.getElementById('mTodoList');
  var typeBtn = document.getElementById('mTodoStats');
  var regionBtn = document.getElementById('mTodoRegion');
  var statusBtn = document.getElementById('mTodoStatus');
  var pickerRoot = null;
  var pickerScroll = null;
  var pickerIndex = 0;
  var pickerOpts = [];
  var pickerKey = '';
  var cascade = null;
  var scrollTimer = null;

  function sortIssues(a, b) {
    var sa = a.status === 'pending' ? 0 : 1;
    var sb = b.status === 'pending' ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  }

  function urgency(i) {
    return AppData.formatPlanStatus(i);
  }

  function countPending(pred) {
    return issues.filter(function (i) {
      if (i.status !== 'pending') return false;
      return pred ? pred(i) : true;
    }).length;
  }

  function withPendingCount(baseLabel, n) {
    return baseLabel + '(' + n + ')';
  }

  function buildRegionTree() {
    var orgs = AppStorage.get('orgs', []) || [];
    var allPending = countPending(null);
    var streets = [
      {
        value: 'all',
        label: withPendingCount('全部', allPending),
        children: [{ value: 'all', label: withPendingCount('全部', allPending) }],
      },
    ];
    orgs.forEach(function (street) {
      if (street.type !== 'street') return;
      var streetN = countPending(function (i) {
        return i.street === street.name;
      });
      var children = [{ value: 'all', label: withPendingCount('全部', streetN) }];
      orgs.forEach(function (child) {
        if (
          child.parentId === street.id &&
          (child.type === 'village' || child.type === 'community')
        ) {
          var villageN = countPending(function (i) {
            return i.village === child.name;
          });
          children.push({
            value: child.name,
            label: withPendingCount(child.name, villageN),
          });
        }
      });
      streets.push({
        value: street.name,
        label: withPendingCount(street.name, streetN),
        children: children,
      });
    });
    return streets;
  }

  function optsFor(key) {
    if (key === 'type') {
      return TYPE_OPTS.map(function (o) {
        var n =
          o.value === 'all'
            ? countPending(null)
            : countPending(function (i) {
                return i.type === o.value;
              });
        return { value: o.value, label: withPendingCount(o.label, n) };
      });
    }
    /* 状态：全部/待整改括号为待整改数；已整改为已整改数 */
    var pendingN = countPending(null);
    var doneN = issues.filter(function (i) {
      return i.status === 'done';
    }).length;
    return [
      { value: 'all', label: withPendingCount('全部', pendingN) },
      { value: 'pending', label: withPendingCount('待整改', pendingN) },
      { value: 'done', label: withPendingCount('已整改', doneN) },
    ];
  }

  function titleFor(key) {
    if (key === 'type') return '类型';
    if (key === 'region') return '行政区划';
    return '状态';
  }

  function labelOf(opts, value) {
    for (var i = 0; i < opts.length; i++) {
      if (opts[i].value === value) return opts[i].label;
    }
    return '全部';
  }

  function indexOf(opts, value) {
    for (var i = 0; i < opts.length; i++) {
      if (opts[i].value === value) return i;
    }
    return 0;
  }

  function regionTriggerLabel() {
    if (filters.village && filters.village !== 'all') return filters.village;
    if (filters.street && filters.street !== 'all') return filters.street;
    return '全部';
  }

  function syncTriggers() {
    typeBtn.querySelector('.m-todo-filter__value').textContent = labelOf(TYPE_OPTS, filters.type);
    regionBtn.querySelector('.m-todo-filter__value').textContent = regionTriggerLabel();
    statusBtn.querySelector('.m-todo-filter__value').textContent = labelOf(STATUS_OPTS, filters.status);
  }

  function mountHost() {
    return document.querySelector('.app-device__screen') || document.body;
  }

  function closePicker(commit) {
    if (!pickerRoot) return;
    if (commit) {
      if (pickerKey === 'region' && cascade) {
        var streetOpt = regionTree[cascade.streetIndex] || regionTree[0];
        var villages = streetOpt.children || [];
        var villageOpt = villages[cascade.villageIndex] || villages[0];
        filters.street = streetOpt.value;
        filters.village = villageOpt ? villageOpt.value : 'all';
        syncTriggers();
        renderList();
      } else {
        var opt = pickerOpts[pickerIndex];
        if (opt) {
          filters[pickerKey] = opt.value;
          syncTriggers();
          renderList();
        }
      }
    }
    pickerRoot.classList.remove('is-open');
    var root = pickerRoot;
    pickerRoot = null;
    pickerScroll = null;
    cascade = null;
    setTimeout(function () {
      if (root.parentNode) root.parentNode.removeChild(root);
    }, 220);
  }

  function snapCol(el, maxIndex) {
    if (!el) return 0;
    var idx = Math.round(el.scrollTop / ITEM_H);
    if (idx < 0) idx = 0;
    if (idx > maxIndex) idx = maxIndex;
    el.scrollTop = idx * ITEM_H;
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

  function snapToNearest() {
    if (!pickerScroll) return;
    pickerIndex = snapCol(pickerScroll, pickerOpts.length - 1);
  }

  function colHtml(opts) {
    return (
      '<div class="m-picker__pad"></div>' +
      opts
        .map(function (o) {
          return '<div class="m-picker__item">' + o.label + '</div>';
        })
        .join('') +
      '<div class="m-picker__pad"></div>'
    );
  }

  function bindColScroll(el, onSnap) {
    el.addEventListener('scroll', function () {
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(onSnap, 80);
    });
  }

  function openGridPicker(key) {
    var host = mountHost();
    var mask = document.createElement('div');
    mask.className = 'm-picker';
    mask.setAttribute('role', 'dialog');
    mask.setAttribute('aria-modal', 'true');
    mask.setAttribute('aria-label', titleFor(key));

    var gridHtml = pickerOpts
      .map(function (o, i) {
        var active = i === pickerIndex ? ' is-active' : '';
        return (
          '<button type="button" class="m-picker__chip' +
          active +
          '" data-act="pick" data-index="' +
          i +
          '">' +
          o.label +
          '</button>'
        );
      })
      .join('');

    mask.innerHTML =
      '<div class="m-picker__mask" data-act="cancel"></div>' +
      '<div class="m-picker__panel m-picker__panel--grid">' +
      '<div class="m-picker__hd">' +
      '<button type="button" class="m-picker__btn" data-act="cancel">取消</button>' +
      '<span class="m-picker__title">' +
      titleFor(key) +
      '</span>' +
      '<span class="m-picker__hd-spacer" aria-hidden="true"></span>' +
      '</div>' +
      '<div class="m-picker__grid">' +
      gridHtml +
      '</div>' +
      '</div>';

    host.appendChild(mask);
    pickerRoot = mask;
    pickerScroll = null;

    requestAnimationFrame(function () {
      mask.classList.add('is-open');
    });

    mask.addEventListener('click', function (e) {
      var t = e.target.closest('[data-act]');
      if (!t) return;
      var act = t.getAttribute('data-act');
      if (act === 'cancel') {
        closePicker(false);
        return;
      }
      if (act === 'pick') {
        pickerIndex = parseInt(t.getAttribute('data-index'), 10) || 0;
        closePicker(true);
      }
    });
  }

  function openRegionCascade() {
    regionTree = buildRegionTree();
    var streetIndex = indexOf(regionTree, filters.street);
    var villages = regionTree[streetIndex].children || [];
    var villageIndex = indexOf(villages, filters.village);
    cascade = { streetIndex: streetIndex, villageIndex: villageIndex };

    var host = mountHost();
    var mask = document.createElement('div');
    mask.className = 'm-picker';
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
      '<div class="m-picker__col" id="mPickerStreet" aria-label="街道">' +
      colHtml(regionTree) +
      '</div>' +
      '<div class="m-picker__col" id="mPickerVillage" aria-label="村社区">' +
      colHtml(villages) +
      '</div>' +
      '</div>' +
      '</div>' +
      '</div>';

    host.appendChild(mask);
    pickerRoot = mask;
    pickerScroll = null;

    var streetCol = mask.querySelector('#mPickerStreet');
    var villageCol = mask.querySelector('#mPickerVillage');
    streetCol.scrollTop = streetIndex * ITEM_H;
    villageCol.scrollTop = villageIndex * ITEM_H;
    markActiveItem(streetCol, streetIndex);
    markActiveItem(villageCol, villageIndex);

    function refreshVillages(keepVillage) {
      var streetOpt = regionTree[cascade.streetIndex] || regionTree[0];
      var next = streetOpt.children || [];
      var idx = keepVillage ? indexOf(next, filters.village) : 0;
      if (idx < 0) idx = 0;
      cascade.villageIndex = idx;
      villageCol.innerHTML = colHtml(next);
      villageCol.scrollTop = idx * ITEM_H;
      markActiveItem(villageCol, idx);
    }

    bindColScroll(streetCol, function () {
      var next = snapCol(streetCol, regionTree.length - 1);
      if (next !== cascade.streetIndex) {
        cascade.streetIndex = next;
        refreshVillages(false);
      } else {
        cascade.streetIndex = next;
      }
      markActiveItem(streetCol, cascade.streetIndex);
    });

    bindColScroll(villageCol, function () {
      var streetOpt = regionTree[cascade.streetIndex] || regionTree[0];
      var list = streetOpt.children || [];
      cascade.villageIndex = snapCol(villageCol, list.length - 1);
    });

    requestAnimationFrame(function () {
      mask.classList.add('is-open');
    });

    mask.addEventListener('click', function (e) {
      var act = e.target.getAttribute('data-act');
      if (act === 'cancel') closePicker(false);
      if (act === 'ok') closePicker(true);
    });
  }

  function openRollerPicker(key) {
    var host = mountHost();
    var mask = document.createElement('div');
    mask.className = 'm-picker';
    mask.setAttribute('role', 'dialog');
    mask.setAttribute('aria-modal', 'true');
    mask.setAttribute('aria-label', titleFor(key));

    mask.innerHTML =
      '<div class="m-picker__mask" data-act="cancel"></div>' +
      '<div class="m-picker__panel">' +
      '<div class="m-picker__hd">' +
      '<button type="button" class="m-picker__btn" data-act="cancel">取消</button>' +
      '<span class="m-picker__title">' +
      titleFor(key) +
      '</span>' +
      '<button type="button" class="m-picker__btn m-picker__btn--ok" data-act="ok">确定</button>' +
      '</div>' +
      '<div class="m-picker__bd">' +
      '<div class="m-picker__indicator" aria-hidden="true"></div>' +
      '<div class="m-picker__col" id="mPickerCol">' +
      colHtml(pickerOpts) +
      '</div>' +
      '</div>' +
      '</div>';

    host.appendChild(mask);
    pickerRoot = mask;
    pickerScroll = mask.querySelector('#mPickerCol');
    pickerScroll.scrollTop = pickerIndex * ITEM_H;
    markActiveItem(pickerScroll, pickerIndex);

    requestAnimationFrame(function () {
      mask.classList.add('is-open');
    });

    mask.addEventListener('click', function (e) {
      var act = e.target.getAttribute('data-act');
      if (act === 'cancel') closePicker(false);
      if (act === 'ok') closePicker(true);
    });

    bindColScroll(pickerScroll, snapToNearest);
  }

  function openPicker(key) {
    closePicker(false);
    pickerKey = key;

    if (key === 'region') {
      openRegionCascade();
      return;
    }

    pickerOpts = optsFor(key);
    pickerIndex = indexOf(pickerOpts, filters[key]);

    if (key === 'type' || key === 'status') {
      openGridPicker(key);
      return;
    }

    openRollerPicker(key);
  }

  function filtered() {
    var q = (search.value || '').trim().toLowerCase();
    return issues.filter(function (i) {
      if (filters.type !== 'all' && i.type !== filters.type) return false;
      if (filters.status !== 'all' && i.status !== filters.status) return false;
      if (filters.street !== 'all' && i.street !== filters.street) return false;
      if (filters.village !== 'all' && i.village !== filters.village) return false;
      if (!q) return true;
      var blob = [
        i.code,
        i.village,
        i.street,
        i.description,
        i.assigneeName,
        AppData.TYPE_LABEL[i.type] || '',
      ]
        .join(' ')
        .toLowerCase();
      return blob.indexOf(q) !== -1;
    });
  }

  function formatPubTime(iso) {
    if (!iso) return '';
    var t = new Date(iso).getTime();
    if (isNaN(t)) return '';
    var diff = Date.now() - t;
    if (diff < 0) diff = 0;
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return mins + '分钟前';
    var hours = Math.floor(mins / 60);
    if (hours < 24) return hours + '小时前';
    var days = Math.floor(hours / 24);
    if (days < 7) return days + '天前';
    var d = new Date(t);
    return d.getMonth() + 1 + '-' + d.getDate();
  }

  function issuePhotos(i) {
    var list = [];
    if (i.photos && i.photos.length) {
      i.photos.forEach(function (p) {
        if (p) list.push(p);
      });
    } else {
      if (i.photoSrc) list.push(i.photoSrc);
      if (i.damagePhotoSrc) list.push(i.damagePhotoSrc);
    }
    return list.slice(0, 9);
  }

  function avatarHtml(i) {
    var name = i.reporterName || '报';
    if (i.avatarSrc) {
      return (
        '<span class="m-todo-card__avatar"><img src="' +
        i.avatarSrc +
        '" alt="" /></span>'
      );
    }
    return (
      '<span class="m-todo-card__avatar" aria-hidden="true">' +
      name.charAt(0) +
      '</span>'
    );
  }

  function mediaCellHtml(src) {
    if (!src) {
      return (
        '<div class="m-todo-card__grid-item m-media is-empty">' +
        '<span class="m-media__ph" aria-hidden="true">img</span></div>'
      );
    }
    return (
      '<div class="m-todo-card__grid-item m-media is-loading">' +
      '<span class="m-media__ph" aria-hidden="true">img</span>' +
      '<div class="m-media__skel" aria-hidden="true"></div>' +
      '<img src="' +
      src +
      '" alt="" loading="lazy" /></div>'
    );
  }

  function photosHtml(photos) {
    var n = photos.length;
    if (!n) {
      return (
        '<div class="m-todo-card__grid m-todo-card__grid--1">' +
        mediaCellHtml('') +
        '</div>'
      );
    }
    var cls = n === 1 ? '1' : n === 2 ? '2' : String(Math.min(n, 9));
    return (
      '<div class="m-todo-card__grid m-todo-card__grid--' +
      cls +
      '">' +
      photos.map(mediaCellHtml).join('') +
      '</div>'
    );
  }

  function bindMedia(root) {
    if (!root) return;
    root.querySelectorAll('.m-media img').forEach(function (img) {
      var wrap = img.closest('.m-media');
      if (!wrap) return;
      function done(ok) {
        wrap.classList.remove('is-loading');
        wrap.classList.toggle('is-ready', !!ok);
        wrap.classList.toggle('is-error', !ok);
      }
      if (img.complete) {
        done(img.naturalWidth > 0);
        return;
      }
      img.addEventListener('load', function () {
        done(true);
      });
      img.addEventListener('error', function () {
        done(false);
      });
    });
  }

  function card(i) {
    var typeLabel = AppData.TYPE_LABEL[i.type] || i.type || '';
    var urg = urgency(i);
    var name = i.reporterName || '上报人';
    var time = formatPubTime(i.createdAt);
    var desc = (i.description || '').trim();
    var loc = i.locationText || i.address || '';
    var region = [(i.street || ''), (i.village || '')].filter(Boolean).join('');
    var photos = issuePhotos(i);

    return (
      '<article class="m-todo-card" data-id="' +
      encodeURIComponent(i.id) +
      '" data-detail="./issue-detail.html?id=' +
      encodeURIComponent(i.id) +
      '">' +
      avatarHtml(i) +
      '<div class="m-todo-card__main">' +
      '<div class="m-todo-card__hd">' +
      '<div class="m-todo-card__who">' +
      '<span class="m-todo-card__name">' +
      name +
      '</span>' +
      (time
        ? '<span class="m-todo-card__dot">·</span><span class="m-todo-card__time">' +
          time +
          '</span>'
        : '') +
      '</div>' +
      '<span class="m-todo-card__status m-todo-card__status--' +
      urg.level +
      '">' +
      urg.text +
      '</span>' +
      '</div>' +
      (desc ? '<div class="m-todo-card__desc">' + desc + '</div>' : '') +
      photosHtml(photos) +
      '<div class="m-todo-card__tags">' +
      '<span class="m-todo-card__type">' +
      typeLabel +
      '</span>' +
      (region ? '<span class="m-todo-card__region">' + region + '</span>' : '') +
      '</div>' +
      (loc
        ? '<button type="button" class="m-todo-card__loc" data-map-id="' +
          encodeURIComponent(i.id) +
          '">' +
          '<span class="m-todo-card__loc-icon" data-icon="mapPin" aria-hidden="true"></span>' +
          '<span class="m-todo-card__loc-text">' +
          loc +
          '</span></button>'
        : '') +
      '</div></article>'
    );
  }

  function renderList() {
    var items = filtered();
    if (!items.length) {
      list.innerHTML =
        '<div class="m-empty m-todo__empty">' +
        '<img class="m-todo__empty-img" src="./List.svg" alt="" width="200" height="120" />' +
        '<p>暂无记录</p>' +
        '</div>';
      return;
    }
    list.innerHTML = items.map(card).join('');
    AppIcons.injectAll(list);
    bindMedia(list);
  }

  function onFilterClick(e) {
    var btn = e.target.closest('.m-todo-filter');
    if (!btn) return;
    openPicker(btn.getAttribute('data-filter'));
  }

  function onLeave() {
    closePicker(false);
    if (window.AppWatermark) AppWatermark.closePreview();
    document.removeEventListener('hsf-page-leave', onLeave);
  }

  document.querySelector('.m-todo__filters').addEventListener('click', onFilterClick);
  search.addEventListener('input', renderList);
  document.addEventListener('hsf-page-leave', onLeave);

  list.addEventListener('click', function (e) {
    var locBtn = e.target.closest('.m-todo-card__loc');
    if (locBtn) {
      e.preventDefault();
      e.stopPropagation();
      var mid = locBtn.getAttribute('data-map-id');
      var mapHref = './issue-map.html?id=' + mid;
      if (window.HSFNav) HSFNav.go(mapHref);
      else location.href = mapHref;
      return;
    }
    var mediaImg = e.target.closest('.m-media img');
    if (mediaImg) {
      e.preventDefault();
      e.stopPropagation();
      var cardPhoto = mediaImg.closest('.m-todo-card');
      var issueId = cardPhoto && cardPhoto.getAttribute('data-id');
      var issue = issueId && window.AppData ? AppData.getIssue(decodeURIComponent(issueId)) : null;
      var meta =
        window.AppWatermark && issue
          ? AppWatermark.metaFromIssue(issue)
          : { address: '', lat: null, lng: null };
      if (window.AppWatermark && typeof AppWatermark.openPreview === 'function') {
        AppWatermark.openPreview(mediaImg.getAttribute('src') || mediaImg.src, meta);
      }
      return;
    }
    var cardEl = e.target.closest('.m-todo-card');
    if (!cardEl) return;
    var href = cardEl.getAttribute('data-detail');
    if (!href) return;
    if (window.HSFNav) HSFNav.go(href);
    else location.href = href;
  });

  syncTriggers();
  renderList();
})();
