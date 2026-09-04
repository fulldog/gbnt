/**
 * 汇总管理 xlsx 导出（含合并单元格，对齐街道专项排查台账）
 */
(function (global) {
  'use strict';

  var COL_COUNT = 16;

  function ensureXlsx() {
    if (!global.XLSX) {
      global.AppUI && global.AppUI.toast('表格组件未加载', 'error');
      return false;
    }
    return true;
  }

  function cell(v) {
    return v == null || v === '' ? '' : v;
  }

  function pushRowSpanMerges(merges, rows, colIndex, spanKey, startRow) {
    var i = 0;
    while (i < rows.length) {
      var span = rows[i][spanKey];
      if (span > 1) {
        merges.push({
          s: { r: startRow + i, c: colIndex },
          e: { r: startRow + i + span - 1, c: colIndex },
        });
      }
      i += span > 0 ? span : 1;
    }
  }

  function exportStreetLedger(payload) {
    if (!ensureXlsx()) return;
    payload = payload || {};
    var street = payload.street || '蒋官屯街道';
    var short = global.HSFLedgerData
      ? global.HSFLedgerData.streetTitleShort(street)
      : street;
    var rows = payload.rows || [];
    var title = '聊城经济技术开发区高标准农田建设项目' + short + '街道台账';
    var aoa = [];
    aoa.push([title]);
    aoa.push([
      '序号',
      '建设年份',
      '街道',
      '新村/社区',
      '自然村',
      '村具体建设项目情况',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ]);
    aoa.push([
      '',
      '',
      '',
      '',
      '',
      '机井',
      '',
      '桥、涵、闸',
      '',
      '路/千米',
      '林网',
      '',
      '变压器',
      '',
      '负责人签字及村委盖章',
      '电话',
    ]);
    aoa.push([
      '',
      '',
      '',
      '',
      '',
      '移交数量',
      '现有数',
      '移交数量',
      '现有数',
      '',
      '移交数量',
      '现有数',
      '移交数量',
      '现有数',
      '',
      '',
    ]);
    rows.forEach(function (r) {
      var line = [
        r.seq,
        r._yearRowSpan ? cell(r.projectYear) : '',
        r._streetRowSpan ? cell(r.street) : '',
        r._villageRowSpan ? cell(r.village) : '',
        cell(r.naturalVillage),
        cell(r.wellHandover),
        cell(r.wellExisting),
        cell(r.bridgeHandover),
        cell(r.bridgeExisting),
        cell(r.roadKm),
        cell(r.forestHandover),
        cell(r.forestExisting),
        cell(r.transformerHandover),
        cell(r.transformerExisting),
        cell(r.signer),
        cell(r.phone),
      ];
      aoa.push(line);
    });
    aoa.push(['上报表格加盖所属街道办事处公章及主要负责人及分管负责人签字。']);

    var ws = global.XLSX.utils.aoa_to_sheet(aoa);
    var dataStart = 4;
    var merges = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: COL_COUNT - 1 } },
      { s: { r: 1, c: 5 }, e: { r: 1, c: COL_COUNT - 1 } },
      { s: { r: 2, c: 5 }, e: { r: 2, c: 6 } },
      { s: { r: 2, c: 7 }, e: { r: 2, c: 8 } },
      { s: { r: 2, c: 10 }, e: { r: 2, c: 11 } },
      { s: { r: 2, c: 12 }, e: { r: 2, c: 13 } },
      { s: { r: 1, c: 0 }, e: { r: 3, c: 0 } },
      { s: { r: 1, c: 1 }, e: { r: 3, c: 1 } },
      { s: { r: 1, c: 2 }, e: { r: 3, c: 2 } },
      { s: { r: 1, c: 3 }, e: { r: 3, c: 3 } },
      { s: { r: 1, c: 4 }, e: { r: 3, c: 4 } },
      { s: { r: 2, c: 9 }, e: { r: 3, c: 9 } },
      { s: { r: 2, c: 14 }, e: { r: 3, c: 14 } },
      { s: { r: 2, c: 15 }, e: { r: 3, c: 15 } },
      { s: { r: aoa.length - 1, c: 0 }, e: { r: aoa.length - 1, c: COL_COUNT - 1 } },
    ];
    pushRowSpanMerges(merges, rows, 1, '_yearRowSpan', dataStart);
    pushRowSpanMerges(merges, rows, 2, '_streetRowSpan', dataStart);
    pushRowSpanMerges(merges, rows, 3, '_villageRowSpan', dataStart);
    ws['!merges'] = merges;
    var wb = global.XLSX.utils.book_new();
    global.XLSX.utils.book_append_sheet(wb, ws, '街道台账');
    global.XLSX.writeFile(wb, '街道台账.xlsx');
  }

  function exportSurveySummary(payload) {
    if (!ensureXlsx()) return;
    payload = payload || {};
    var street = payload.street || '蒋官屯街道';
    var short = global.HSFLedgerData
      ? global.HSFLedgerData.streetTitleShort(street)
      : street;
    var rows = payload.rows || [];
    var COL_COUNT = 22;
    var title =
      '聊城经济技术开发区高标准农田建设项目' + short + '街道机井（泵站）、桥涵、道路排查汇总台账';
    var aoa = [];
    aoa.push([title]);
    aoa.push([
      '街道',
      '新村/社区',
      '自然村',
      '是否全面完成排查（是/否）',
      '机井、桥涵、道路',
      '',
      '',
      '',
      '',
      '',
      '',
      '排查整改情况（个）',
      '',
      '',
      '',
      '',
      '',
      '运行管护排查联系人',
      '',
      '',
      '',
      '负责人签字：\n（盖章）',
    ]);
    aoa.push([
      '',
      '',
      '',
      '',
      '已排查机井（泵站）总数（眼）',
      '其中运行正常机井（泵站）',
      '发现问题总数（个）',
      '已排查桥、涵、闸（数）',
      '发现桥、涵、闸问题（数）',
      '已排查道路（数）',
      '发现道路问题（数）',
      '机井',
      '',
      '桥涵',
      '',
      '道路',
      '',
      '排查人：社区、村',
      '',
      '',
      '',
      '',
    ]);
    aoa.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    aoa.push([
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '问题数量',
      '整改数量',
      '问题数量',
      '整改数量',
      '问题数量',
      '整改数量',
      '联系电话：',
      '',
      '',
      '',
      '',
    ]);
    rows.forEach(function (r) {
      aoa.push([
        cell(r.street),
        cell(r.village),
        cell(r.naturalVillage),
        cell(r.surveyDone),
        cell(r.wellInspected),
        cell(r.wellNormal),
        cell(r.wellProblemTotal),
        cell(r.bridgeInspected),
        cell(r.bridgeProblems),
        cell(r.roadInspected),
        cell(r.roadProblems),
        cell(r.wellIssueCount),
        cell(r.wellRectifiedCount),
        cell(r.bridgeIssueCount),
        cell(r.bridgeRectifiedCount),
        cell(r.roadIssueCount),
        cell(r.roadRectifiedCount),
        cell(r.contactName),
        '',
        '',
        '',
        cell(r.leaderSign),
      ]);
    });
    aoa.push([
      '注：排查范围是2010年以来高标范围内所有机井、桥涵、道路。上报表格加盖所属街道办事处公章及主要负责人及分管负责人签字',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ]);

    var ws = global.XLSX.utils.aoa_to_sheet(aoa);
    var last = aoa.length - 1;
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: COL_COUNT - 1 } },
      { s: { r: 1, c: 4 }, e: { r: 1, c: 10 } },
      { s: { r: 1, c: 11 }, e: { r: 1, c: 16 } },
      { s: { r: 1, c: 17 }, e: { r: 1, c: 20 } },
      { s: { r: 1, c: 21 }, e: { r: 4, c: 21 } },
      { s: { r: 1, c: 0 }, e: { r: 4, c: 0 } },
      { s: { r: 1, c: 1 }, e: { r: 4, c: 1 } },
      { s: { r: 1, c: 2 }, e: { r: 4, c: 2 } },
      { s: { r: 1, c: 3 }, e: { r: 4, c: 3 } },
      { s: { r: 2, c: 4 }, e: { r: 4, c: 4 } },
      { s: { r: 2, c: 5 }, e: { r: 4, c: 5 } },
      { s: { r: 2, c: 6 }, e: { r: 4, c: 6 } },
      { s: { r: 2, c: 7 }, e: { r: 4, c: 7 } },
      { s: { r: 2, c: 8 }, e: { r: 4, c: 8 } },
      { s: { r: 2, c: 9 }, e: { r: 4, c: 9 } },
      { s: { r: 2, c: 10 }, e: { r: 4, c: 10 } },
      { s: { r: 2, c: 11 }, e: { r: 2, c: 12 } },
      { s: { r: 2, c: 13 }, e: { r: 2, c: 14 } },
      { s: { r: 2, c: 15 }, e: { r: 2, c: 16 } },
      { s: { r: 2, c: 17 }, e: { r: 3, c: 20 } },
      { s: { r: 4, c: 17 }, e: { r: 4, c: 20 } },
      { s: { r: last, c: 0 }, e: { r: last, c: COL_COUNT - 1 } },
    ];
    var wb = global.XLSX.utils.book_new();
    global.XLSX.utils.book_append_sheet(wb, ws, '街道排查汇总');
    global.XLSX.writeFile(wb, '街道排查汇总.xlsx');
  }

  global.HSFLedgerXlsx = {
    exportStreetLedger: exportStreetLedger,
    exportSurveySummary: exportSurveySummary,
  };
})(window);
