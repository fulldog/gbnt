/**
 * 照片水印：左下角 · 地址加粗 / 度分秒 / 中文时间
 * 入库存原图；全屏预览时再叠水印（列表缩略图不带）
 */
(function (global) {
  var previewRoot = null;
  var leaveBound = false;

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function formatNow() {
    var d = new Date();
    return (
      d.getFullYear() +
      '-' +
      pad(d.getMonth() + 1) +
      '-' +
      pad(d.getDate()) +
      ' ' +
      pad(d.getHours()) +
      ':' +
      pad(d.getMinutes()) +
      ':' +
      pad(d.getSeconds())
    );
  }

  /** YYYY年M月D日 HH:MM */
  function formatDateZh(input) {
    var d = input ? new Date(input) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    return (
      d.getFullYear() +
      '年' +
      (d.getMonth() + 1) +
      '月' +
      d.getDate() +
      '日 ' +
      pad(d.getHours()) +
      ':' +
      pad(d.getMinutes())
    );
  }

  function formatDmsCompact(deg, isLat) {
    if (deg == null || isNaN(Number(deg))) return '—';
    var n = Number(deg);
    var hemi = isLat ? (n >= 0 ? 'N' : 'S') : n >= 0 ? 'E' : 'W';
    var abs = Math.abs(n);
    var d = Math.floor(abs);
    var mFloat = (abs - d) * 60;
    var m = Math.floor(mFloat);
    var s = Math.round((mFloat - m) * 60);
    if (s === 60) {
      m += 1;
      s = 0;
    }
    if (m === 60) {
      d += 1;
      m = 0;
    }
    return d + '°' + m + "'" + s + '"' + hemi;
  }

  function formatCoordLine(lat, lng) {
    return formatDmsCompact(lat, true) + ', ' + formatDmsCompact(lng, false);
  }

  function metaFromIssue(issue) {
    issue = issue || {};
    return {
      address: issue.locationText || issue.address || '',
      lat: issue.lat,
      lng: issue.lng,
      time: formatDateZh(issue.createdAt || issue.photoAt),
    };
  }

  /**
   * @param {HTMLImageElement|HTMLCanvasElement|string} source
   * @param {object} meta { address, lat, lng, time }
   * @returns {Promise<string>} dataURL
   */
  function applyWatermark(source, meta) {
    meta = meta || {};
    return new Promise(function (resolve, reject) {
      var img = new Image();
      if (typeof source === 'string' && /^https?:/i.test(source)) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = function () {
        var canvas = document.createElement('canvas');
        var w = img.naturalWidth || img.width;
        var h = img.naturalHeight || img.height;
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        /* 按手机内容宽约 390 换算，使全屏预览时地址约等于 16px */
        var scale = w / 390;
        var titleSize = Math.max(16, Math.round(16 * scale));
        var bodySize = Math.max(11, Math.round(12 * scale));
        var gap = Math.round(6 * scale);
        var padX = Math.round(14 * scale);
        var padY = Math.round(16 * scale);
        var barW = Math.max(2, Math.round(3 * scale));
        var barGap = Math.round(8 * scale);
        var fontFamily = '"PingFang SC","Microsoft YaHei",sans-serif';

        var address = meta.address || '位置未知';
        var coord = formatCoordLine(meta.lat, meta.lng);
        var timeStr = meta.time || formatDateZh();

        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.55)';
        ctx.shadowBlur = Math.round(4 * scale);
        ctx.shadowOffsetY = Math.round(1 * scale);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold ' + titleSize + 'px ' + fontFamily;
        ctx.textBaseline = 'bottom';
        var titleY = h - padY - bodySize * 2 - gap * 2;
        ctx.fillText(address, padX, titleY);

        var bodyX = padX + barW + barGap;
        var line1Y = h - padY - bodySize - gap;
        var line2Y = h - padY;
        var barTop = titleY + Math.round(gap * 0.6);
        var barBottom = line2Y;

        ctx.shadowColor = 'transparent';
        ctx.fillStyle = '#f5c518';
        ctx.fillRect(padX, barTop, barW, Math.max(barW, barBottom - barTop));

        ctx.shadowColor = 'rgba(0,0,0,0.55)';
        ctx.shadowBlur = Math.round(4 * scale);
        ctx.shadowOffsetY = Math.round(1 * scale);
        ctx.fillStyle = '#ffffff';
        ctx.font = bodySize + 'px ' + fontFamily;
        ctx.fillText(coord, bodyX, line1Y);
        ctx.fillText(timeStr, bodyX, line2Y);
        ctx.restore();

        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = function () {
        reject(new Error('图片加载失败'));
      };
      if (typeof source === 'string') img.src = source;
      else if (source && source.toDataURL) img.src = source.toDataURL('image/jpeg', 0.92);
      else if (source instanceof HTMLImageElement) img.src = source.src;
      else reject(new Error('无效图片源'));
    });
  }

  function mountHost() {
    return (
      document.querySelector('.app-device__screen') ||
      document.getElementById('app-viewport') ||
      document.body
    );
  }

  function closePreview() {
    if (!previewRoot) return;
    if (previewRoot.parentNode) previewRoot.parentNode.removeChild(previewRoot);
    previewRoot = null;
  }

  function ensureLeaveHook() {
    if (leaveBound) return;
    leaveBound = true;
    document.addEventListener('hsf-page-leave', closePreview);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * 全屏预览：原图 + DOM 叠新水印（不二次 canvas 烧录，避免与旧图叠两层）
   * opts.baked=true 时仅展示已烧录水印的图（管理端详情等）
   */
  function openPreview(src, meta, opts) {
    meta = meta || {};
    opts = opts || {};
    ensureLeaveHook();
    closePreview();
    var host = mountHost();
    var layer = document.createElement('div');
    layer.className = 'm-photo-wm-preview';
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-label', '预览');
    var safeSrc = String(src || '').replace(/"/g, '&quot;');
    var wmHtml = '';
    if (!opts.baked) {
      var address = meta.address || '位置未知';
      var coord = formatCoordLine(meta.lat, meta.lng);
      var timeStr = meta.time || formatDateZh();
      wmHtml =
        '<div class="m-photo-wm-preview__wm">' +
        '<div class="m-photo-wm-preview__addr">' +
        escapeHtml(address) +
        '</div>' +
        '<div class="m-photo-wm-preview__line">' +
        '<span class="m-photo-wm-preview__bar" aria-hidden="true"></span>' +
        '<div class="m-photo-wm-preview__sub">' +
        '<div>' +
        escapeHtml(coord) +
        '</div>' +
        '<div>' +
        escapeHtml(timeStr) +
        '</div>' +
        '</div></div></div>';
    }
    layer.innerHTML =
      '<div class="m-photo-wm-preview__stage">' +
      '<div class="m-photo-wm-preview__frame">' +
      '<img class="m-photo-wm-preview__img" src="' +
      safeSrc +
      '" alt="预览" />' +
      wmHtml +
      '</div></div>';
    host.appendChild(layer);
    previewRoot = layer;
    layer.addEventListener('click', closePreview);
  }

  function coordsLabel(lat, lng) {
    return '当前位置（' + formatDmsCompact(lat, true) + '，' + formatDmsCompact(lng, false) + '）';
  }

  function buildZhAddress(data) {
    if (!data) return '';
    var parts = [];
    if (data.countryName) parts.push(data.countryName);
    if (data.principalSubdivision) parts.push(data.principalSubdivision);
    if (data.city && data.city !== data.principalSubdivision) parts.push(data.city);
    if (data.locality && data.locality !== data.city) parts.push(data.locality);
    var admin = (data.localityInfo && data.localityInfo.administrative) || [];
    var i;
    for (i = 0; i < admin.length; i++) {
      var name = admin[i] && admin[i].name;
      if (!name) continue;
      if (parts.indexOf(name) >= 0) continue;
      if (name === data.countryName) continue;
      parts.push(name);
    }
    return parts.join('');
  }

  function reverseGeocode(lat, lng, done) {
    var url =
      'https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' +
      encodeURIComponent(lat) +
      '&longitude=' +
      encodeURIComponent(lng) +
      '&localityLanguage=zh';
    var settled = false;
    function finish(addr) {
      if (settled) return;
      settled = true;
      done(addr || coordsLabel(lat, lng));
    }
    var timer = setTimeout(function () {
      finish('');
    }, 6000);
    if (typeof fetch !== 'function') {
      clearTimeout(timer);
      finish('');
      return;
    }
    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        clearTimeout(timer);
        finish(buildZhAddress(data));
      })
      .catch(function () {
        clearTimeout(timer);
        finish('');
      });
  }

  /**
   * 浏览器定位：优先真实坐标 + 逆地理地址；失败用聊城示例点
   */
  function locate(callback) {
    var fallback = {
      lat: 36.4567,
      lng: 115.9876,
      address: '山东省聊城市经济技术开发区蒋官屯街道李官屯新村',
    };
    function done(pos, meta) {
      callback(pos, meta || {});
    }
    if (!navigator.geolocation) {
      if (global.AppLog) global.AppLog.warn('watermark', 'geolocation unsupported');
      done(fallback, { fromGps: false });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        var lat = Number(pos.coords.latitude.toFixed(6));
        var lng = Number(pos.coords.longitude.toFixed(6));
        reverseGeocode(lat, lng, function (address) {
          done(
            { lat: lat, lng: lng, address: address },
            { fromGps: true, geocodeOk: address.indexOf('当前位置') !== 0 }
          );
          if (global.AppLog) {
            global.AppLog.info('watermark', 'locate ok', { lat: lat, lng: lng });
          }
        });
      },
      function (err) {
        if (global.AppLog) {
          global.AppLog.warn('watermark', 'geolocation fail', err && err.message);
        }
        done(fallback, { fromGps: false, error: err && err.code });
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 }
    );
  }

  global.AppWatermark = {
    apply: applyWatermark,
    locate: locate,
    formatNow: formatNow,
    formatDateZh: formatDateZh,
    formatCoordLine: formatCoordLine,
    metaFromIssue: metaFromIssue,
    openPreview: openPreview,
    closePreview: closePreview,
  };
})(window);
