/**
 * 问题定位地图
 * MapLibre 自 20260707LINK/lib/maplibre 复制。
 * 底图：高德栅格 → Carto → Esri（栈 B 获准外链；国内优先高德瓦片，非高德 JS API）。
 */
(function () {
  var session = AppStorage.get('session', null);
  if (!session) {
    if (window.HSFNav) HSFNav.go('./login.html');
    else location.href = './login.html';
    return;
  }

  var params = new URLSearchParams(location.search);
  var id = params.get('id');
  var backHref = params.get('back') || './todo.html';
  var item = AppData.getIssue(id);
  var map = null;
  var addrEl = document.getElementById('mIssueMapAddr');
  var distEl = document.getElementById('mIssueMapDist');
  var STYLE_CANDIDATES = [
    '../frontend/libs/maplibre/styles/street-gaode.json',
    '../frontend/libs/maplibre/styles/street-carto.json',
    '../frontend/libs/maplibre/styles/street-esri.json',
  ];

  if (window.HSFDevice) {
    HSFDevice.setNavBack(backHref);
  }
  var vp = document.getElementById('app-viewport');
  if (vp) vp.setAttribute('data-mp-back', backHref);

  if (window.AppLog) AppLog.info('m-issue-map', 'page ready', { id: id });

  if (!item || item.lng == null || item.lat == null) {
    addrEl.textContent = '暂无坐标';
    distEl.textContent = '—';
    if (window.AppUI) AppUI.toast('该记录暂无坐标', 'warn');
    return;
  }

  var targetLng = Number(item.lng);
  var targetLat = Number(item.lat);
  var locText = item.locationText || item.address || item.village || '问题点';
  addrEl.textContent = locText;
  distEl.textContent = '定位中…';

  function haversineM(lng1, lat1, lng2, lat2) {
    var R = 6371000;
    var toRad = Math.PI / 180;
    var dLat = (lat2 - lat1) * toRad;
    var dLng = (lng2 - lng1) * toRad;
    var a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function formatDist(m) {
    if (m == null || isNaN(m)) return '—';
    if (m < 1000) return Math.round(m) + 'm';
    return (m / 1000).toFixed(2) + 'km';
  }

  function pinEl(kind) {
    var gid = 'hsfPinGrad-' + kind + '-' + Math.random().toString(36).slice(2, 7);
    var c1 = kind === 'target' ? '#4ea3e8' : '#3dba7a';
    var c2 = kind === 'target' ? '#015cbb' : '#1a7f4b';
    var el = document.createElement('div');
    el.className = 'm-issue-map__pin m-issue-map__pin--' + kind;
    el.setAttribute('aria-label', kind === 'target' ? '目标' : '我');
    el.innerHTML =
      '<svg viewBox="0 0 24 36" width="28" height="42" aria-hidden="true">' +
      '<defs><linearGradient id="' +
      gid +
      '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="' +
      c1 +
      '"/>' +
      '<stop offset="100%" stop-color="' +
      c2 +
      '"/>' +
      '</linearGradient></defs>' +
      '<path d="M12 0C5.373 0 0 5.373 0 12c0 8.25 12 24 12 24s12-15.75 12-24C24 5.373 18.627 0 12 0z" fill="url(#' +
      gid +
      ')"/>' +
      '<circle cx="12" cy="11.5" r="4.2" fill="#fff"/>' +
      '</svg>';
    return el;
  }

  function setDist(hereLng, hereLat) {
    distEl.textContent = formatDist(haversineM(hereLng, hereLat, targetLng, targetLat));
  }

  function fitBoth(hereLng, hereLat) {
    if (!map) return;
    var bounds = new maplibregl.LngLatBounds();
    bounds.extend([targetLng, targetLat]);
    bounds.extend([hereLng, hereLat]);
    map.fitBounds(bounds, { padding: 72, maxZoom: 15, duration: 600 });
  }

  function afterMapReady() {
    new maplibregl.Marker({ element: pinEl('target'), anchor: 'bottom' })
      .setLngLat([targetLng, targetLat])
      .addTo(map);

    if (!navigator.geolocation) {
      distEl.textContent = '—';
      return;
    }

    navigator.geolocation.getCurrentPosition(
      function (pos) {
        var hereLng = pos.coords.longitude;
        var hereLat = pos.coords.latitude;
        new maplibregl.Marker({ element: pinEl('here'), anchor: 'bottom' })
          .setLngLat([hereLng, hereLat])
          .addTo(map);
        setDist(hereLng, hereLat);
        fitBoth(hereLng, hereLat);
        if (window.AppLog) AppLog.info('m-issue-map', 'geolocation ok');
      },
      function (err) {
        distEl.textContent = '—';
        if (window.AppUI) AppUI.toast('无法获取当前位置', 'warn');
        if (window.AppLog) AppLog.warn('m-issue-map', 'geolocation fail', err && err.message);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  }

  function createMapWithStyle(styleSpec) {
    map = new maplibregl.Map({
      container: 'mIssueMap',
      style: styleSpec,
      center: [targetLng, targetLat],
      zoom: 14,
      attributionControl: false,
    });
    map.once('load', function () {
      if (window.AppLog) AppLog.info('m-issue-map', 'map load ok');
      afterMapReady();
    });
  }

  function tryStyle(index) {
    if (index >= STYLE_CANDIDATES.length) {
      distEl.textContent = '—';
      if (window.AppUI) AppUI.toast('地图底图加载失败', 'error');
      if (window.AppLog) AppLog.error('m-issue-map', 'all styles failed');
      return;
    }
    var styleUrl = STYLE_CANDIDATES[index];
    fetch(styleUrl)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (spec) {
        if (window.AppLog) AppLog.info('m-issue-map', 'style fetched', { style: styleUrl });
        createMapWithStyle(spec);
      })
      .catch(function (err) {
        if (window.AppLog) {
          AppLog.warn('m-issue-map', 'style fetch fail', {
            style: styleUrl,
            msg: err && err.message,
          });
        }
        tryStyle(index + 1);
      });
  }

  if (!window.maplibregl) {
    if (window.AppUI) AppUI.toast('地图组件未加载', 'error');
    if (window.AppLog) AppLog.error('m-issue-map', 'maplibre missing');
    return;
  }

  tryStyle(0);

  document.addEventListener('hsf-page-leave', function onLeave() {
    document.removeEventListener('hsf-page-leave', onLeave);
    if (map) {
      map.remove();
      map = null;
    }
  });
})();
