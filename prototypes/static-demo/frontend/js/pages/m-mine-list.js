/**
 * 我的清单 · 单开页（我上报 / 待整改 / 已整改）
 * URL: mine-list.html?scope=reported|pending|done
 */
(function () {
  var session = AppStorage.get('session', null);
  if (!session) {
    if (window.HSFNav) HSFNav.go('./login.html');
    else location.href = './login.html';
    return;
  }

  var SCOPE = {
    reported: { title: '我上报', empty: '暂无上报记录' },
    pending: { title: '待整改', empty: '暂无待整改' },
    done: { title: '已整改', empty: '暂无已整改' },
  };

  var params = new URLSearchParams(location.search);
  var scope = params.get('scope') || 'reported';
  if (!SCOPE[scope]) scope = 'reported';
  var meta = SCOPE[scope];

  if (window.HSFDevice) {
    HSFDevice.setNavTitle(meta.title);
    HSFDevice.setNavBack('./mine.html');
  }
  var vp = document.getElementById('app-viewport');
  if (vp) {
    vp.setAttribute('data-mp-title', meta.title);
    vp.setAttribute('data-mp-back', './mine.html');
  }

  AppIcons.injectAll(document);
  if (window.AppLog) AppLog.info('m-mine-list', 'page ready', { scope: scope });

  var listEl = document.getElementById('mMineList');
  var backToList =
    './mine-list.html?scope=' + encodeURIComponent(scope);

  function isMineRelated(i) {
    return (
      i.assigneeId === session.staffId ||
      i.assigneeName === session.name ||
      i.reporterId === session.staffId ||
      i.reporterName === session.name
    );
  }

  function isReportedByMe(i) {
    return AppData.isReporterMatch(i, session);
  }

  function collect() {
    var issues = (AppData.getIssues() || []).slice();
    var filtered;
    if (scope === 'reported') {
      filtered = issues.filter(isReportedByMe);
    } else if (scope === 'pending') {
      filtered = issues.filter(function (i) {
        return i.status === 'pending' && isMineRelated(i);
      });
    } else {
      filtered = issues.filter(function (i) {
        return i.status === 'done' && isMineRelated(i);
      });
    }
    filtered.sort(function (a, b) {
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
    return filtered;
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
    var urg = AppData.formatPlanStatus(i);
    var name = i.reporterName || '上报人';
    var time = formatPubTime(i.createdAt);
    var desc = AppData.formatIssueListTitle(i);
    var loc = i.locationText || i.address || '';
    var region = [(i.street || ''), (i.village || '')].filter(Boolean).join('');
    var photos = issuePhotos(i);
    var detailHref =
      './issue-detail.html?id=' +
      encodeURIComponent(i.id) +
      '&back=' +
      encodeURIComponent(backToList);

    return (
      '<article class="m-todo-card" data-id="' +
      encodeURIComponent(i.id) +
      '" data-detail="' +
      detailHref +
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
      (region
        ? '<div class="m-todo-card__tags"><span class="m-todo-card__region">' +
          region +
          '</span></div>'
        : '') +
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

  function render() {
    var items = collect();
    if (!items.length) {
      listEl.innerHTML =
        '<div class="m-empty m-todo__empty">' +
        '<img class="m-todo__empty-img" src="./List.svg" alt="" width="200" height="120" />' +
        '<p>' +
        meta.empty +
        '</p>' +
        '</div>';
      return;
    }
    listEl.innerHTML = items.map(card).join('');
    AppIcons.injectAll(listEl);
    bindMedia(listEl);
  }

  listEl.addEventListener('click', function (e) {
    var locBtn = e.target.closest('.m-todo-card__loc');
    if (locBtn) {
      e.preventDefault();
      e.stopPropagation();
      var mid = locBtn.getAttribute('data-map-id');
      var mapHref =
        './issue-map.html?id=' +
        mid +
        '&back=' +
        encodeURIComponent(backToList);
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

  document.addEventListener('hsf-page-leave', function onLeave() {
    if (window.AppWatermark) AppWatermark.closePreview();
    document.removeEventListener('hsf-page-leave', onLeave);
  });

  render();
})();
