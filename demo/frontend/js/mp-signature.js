/**
 * 电子签名画布（Pointer Events · 固定线宽）
 * 仅用于排查上报（移动端巡查向导 / 管理端新增编辑）；整改反馈不调用。
 * 用法：AppMpSignature.attach({ canvas, onChange })
 */
(function (global) {
  'use strict';

  var LINE_WIDTH = 2.5;
  var PAPER_COLOR = '#faf3dc';
  var RULE_COLOR = 'rgba(154, 132, 78, 0.32)';
  var RULE_GAP = 40;

  function attach(opts) {
    opts = opts || {};
    var canvas = opts.canvas;
    if (!canvas || !canvas.getContext) return null;

    var ctx = canvas.getContext('2d');
    var drawing = false;
    var hasStroke = false;
    var last = null;
    var cssW = 0;
    var cssH = 0;
    var dpr = 1;
    var onChange = typeof opts.onChange === 'function' ? opts.onChange : function () {};

    function notify() {
      onChange(hasStroke);
    }

    function applyStrokeStyle() {
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = LINE_WIDTH;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }

    function readPoint(e) {
      var rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }

    function drawPaperBg() {
      ctx.fillStyle = PAPER_COLOR;
      ctx.fillRect(0, 0, cssW, cssH);
      ctx.save();
      ctx.strokeStyle = RULE_COLOR;
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 7]);
      var y = RULE_GAP;
      while (y < cssH - 12) {
        ctx.beginPath();
        ctx.moveTo(14, y);
        ctx.lineTo(cssW - 14, y);
        ctx.stroke();
        y += RULE_GAP;
      }
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(196, 170, 102, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(14, 28);
      ctx.lineTo(cssW - 14, 28);
      ctx.stroke();
      ctx.restore();
    }

    function readHostSize() {
      var host = canvas.parentElement;
      var cs = global.getComputedStyle(canvas);
      var cssHeight = parseFloat(cs.height);
      if (isNaN(cssHeight) || cssHeight < 1) {
        cssHeight = host ? parseFloat(global.getComputedStyle(host).minHeight) : 0;
      }
      if (isNaN(cssHeight) || cssHeight < 1) cssHeight = 220;

      var width = 0;
      if (host) width = host.getBoundingClientRect().width;
      if (width < 1) width = canvas.getBoundingClientRect().width;
      return {
        width: Math.max(0, Math.floor(width)),
        height: Math.floor(cssHeight),
      };
    }

    function resize() {
      var size = readHostSize();
      cssW = size.width;
      cssH = size.height;
      if (cssW < 1 || cssH < 1) return;
      dpr = global.devicePixelRatio || 1;
      var snapshot = hasStroke ? canvas.toDataURL('image/png') : '';
      /* 勿写死像素宽，否则容器变宽后宣纸仍停在初次宽度 */
      canvas.style.display = 'block';
      canvas.style.width = '100%';
      canvas.style.maxWidth = '100%';
      canvas.style.height = cssH + 'px';
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      drawPaperBg();
      if (snapshot) {
        var img = new Image();
        img.onload = function () {
          ctx.drawImage(img, 0, 0, cssW, cssH);
        };
        img.src = snapshot;
      }
    }

    function drawTo(p) {
      if (!last) {
        last = p;
        ctx.beginPath();
        ctx.arc(p.x, p.y, LINE_WIDTH * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = '#1a1a1a';
        ctx.fill();
        hasStroke = true;
        notify();
        return;
      }
      applyStrokeStyle();
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p;
      hasStroke = true;
      notify();
    }

    function onPointerDown(e) {
      if (e.button != null && e.button !== 0) return;
      drawing = true;
      last = null;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (err) {}
      drawTo(readPoint(e));
      e.preventDefault();
    }

    function onPointerMove(e) {
      if (!drawing) return;
      drawTo(readPoint(e));
      e.preventDefault();
    }

    function endStroke(e) {
      if (!drawing) return;
      drawing = false;
      last = null;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch (err) {}
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', endStroke);
    canvas.addEventListener('pointercancel', endStroke);
    canvas.addEventListener('pointerleave', endStroke);

    var ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(function () {
            resize();
          })
        : null;
    var resizeTarget = canvas.parentElement || canvas;
    var onWindowResize = function () {
      resize();
    };
    if (ro) ro.observe(resizeTarget);
    global.addEventListener('resize', onWindowResize);
    requestAnimationFrame(function () {
      requestAnimationFrame(resize);
    });

    function clear() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      drawPaperBg();
      hasStroke = false;
      last = null;
      notify();
    }

    function load(dataUrl) {
      clear();
      if (!dataUrl) return;
      var img = new Image();
      img.onload = function () {
        ctx.drawImage(img, 0, 0, cssW, cssH);
        hasStroke = true;
        notify();
      };
      img.src = dataUrl;
    }

    return {
      clear: clear,
      load: load,
      isEmpty: function () {
        return !hasStroke;
      },
      toDataURL: function () {
        return hasStroke ? canvas.toDataURL('image/png') : '';
      },
      destroy: function () {
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerup', endStroke);
        canvas.removeEventListener('pointercancel', endStroke);
        canvas.removeEventListener('pointerleave', endStroke);
        if (ro) ro.disconnect();
        global.removeEventListener('resize', onWindowResize);
      },
    };
  }

  global.AppMpSignature = { attach: attach };
})(window);
