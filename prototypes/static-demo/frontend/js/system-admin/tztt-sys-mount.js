/**
 * 按 data-module 挂载 LadsModules 页面
 */
(function (global) {
  function initFilterBars(root) {
    if (!global.FilterBar) return;
    (root || document).querySelectorAll(".filter-bar").forEach(function (el) {
      global.FilterBar.init(el);
    });
  }

  function mount() {
    var root = document.getElementById("sys-admin-root");
    if (!root) return;
    var key = root.getAttribute("data-module");
    var mod = key && global.LadsModules && global.LadsModules[key];
    if (!mod || typeof mod.render !== "function") return;
    root.innerHTML = "";
    mod.render(root);
    initFilterBars(root);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})(window);
