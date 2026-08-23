(function (global) {
  function createEventBus() {
    var events = {};
    return {
      on: function (type, handler) {
        if (!events[type]) events[type] = [];
        events[type].push(handler);
        return function () {
          events[type] = (events[type] || []).filter(function (fn) {
            return fn !== handler;
          });
        };
      },
      emit: function (type, payload) {
        (events[type] || []).forEach(function (handler) {
          handler(payload);
        });
      },
    };
  }

  global.LadsBus = createEventBus();
})(window);
