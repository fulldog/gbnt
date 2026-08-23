/**
 * 系统管理页：Toast、存储初始化、筛选栏
 */
(function (global) {
  if (global.LadsStorage && global.LadsStorage.ensure) {
    global.LadsStorage.ensure();
  }

  if (global.LadsBus && typeof Toast !== "undefined") {
    global.LadsBus.on("toast", function (payload) {
      Toast.show((payload && payload.text) || "");
    });
  }

  if (!global.LadsUi) return;
  if (!global.LadsUi.alert) {
    global.LadsUi.alert = function (message) {
      global.LadsUi.showModal({
        title: "提示",
        body: '<p class="muted">' + global.LadsUi.escapeHtml(message) + "</p>",
        cancelText: "关闭",
        okText: "确定",
      });
    };
  }
})(window);
