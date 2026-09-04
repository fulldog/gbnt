/**
 * 设施编号规则（移动端巡查 · 管理端新增/编辑须对齐）
 *
 * 1. 界面标签：设施编号（数据字段仍为 issue.code）
 * 2. 自动填充格式：{序号}号（不含问题类型前缀）
 *    例：01号、02号、06号
 * 3. 序号位数：至少 2 位（01–99）；满 100 起至少 3 位（100–999）；满 1000 起至少 4 位，以此类推
 * 4. 自动填充仅为建议，用户可在输入框内修改
 * 5. 下次建议序号：清单中已有编号（含旧版「{类型名}{数字}号」）的最大序号 + 1
 * 6. 提交校验：issue.code 全库不可重复（trim 后精确匹配，不分类型）
 */
(function (global) {
  'use strict';

  var TYPE_LABEL = {
    well: '机井',
    road: '道路',
    bridge: '桥涵闸',
    forest: '林网',
    transformer: '变压器',
  };

  function typeLabel(type) {
    if (global.AppData && global.AppData.TYPE_LABEL && global.AppData.TYPE_LABEL[type]) {
      return global.AppData.TYPE_LABEL[type];
    }
    return TYPE_LABEL[type] || '';
  }

  function allTypeLabels() {
    var labels = {};
    Object.keys(TYPE_LABEL).forEach(function (key) {
      var label = typeLabel(key);
      if (label) labels[label] = true;
    });
    if (global.AppData && global.AppData.TYPE_LABEL) {
      Object.keys(global.AppData.TYPE_LABEL).forEach(function (key) {
        var lbl = global.AppData.TYPE_LABEL[key];
        if (lbl) labels[lbl] = true;
      });
    }
    return Object.keys(labels);
  }

  function getIssues() {
    if (global.AppData && typeof global.AppData.getIssues === 'function') {
      return global.AppData.getIssues() || [];
    }
    if (global.AppStorage) {
      return global.AppStorage.get('issues', []) || [];
    }
    return [];
  }

  /** 序号位数：至少 2 位，100→3 位，1000→4 位… */
  function formatSeq(n) {
    var num = parseInt(n, 10);
    if (isNaN(num) || num < 1) num = 1;
    var width = Math.max(2, String(num).length);
    return String(num).padStart(width, '0');
  }

  function build(seq) {
    return formatSeq(seq) + '号';
  }

  /** 解析「{数字}号」或旧版「{类型名}{数字}号」，不匹配返回 null */
  function parseSeq(code) {
    var c = String(code || '').trim();
    if (!c) return null;
    var plain = c.match(/^(\d+)号$/);
    if (plain) return parseInt(plain[1], 10);
    var labels = allTypeLabels();
    var i;
    for (i = 0; i < labels.length; i++) {
      var label = labels[i];
      if (c.indexOf(label) !== 0) continue;
      var legacy = c.slice(label.length).match(/^(\d+)号$/);
      if (legacy) return parseInt(legacy[1], 10);
    }
    return null;
  }

  /** @deprecated 兼容旧调用 parse(code, type) */
  function parseLegacy(code, type) {
    return parseSeq(code);
  }

  function maxSeq() {
    var max = 0;
    getIssues().forEach(function (issue) {
      var seq = parseSeq(issue.code);
      if (seq != null && seq > max) max = seq;
    });
    return max;
  }

  /** type 参数保留兼容，序号全库递增 */
  function suggest(type) {
    void type;
    return build(maxSeq() + 1);
  }

  function isTaken(code, excludeId) {
    var c = String(code || '').trim();
    if (!c) return false;
    return getIssues().some(function (issue) {
      if (excludeId && issue.id === excludeId) return false;
      return String(issue.code || '').trim() === c;
    });
  }

  global.AppProjectCode = {
    typeLabel: typeLabel,
    formatSeq: formatSeq,
    build: build,
    parse: parseLegacy,
    parseSeq: parseSeq,
    maxSeq: maxSeq,
    maxSeqForType: maxSeq,
    suggest: suggest,
    isTaken: isTaken,
  };
})(window);
