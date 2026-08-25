/**
 * 机井「是否出水」现场取证 · 全项目唯一特殊规则
 *
 * 业务目的：确认上报人在现场实拍，且机井确实出水（≥5 分钟由现场人员判定；
 * 系统用两次拍照间隔约束连续在场）。
 *
 * 规则（移动端上报 / 管理端录入须一致）：
 * 1. 仅「机井是否出水 = 是」时启用；其他题型仍走 AppMpPhotos 常规逻辑。
 * 2. 至少 2 张照片；仅允许摄像头拍照，禁止相册上传（一点击即请求摄像头权限）。
 * 3. 每张照片入库前烧录水印（地址 + 坐标 + 拍摄时间）；缩略图即带水印。
 * 4. 以第一张照片水印时间 firstCapturedAt 为基准，须间隔 ≥ MIN_INTERVAL_MS（2 分钟）
 *    才允许拍第二张及之后；间隔内添加位显示倒计时，不可点击。
 * 5. 删除第一张照片时清空 firstCapturedAt，倒计时重置。
 *
 * 对外 API（管理端 rectify 等复用）：
 *   AppWellWaterPhotos.MIN_PHOTOS
 *   AppWellWaterPhotos.MIN_INTERVAL_MS
 *   AppWellWaterPhotos.canTakeNextPhoto(firstCapturedAt, now?)
 *   AppWellWaterPhotos.remainingMs(firstCapturedAt, now?)
 *   AppWellWaterPhotos.formatCountdown(remainMs)
 *   AppWellWaterPhotos.validateProof(photos, photoProof)
 *   AppWellWaterPhotos.attach({ el, photos, photoProof, previewMeta, onChange, max })
 */
