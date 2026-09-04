/**
 * 演示栈 B：提交前压缩 DataURL，避免 localStorage 配额溢出
 */
(function (global) {
  'use strict';

  function compressDataUrl(dataUrl, opts) {
    opts = opts || {};
    var maxW = opts.maxWidth || 1280;
    var quality = opts.quality != null ? opts.quality : 0.72;
    var mime = opts.mime || 'image/jpeg';

    return new Promise(function (resolve) {
      if (!dataUrl || String(dataUrl).indexOf('data:image') !== 0) {
        resolve(dataUrl || '');
        return;
      }
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth || img.width;
          var h = img.naturalHeight || img.height;
          if (!w || !h) {
            resolve(dataUrl);
            return;
          }
          if (w > maxW) {
            h = Math.round(h * (maxW / w));
            w = maxW;
          }
          var canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          var ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(dataUrl);
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          var out = canvas.toDataURL(mime, quality);
          resolve(out.length < dataUrl.length ? out : dataUrl);
        } catch (err) {
          if (global.AppLog) AppLog.warn('image-compress', 'compress failed', err);
          resolve(dataUrl);
        }
      };
      img.onerror = function () {
        resolve(dataUrl);
      };
      img.src = dataUrl;
    });
  }

  function compressList(urls, opts) {
    urls = urls || [];
    var out = [];
    var i = 0;
    function next() {
      if (i >= urls.length) return Promise.resolve(out);
      return compressDataUrl(urls[i++], opts).then(function (c) {
        if (c) out.push(c);
        return next();
      });
    }
    return next();
  }

  function compressQuizSteps(quizSteps, opts) {
    quizSteps = quizSteps || {};
    var fields = Object.keys(quizSteps);
    var i = 0;
    function nextField() {
      if (i >= fields.length) return Promise.resolve(quizSteps);
      var slot = quizSteps[fields[i++]];
      if (!slot || !slot.photos || !slot.photos.length) return nextField();
      return compressList(slot.photos, opts).then(function (list) {
        slot.photos = list;
        return nextField();
      });
    }
    return nextField();
  }

  /** 压缩 issue 入库图：列表图、签名、各题 quizSteps.photos */
  function compressIssuePayload(payload, opts) {
    opts = opts || { maxWidth: 1280, quality: 0.72 };
    payload = payload || {};
    return compressList(payload.photos, opts)
      .then(function (photos) {
        payload.photos = photos;
        payload.photoSrc = photos[0] || '';
        return compressDataUrl(payload.reporterSignature, {
          maxWidth: opts.signatureMaxWidth || 960,
          quality: opts.signatureQuality != null ? opts.signatureQuality : 0.85,
        });
      })
      .then(function (sig) {
        if (sig) payload.reporterSignature = sig;
        var blocks = ['well', 'road', 'bridge', 'forest', 'transformer'];
        var bi = 0;
        function nextBlock() {
          if (bi >= blocks.length) return Promise.resolve(payload);
          var key = blocks[bi++];
          if (!payload[key] || !payload[key].quizSteps) return nextBlock();
          return compressQuizSteps(payload[key].quizSteps, opts).then(nextBlock);
        }
        return nextBlock();
      });
  }

  global.AppImageCompress = {
    compressDataUrl: compressDataUrl,
    compressList: compressList,
    compressQuizSteps: compressQuizSteps,
    compressIssuePayload: compressIssuePayload,
  };
})(window);
