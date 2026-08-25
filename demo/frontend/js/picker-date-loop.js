/**
 * 日期滚筒 · 月/日无限循环
 * 12 月下一项为 1 月；当月最后一天下一项为 1 日（配合 openDateCascade 联动年/月）
 * 供 miniapp/m-report、web/report-form-engine 共用
 */
(function (global) {
  'use strict';

  var LOOP_COPIES = 5;

  function colHtmlLoop(opts) {
    var block = opts
      .map(function (o) {
        return '<div class="m-picker__item">' + o.label + '</div>';
      })
      .join('');
    var repeated = '';
    var c;
    for (c = 0; c < LOOP_COPIES; c++) repeated += block;
    return '<div class="m-picker__pad"></div>' + repeated + '<div class="m-picker__pad"></div>';
  }

  function scrollLoopCol(el, logicalIndex, itemCount, itemH) {
    if (!el || itemCount < 1) return;
    var middle = Math.floor(LOOP_COPIES / 2);
    el.scrollTop = (middle * itemCount + logicalIndex) * itemH;
  }

  function markActiveLoop(el, logicalIndex, itemCount) {
    if (!el || itemCount < 1) return;
    var items = el.querySelectorAll('.m-picker__item');
    var middle = Math.floor(LOOP_COPIES / 2);
    var domIdx = middle * itemCount + logicalIndex;
    items.forEach(function (node, i) {
      node.classList.toggle('is-active', i === domIdx);
    });
  }

  /** @returns {number} 逻辑索引 0 … itemCount-1 */
  function snapLoopCol(el, itemCount, itemH) {
    if (!el || itemCount < 1) return 0;
    var rawIdx = Math.round(el.scrollTop / itemH);
    var logicalIdx = ((rawIdx % itemCount) + itemCount) % itemCount;
    scrollLoopCol(el, logicalIdx, itemCount, itemH);
    markActiveLoop(el, logicalIdx, itemCount);
    return logicalIdx;
  }

  global.HSFPickerDateLoop = {
    LOOP_COPIES: LOOP_COPIES,
    colHtmlLoop: colHtmlLoop,
    scrollLoopCol: scrollLoopCol,
    snapLoopCol: snapLoopCol,
    markActiveLoop: markActiveLoop,
  };
})(window);
