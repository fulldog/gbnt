/**
 * localStorage 统一封装 · 键名前缀 hsf:
 */
(function (global) {
  var PREFIX =
    (global.AppConfig && global.AppConfig.storagePrefix) || 'hsf:';

  function fullKey(key) {
    if (!key) return PREFIX;
    return key.indexOf(PREFIX) === 0 ? key : PREFIX + key;
  }

  function get(key, fallback) {
    try {
      var raw = localStorage.getItem(fullKey(key));
      if (raw == null || raw === '') return fallback;
      return JSON.parse(raw);
    } catch (err) {
      if (global.AppLog) global.AppLog.warn('storage', '解析失败 ' + key, err);
      return fallback;
    }
  }

  function set(key, value) {
    try {
      localStorage.setItem(fullKey(key), JSON.stringify(value));
      return true;
    } catch (err) {
      if (global.AppLog) global.AppLog.error('storage', '写入失败 ' + key, err);
      return false;
    }
  }

  function remove(key) {
    localStorage.removeItem(fullKey(key));
  }

  function clearPrefix() {
    var keys = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(PREFIX) === 0) keys.push(k);
    }
    keys.forEach(function (k) {
      localStorage.removeItem(k);
    });
    if (global.AppLog) global.AppLog.info('storage', '已清空前缀 ' + PREFIX, keys.length);
  }

  global.AppStorage = {
    prefix: PREFIX,
    get: get,
    set: set,
    remove: remove,
    clearPrefix: clearPrefix,
  };
})(window);
