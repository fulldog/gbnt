/**
 * 移动端图片格 · 加载骨架（对齐 PFF loading-skeleton-v73 扫光）
 * 待办列表、巡查详情等共用
 */
(function (global) {
  'use strict';

  function escAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;');
  }

  /**
   * @param {string} src
   * @param {{ extraClass?: string, imgAttrs?: string }} [opts]
   */
  function mediaCellHtml(src, opts) {
    opts = opts || {};
    var extraClass = opts.extraClass || '';
    var imgAttrs = opts.imgAttrs || '';
    if (!src) {
      return (
        '<div class="m-media is-empty' +
        (extraClass ? ' ' + extraClass : '') +
        '">' +
        '<span class="m-media__ph" aria-hidden="true">img</span></div>'
      );
    }
    return (
      '<div class="m-media is-loading' +
      (extraClass ? ' ' + extraClass : '') +
      '">' +
      '<span class="m-media__ph" aria-hidden="true">img</span>' +
      '<div class="m-media__skel" aria-hidden="true"></div>' +
      '<img src="' +
      escAttr(src) +
      '" alt="" loading="lazy"' +
      imgAttrs +
      ' /></div>'
    );
  }

  function bindMedia(root) {
    if (!root) return;
    root.querySelectorAll('.m-media img').forEach(function (img) {
      var wrap = img.closest('.m-media');
      if (!wrap) return;
      function done(ok) {
        if (ok) {
          wrap.classList.remove('is-loading', 'is-error');
          wrap.classList.add('is-ready');
          return;
        }
        wrap.classList.remove('is-ready');
        wrap.classList.add('is-error', 'is-loading');
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

  global.AppMpMedia = {
    mediaCellHtml: mediaCellHtml,
    bindMedia: bindMedia,
  };
})(window);
