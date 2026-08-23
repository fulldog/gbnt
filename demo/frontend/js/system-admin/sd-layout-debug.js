/**
 * 数据字典 · 布局/样式监听日志（控制台过滤 [dict-layout]）
 */
(function (global) {
  "use strict";

  var WATCH_SEL =
    ".sys-dict-page .content-container, #sys-admin-root, .sys-dict-root, .sd-shell, .dm-right.sys-dict-main, #combined-table-sd, #section-table-body, #combined-table-sd .fixed-table-container, #section-pagination, .sys-dict-left";

  function pick(sel) {
    return document.querySelector(sel);
  }

  function nodeMetrics(el) {
    if (!el) return null;
    var r = el.getBoundingClientRect();
    var st = window.getComputedStyle(el);
    return {
      h: Math.round(r.height),
      w: Math.round(r.width),
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      flex: st.flex,
      display: st.display,
      overflow: st.overflow,
      minHeight: st.minHeight,
      pointerEvents: st.pointerEvents,
      zIndex: st.zIndex,
      position: st.position,
    };
  }

  function snapshot(reason) {
    var nodes = {
      content: pick(".sys-dict-page .content-container.sd-page"),
      root: document.getElementById("sys-admin-root"),
      dictRoot: pick("#sys-admin-root > .sys-dict-root"),
      shell: pick(".sd-shell"),
      left: pick(".sys-dict-left"),
      main: pick(".dm-right.sys-dict-main"),
      filterPanel: pick(".sys-dict-main > .dm-panel--filters"),
      filterBar: pick("#sdFilterBar"),
      box: pick("#combined-table-sd"),
      tableBody: document.getElementById("section-table-body"),
      scroll: pick("#combined-table-sd .fixed-table-container"),
      pagi: document.getElementById("section-pagination"),
    };
    var out = {
      reason: reason || "snapshot",
      viewportH: Math.round(window.innerHeight),
      viewportW: Math.round(window.innerWidth),
    };
    Object.keys(nodes).forEach(function (key) {
      out[key] = nodeMetrics(nodes[key]);
    });
    var blocking = [];
    document.querySelectorAll(".v52-modal-overlay").forEach(function (el, i) {
      var st = window.getComputedStyle(el);
      if (st.display !== "none" && st.visibility !== "hidden" && st.pointerEvents !== "none") {
        var r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) blocking.push({ i: i, id: el.id || null, z: st.zIndex });
      }
    });
    if (blocking.length) out.openModals = blocking;
    console.log("[dict-layout]", out);
    return out;
  }

  function startWatch(intervalMs) {
    stopWatch();
    var last = "";
    global._sdLayoutWatchTimer = setInterval(function () {
      var snap = snapshot("watch");
      var key = JSON.stringify(snap);
      if (key !== last) {
        last = key;
        console.log("[dict-layout] changed", snap.reason);
      }
    }, intervalMs || 2000);
    console.log("[dict-layout] watch started (" + (intervalMs || 2000) + "ms)");
  }

  function stopWatch() {
    if (global._sdLayoutWatchTimer) {
      clearInterval(global._sdLayoutWatchTimer);
      global._sdLayoutWatchTimer = null;
      console.log("[dict-layout] watch stopped");
    }
  }

  global.SdLayoutDebug = {
    snapshot: snapshot,
    startWatch: startWatch,
    stopWatch: stopWatch,
    selectors: WATCH_SEL,
  };
})(window);