(function (global) {
  'use strict';

  /** 第一张照片与第二张之间最短间隔（毫秒） */
  var MIN_INTERVAL_MS = 2 * 60 * 1000;

  /** 出水取证最少张数 */
  var MIN_PHOTOS = 2;

  function parseTime(input) {
    if (!input) return null;
    var d = input instanceof Date ? input : new Date(input);
    return isNaN(d.getTime()) ? null : d.getTime();
  }

  function canTakeNextPhoto(firstCapturedAt, now) {
    var first = parseTime(firstCapturedAt);
    if (!first) return true;
    var t = now != null ? now : Date.now();
    return t - first >= MIN_INTERVAL_MS;
  }

  function remainingMs(firstCapturedAt, now) {
    var first = parseTime(firstCapturedAt);
    if (!first) return 0;
    var t = now != null ? now : Date.now();
    return Math.max(0, MIN_INTERVAL_MS - (t - first));
  }

  function formatCountdown(remainMs) {
    var sec = Math.max(0, Math.ceil(remainMs / 1000));
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  /**
   * @param {string[]} photos
   * @param {{ firstCapturedAt?: string|null }} photoProof
   * @returns {{ ok: boolean, message?: string }}
   */
  function validateProof(photos, photoProof) {
    photos = photos || [];
    photoProof = photoProof || {};
    if (photos.length < MIN_PHOTOS) {
      return { ok: false, message: '出水取证须至少拍摄 ' + MIN_PHOTOS + ' 张照片' };
    }
    return { ok: true };
  }

  function countdownState(photoProof, photoCount, enforceInterval) {
    if (!enforceInterval) return { mode: 'add' };
    if (!photoProof || !photoProof.firstCapturedAt || photoCount < 1) {
      return { mode: 'add' };
    }
    var remain = remainingMs(photoProof.firstCapturedAt);
    if (remain <= 0) return { mode: 'add' };
    return { mode: 'countdown', remainMs: remain };
  }

  /**
   * @param {object} opts
   * @param {HTMLElement} opts.el
   * @param {string[]} opts.photos 可变数组，存已烧水印 dataURL
   * @param {{ firstCapturedAt: string|null }} opts.photoProof 可变对象，持久化到 wellQuizData
   * @param {function} opts.previewMeta 返回 { address, lat, lng }
   * @param {function} [opts.onChange]
   * @param {number} [opts.max]
   * @param {boolean} [opts.enforceInterval=true] 是否限制两张照片最短间隔（管理端可关）
   * @param {boolean} [opts.cameraOnly=true] 是否仅允许摄像头
   */
  function attach(opts) {
    opts = opts || {};
    if (!global.AppMpPhotos || typeof AppMpPhotos.attach !== 'function') {
      if (global.AppLog) AppLog.error('well-water-photos', 'AppMpPhotos 未加载');
      return null;
    }
    var photoProof = opts.photoProof || { firstCapturedAt: null };
    var enforceInterval = opts.enforceInterval !== false;
    var cameraOnly = opts.cameraOnly !== false;
    var timerId = null;
    var strip = null;

    function clearTimer() {
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
    }

    function syncTimer() {
      clearTimer();
      var st = countdownState(photoProof, opts.photos.length, enforceInterval);
      if (st.mode !== 'countdown') return;
      timerId = setInterval(function () {
        var next = countdownState(photoProof, opts.photos.length, enforceInterval);
        if (next.mode !== 'countdown') clearTimer();
        if (strip && strip.render) strip.render();
        if (typeof opts.onChange === 'function') opts.onChange();
      }, 1000);
    }

    strip = AppMpPhotos.attach({
      el: opts.el,
      photos: opts.photos,
      max: opts.max || 6,
      logScope: 'well-water-photos',
      cameraOnly: cameraOnly,
      previewBaked: true,
      previewMeta: opts.previewMeta,
      onChange: function () {
        syncTimer();
        if (typeof opts.onChange === 'function') opts.onChange();
      },
      onDelete: function (idx) {
        if (idx === 0) photoProof.firstCapturedAt = null;
        syncTimer();
      },
      getAddButton: function (ctx) {
        var st = countdownState(photoProof, ctx.length, enforceInterval);
        if (st.mode === 'countdown') {
          return (
            '<button type="button" class="m-report__add m-report__add--countdown" data-act="countdown" aria-label="等待继续拍照">' +
            '<span class="m-report__add-countdown">' +
            formatCountdown(st.remainMs) +
            '</span></button>'
          );
        }
        return (
          '<button type="button" class="m-report__add" data-act="add" aria-label="' +
          (cameraOnly ? '拍照' : '添加照片') +
          '">' +
          '<span data-icon="plus" aria-hidden="true"></span></button>'
        );
      },
      afterCapture: function (dataUrl) {
        if (!global.AppWatermark || typeof AppWatermark.apply !== 'function') {
          return Promise.resolve(dataUrl);
        }
        var capturedAt = new Date();
        var meta =
          typeof opts.previewMeta === 'function' ? opts.previewMeta() || {} : {};
        meta.time = AppWatermark.formatDateZh(capturedAt);
        return AppWatermark.apply(dataUrl, meta).then(function (baked) {
          var at = capturedAt.toISOString();
          if (!photoProof.firstCapturedAt) {
            photoProof.firstCapturedAt = at;
            if (global.AppLog) {
              AppLog.info('well-water-photos', 'first proof photo', { at: at });
            }
          }
          photoProof.lastCapturedAt = at;
          return baked;
        });
      },
    });

    syncTimer();

    var origDestroy = strip.destroy;
    strip.destroy = function () {
      clearTimer();
      origDestroy();
    };

    return strip;
  }

  global.AppWellWaterPhotos = {
    MIN_PHOTOS: MIN_PHOTOS,
    MIN_INTERVAL_MS: MIN_INTERVAL_MS,
    canTakeNextPhoto: canTakeNextPhoto,
    remainingMs: remainingMs,
    formatCountdown: formatCountdown,
    validateProof: validateProof,
    attach: attach,
  };
})(window);
