/**
 * 系统管理本地存储（从低空防御 LadsStorage 精简，仅 sys* 与操作日志）
 */
(function (global) {
  var PREFIX = "hsf:sys.v1.";
  var SCHEMA_KEY = PREFIX + "schema";
  var CURRENT_SCHEMA = 12;

  function buildSeedPayload() {
    if (global.HSFSysSeed && global.HSFSysSeed.buildSeed) {
      return global.HSFSysSeed.buildSeed();
    }
    return { logs: [], sysUsers: [], sysRoles: [], sysDepartments: [] };
  }
  var LEGACY_ROLE_NAME_MAP = {
    系统管理员: "系统管理员",
    街道管理员: "街道管理员",
    村级工作人员: "村级工作人员",
    只读用户: "只读用户",
    资产管理员: "街道管理员",
    合同管理员: "街道管理员",
    财务专员: "村级工作人员",
  };

  function getKey(name) {
    return PREFIX + name;
  }

  function get(name, fallback) {
    var raw = localStorage.getItem(getKey(name));
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function set(name, value) {
    localStorage.setItem(getKey(name), JSON.stringify(value));
  }

  function mapRoleName(name) {
    var s = name != null ? String(name).trim() : "";
    return LEGACY_ROLE_NAME_MAP[s] || s;
  }

  function isLegacyRoleList(roles) {
    if (!Array.isArray(roles) || !roles.length) return true;
    return roles.some(function (r) {
      return r && LEGACY_ROLE_NAME_MAP[r.name];
    });
  }

  function applyHsfSeed() {
    var seed = buildSeedPayload();
    Object.keys(seed).forEach(function (name) {
      set(name, seed[name]);
    });
  }

  function migrate(fromSchema) {
    if (fromSchema < CURRENT_SCHEMA) {
      applyHsfSeed();
    }
  }

  function ensure() {
    var schemaRaw = localStorage.getItem(SCHEMA_KEY);
    if (!schemaRaw) {
      applyHsfSeed();
      localStorage.setItem(SCHEMA_KEY, String(CURRENT_SCHEMA));
      if (global.HSFSysSeed && global.HSFSysSeed.syncStaffFromSysUsers) {
        global.HSFSysSeed.syncStaffFromSysUsers();
      }
      return;
    }
    var ver = Number(schemaRaw) || 1;
    if (ver < CURRENT_SCHEMA) {
      migrate(ver);
      localStorage.setItem(SCHEMA_KEY, String(CURRENT_SCHEMA));
      if (global.HSFSysSeed && global.HSFSysSeed.syncStaffFromSysUsers) {
        global.HSFSysSeed.syncStaffFromSysUsers();
      }
    }
  }

  function upsertArray(name, idKey, item) {
    var list = get(name, []);
    var index = list.findIndex(function (it) {
      return it[idKey] === item[idKey];
    });
    if (index >= 0) list[index] = item;
    else list.unshift(item);
    set(name, list);
    return item;
  }

  function removeArray(name, idKey, id) {
    var list = get(name, []).filter(function (it) {
      return it[idKey] !== id;
    });
    set(name, list);
  }

  function appendLog(action, detail) {
    var logs = get("logs", []);
    logs.unshift({
      id: "LOG-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
      action: action,
      detail: detail,
      operator: "admin",
      time: Date.now(),
    });
    set("logs", logs.slice(0, 300));
  }

  global.LadsStorage = {
    ensure: ensure,
    get: get,
    set: set,
    upsertArray: upsertArray,
    removeArray: removeArray,
    appendLog: appendLog,
    getKey: getKey,
  };
})(window);
