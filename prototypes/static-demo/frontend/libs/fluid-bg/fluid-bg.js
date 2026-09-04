/**
 * AMP 移动端 · app-host 美学流体背景（Color4Bg）
 * 官方嵌入用法：dom 为宿主元素 id（不含 #）
 */
(function (global) {
  'use strict';

  var HOST_ID = 'appHost';
  var instance = null;

  function initFluidBg() {
    if (!global.Color4Bg) return;

    var host = document.getElementById(HOST_ID);
    if (!host) return;

    if (document.getElementById('colorbgcanvas')) return;

    var BgClass = global.Color4Bg.AestheticFluidBg || global.Color4Bg['美学流体Bg'];
    if (!BgClass) {
      console.warn('[AMP] Color4Bg 美学流体背景类未找到');
      return;
    }

    if (instance && typeof instance.destroy === 'function') {
      instance.destroy();
    }

    instance = new BgClass({
      dom: HOST_ID,
      colors: ['#d4d4d4', '#ffffff', '#cfcfce', '#e8e8e8', '#ebebeb', '#f0f0f0'],
      loop: true,
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFluidBg);
  } else {
    initFluidBg();
  }

  global.AMPApp = global.AMPApp || {};
  global.AMPApp.initFluidBg = initFluidBg;
})(window);
