/**
 * 全局日志 AppLog
 */
(function (global) {
  var MAX = 300;
  var buffer = [];
  var STYLE = {
    debug: 'color:#8c8c8c',
    info: 'color:#015cbb;font-weight:600',
    warn: 'color:#d48806;font-weight:600',
    error: 'color:#cf1322;font-weight:700',
  };

  function now() {
    var d = new Date();
    function pad(n) {
      return String(n).padStart(2, '0');
    }
    return (
      pad(d.getHours()) +
      ':' +
      pad(d.getMinutes()) +
      ':' +
      pad(d.getSeconds()) +
      '.' +
      String(d.getMilliseconds()).padStart(3, '0')
    );
  }

  function print(level, scope, message, detail) {
    var entry = {
      time: now(),
      level: level,
      scope: scope || 'app',
      message: message == null ? '' : String(message),
      detail: detail,
    };
    buffer.push(entry);
    if (buffer.length > MAX) buffer.shift();
    var label = '%c[HSF ' + entry.time + '][' + entry.level.toUpperCase() + '][' + entry.scope + ']';
    var fn = console.log;
    if (level === 'warn' && console.warn) fn = console.warn;
    if (level === 'error' && console.error) fn = console.error;
    if (level === 'debug' && console.debug) fn = console.debug;
    if (typeof detail === 'undefined') {
      fn.call(console, label + ' ' + entry.message, STYLE[level] || '');
    } else {
      fn.call(console, label + ' ' + entry.message, STYLE[level] || '', detail);
    }
  }

  global.addEventListener('error', function (e) {
    print('error', 'window', e.message || 'error', e.error);
  });
  global.addEventListener('unhandledrejection', function (e) {
    print('error', 'promise', String(e.reason), e.reason);
  });

  global.AppLog = {
    debug: function (s, m, d) {
      print('debug', s, m, d);
    },
    info: function (s, m, d) {
      print('info', s, m, d);
    },
    warn: function (s, m, d) {
      print('warn', s, m, d);
    },
    error: function (s, m, d) {
      print('error', s, m, d);
    },
    dump: function () {
      console.table(buffer);
      return buffer.slice();
    },
    clear: function () {
      buffer = [];
    },
  };
})(window);
