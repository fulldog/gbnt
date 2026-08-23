/**
 * 专项整改 xlsx 导入导出（模板对齐街道专项排查台账）
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

  var LABEL_TYPE = {
    机井: 'well',
    道路: 'road',
    桥涵: 'bridge',
    桥涵闸: 'bridge',
    林网: 'forest',
    变压器: 'transformer',
  };

  var UNIFIED_HEADERS = [
    '类型',
    '编号',
    '街道',
    '村/社区',
    '项目名称',
    '整改责任人',
    '联系电话',
    '计划整改完成时间',
    '整改状态',
    '整改措施',
    '问题描述',
  ];

  function ensureXlsx() {
    if (!global.XLSX) {
      global.AppUI && global.AppUI.toast('表格组件未加载', 'error');
      return false;
    }
    return true;
  }

  function measuresOf(item) {
    return (
      (item && (item.measures || item.rectifyPlan || (item.well && item.well.rectifyMeasure))) ||
      ''
    );
  }

  function statusLabel(status) {
    return global.AppData && global.AppData.STATUS_LABEL
      ? global.AppData.STATUS_LABEL[status] || status
      : status === 'done'
        ? '已整改'
        : '待整改';
  }

  function parseStatus(val) {
    var s = String(val || '').trim();
    if (s === '已整改' || s === 'done') return 'done';
    return 'pending';
  }

  function parseType(val, sheetName) {
    var s = String(val || '').trim();
    if (LABEL_TYPE[s]) return LABEL_TYPE[s];
    if (sheetName === '机井') return 'well';
    if (sheetName === '道路') return 'road';
    if (sheetName === '桥涵' || sheetName === '桥涵闸') return 'bridge';
    return 'well';
  }

  function cellStr(row, idx) {
    if (!row || idx < 0) return '';
    var v = row[idx];
    if (v == null) return '';
    return String(v).trim();
  }

  function findHeaderRow(rows, mustHave) {
    for (var i = 0; i < rows.length; i++) {
      var line = (rows[i] || []).map(function (c) {
        return String(c || '').trim();
      });
      var ok = mustHave.every(function (key) {
        return line.some(function (c) {
          return c.indexOf(key) !== -1;
        });
      });
      if (ok) return { index: i, cells: line };
    }
    return null;
  }

  function colIndex(headers, names) {
    for (var i = 0; i < headers.length; i++) {
      var h = headers[i];
      for (var j = 0; j < names.length; j++) {
        if (h.indexOf(names[j]) !== -1) return i;
      }
    }
    return -1;
  }

  function issueFromUnifiedRow(row, headers) {
    var typeIdx = colIndex(headers, ['类型']);
    var codeIdx = colIndex(headers, ['编号']);
    var streetIdx = colIndex(headers, ['街道']);
    var villageIdx = colIndex(headers, ['村']);
    var projectIdx = colIndex(headers, ['项目名称']);
    var assigneeIdx = colIndex(headers, ['整改责任人', '整改负责人', '负责人']);
    var phoneIdx = colIndex(headers, ['联系电话', '电话', '联系方式']);
    var planIdx = colIndex(headers, ['计划整改完成', '计划完成']);
    var statusIdx = colIndex(headers, ['整改状态', '是否完成']);
    var measureIdx = colIndex(headers, ['整改措施']);
    var descIdx = colIndex(headers, ['问题描述']);

    var type = parseType(cellStr(row, typeIdx), '');
    var code = cellStr(row, codeIdx);
    if (!code && !cellStr(row, streetIdx) && !cellStr(row, villageIdx)) return null;

    return {
      type: type,
      code: code || 'import-' + Date.now(),
      street: cellStr(row, streetIdx) || '蒋官屯街道',
      village: cellStr(row, villageIdx),
      projectName: cellStr(row, projectIdx) || '高标农田建设项目',
      assigneeName: cellStr(row, assigneeIdx) || '王建华',
      assigneePhone: cellStr(row, phoneIdx),
      planDate: cellStr(row, planIdx),
      status: statusIdx >= 0 ? parseStatus(cellStr(row, statusIdx)) : 'pending',
      measures: cellStr(row, measureIdx) || '按台账要求整改',
      description: cellStr(row, descIdx) || '导入问题',
      reporterName: '导入',
      address: '山东省聊城市经济技术开发区',
      lat: 36.4567,
      lng: 115.9876,
    };
  }

  function parseUnifiedSheet(sheet) {
    var rows = global.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (!rows.length) return [];
    var headerInfo = findHeaderRow(rows, ['街道', '村']);
    if (!headerInfo) return [];
    var out = [];
    for (var r = headerInfo.index + 1; r < rows.length; r++) {
      var row = rows[r];
      if (!row || !row.some(function (c) {
        return String(c || '').trim() !== '';
      })) continue;
      var first = String(row[0] || '').trim();
      if (first.indexOf('备注') === 0) break;
      var item = issueFromUnifiedRow(row, headerInfo.cells);
      if (item) out.push(item);
    }
    return out;
  }

  function parseLedgerSheet(sheet, sheetName) {
    var rows = global.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    var headerInfo = findHeaderRow(rows, ['街道', '村']);
    if (!headerInfo) return [];
    var headers = headerInfo.cells;
    var type = parseType('', sheetName);
    var codeIdx = colIndex(headers, ['编号']);
    var streetIdx = colIndex(headers, ['街道']);
    var villageIdx = colIndex(headers, ['村']);
    var descIdx = colIndex(headers, ['问题描述']);
    var projectIdx = colIndex(headers, ['项目名称']);
    var assigneeIdx = colIndex(headers, ['整改责任人', '整改负责人', '负责人']);
    var phoneIdx = colIndex(headers, ['电话', '联系电话', '联系方式']);
    var measureIdx = colIndex(headers, ['整改措施']);
    var planIdx = colIndex(headers, ['计划整改完成', '计划完成']);
    var statusIdx = colIndex(headers, ['是否完成', '整改状态']);
    var out = [];
    var dataStart = headerInfo.index + 1;
    if (rows[dataStart]) {
      var subLine = rows[dataStart].map(function (c) {
        return String(c || '').trim();
      });
      if (
        subLine.some(function (c) {
          return c === '编号' || c.indexOf('道路编号') !== -1 || c.indexOf('新建/配套') !== -1;
        })
      ) {
        dataStart += 1;
      }
    }

    for (var r = dataStart; r < rows.length; r++) {
      var row = rows[r];
      if (!row || !row.some(function (c) {
        return String(c || '').trim() !== '';
      })) continue;
      var mark = String(row[0] || '').trim();
      if (mark.indexOf('备注') === 0) break;
      var street = cellStr(row, streetIdx);
      var village = cellStr(row, villageIdx);
      var code = cellStr(row, codeIdx);
      if (!street && !village && !code && mark && !isNaN(Number(mark))) continue;
      if (!street && !village && !code) continue;
      out.push({
        type: type,
        code: code || sheetName + '-' + (out.length + 1),
        street: street || '蒋官屯街道',
        village: village,
        projectName: cellStr(row, projectIdx) || '高标农田建设项目',
        assigneeName: cellStr(row, assigneeIdx) || '王建华',
        assigneePhone: cellStr(row, phoneIdx),
        planDate: cellStr(row, planIdx),
        status: statusIdx >= 0 ? parseStatus(cellStr(row, statusIdx)) : 'pending',
        measures: cellStr(row, measureIdx) || '按台账要求整改',
        description: cellStr(row, descIdx) || '导入问题',
        reporterName: '导入',
        address: '山东省聊城市经济技术开发区',
        lat: 36.4567,
        lng: 115.9876,
      });
    }
    return out;
  }

  function exportIssues(issues) {
    if (!ensureXlsx()) return;
    var rows = [UNIFIED_HEADERS];
    (issues || []).forEach(function (i) {
      rows.push([
        TYPE_LABEL[i.type] || i.type,
        i.code || '',
        i.street || '',
        i.village || '',
        i.projectName || '',
        i.assigneeName || '',
        i.assigneePhone || '',
        i.planDate || '',
        statusLabel(i.status),
        measuresOf(i),
        i.description || '',
      ]);
    });
    var ws = global.XLSX.utils.aoa_to_sheet(rows);
    var wb = global.XLSX.utils.book_new();
    global.XLSX.utils.book_append_sheet(wb, ws, '专项整改');
    global.XLSX.writeFile(wb, '专项整改.xlsx');
  }

  function importWorkbook(file, done) {
    if (!file || !ensureXlsx()) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var wb = global.XLSX.read(e.target.result, { type: 'array' });
        var imported = [];
        if (wb.Sheets['专项整改']) {
          imported = imported.concat(parseUnifiedSheet(wb.Sheets['专项整改']));
        }
        ['机井', '道路', '桥涵', '桥涵闸'].forEach(function (name) {
          if (wb.Sheets[name]) {
            imported = imported.concat(parseLedgerSheet(wb.Sheets[name], name));
          }
        });
        if (!imported.length) {
          global.AppUI && global.AppUI.toast('未识别到可导入数据，请使用专项整改模板', 'error');
          return;
        }
        done(imported);
      } catch (err) {
        global.AppUI && global.AppUI.toast('表格解析失败', 'error');
        global.AppLog && global.AppLog.error('rectify-xlsx', 'import failed', err);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function downloadTemplateUrl() {
    return (global.HSF_BASE || '../') + 'media/专项整改导入模板.xlsx';
  }

  global.HSFRectifyXlsx = {
    exportIssues: exportIssues,
    importWorkbook: importWorkbook,
    downloadTemplateUrl: downloadTemplateUrl,
    UNIFIED_HEADERS: UNIFIED_HEADERS,
  };
})(window);
