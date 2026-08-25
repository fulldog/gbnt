/**
 * 项目编号规则（移动端巡查 · 管理端新增/编辑须对齐）
 *
 * 1. 界面标签：项目编号（数据字段仍为 issue.code）
 * 2. 自动填充格式：{问题类型中文名}{序号}号
 *    例：机井 → 机井01号；道路 → 道路01号（类型名见 AppData.TYPE_LABEL）
 * 3. 序号位数：至少 2 位（01–99）；满 100 起至少 3 位（100–999）；满 1000 起至少 4 位，以此类推
 * 4. 自动填充仅为建议，用户可在输入框内修改
 * 5. 下次建议序号：清单中已有编号里，同类型前缀且符合「{类型名}{数字}号」的最大序号 + 1
 *    例：已提交 机井01号 后，再次进入巡查页（类型为机井）默认 机井02号
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

  function build(type, seq) {
    var label = typeLabel(type);
    if (!label) return '';
    return label + formatSeq(seq) + '号';
  }

  /** 解析「{类型名}{数字}号」，不匹配返回 null */
  function parse(code, type) {
    var label = typeof type === 'string' && TYPE_LABEL[type] == null && type.indexOf('号') < 0
      ? type
      : typeLabel(type);
    var c = String(code || '').trim();
    if (!c || !label || c.indexOf(label) !== 0) return null;
    var m = c.slice(label.length).match(/^(\d+)号$/);
    if (!m) return null;
    return parseInt(m[1], 10);
  }

  function maxSeqForType(type) {
    var label = typeLabel(type);
    if (!label) return 0;
    var max = 0;
    getIssues().forEach(function (issue) {
      var seq = parse(issue.code, label);
      if (seq != null && seq > max) max = seq;
    });
    return max;
  }

  function suggest(type) {
    return build(type, maxSeqForType(type) + 1);
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
    parse: parse,
    maxSeqForType: maxSeqForType,
    suggest: suggest,
    isTaken: isTaken,
  };
})(window);
