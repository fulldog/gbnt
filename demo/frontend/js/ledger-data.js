/**
 * 汇总管理 · 街道台账 / 街道排查汇总 数据聚合
 */
(function (global) {
  'use strict';

  var STREET_LEDGER_YEARS = ['2020', '2021', '2022', '2023', '2024'];
  var HANDOVER_FIELDS = ['wellHandover', 'bridgeHandover', 'forestHandover', 'transformerHandover'];
  var HANDOVER_LABELS = {
    wellHandover: '机井移交数量',
    bridgeHandover: '桥涵移交数量',
    forestHandover: '林网移交数量',
    transformerHandover: '变压器移交数量',
  };
  var OVERRIDES_KEY = 'streetLedgerOverrides';

  function streets() {
    var orgs = (global.AppStorage && global.AppStorage.get('orgs', [])) || [];
    return orgs.filter(function (o) {
      return o.type === 'street';
    });
  }

  function villagesOfStreet(streetName) {
    var orgs = (global.AppStorage && global.AppStorage.get('orgs', [])) || [];
    var street = orgs.find(function (o) {
      return o.type === 'street' && o.name === streetName;
    });
    if (!street) return [];
    return orgs
      .filter(function (o) {
        return o.parentId === street.id && (o.type === 'village' || o.type === 'community');
      })
      .map(function (o) {
        return o.name;
      });
  }

  function issueDate(issue) {
    return String((issue && issue.createdAt) || '').slice(0, 10);
  }

  function filterIssues(issues, filters) {
    filters = filters || {};
    return (issues || []).filter(function (i) {
      if (filters.street && i.street !== filters.street) return false;
      var d = issueDate(i);
      if (filters.dateStart && d && d < filters.dateStart) return false;
      if (filters.dateEnd && d && d > filters.dateEnd) return false;
      return true;
    });
  }

  function bridgeText(list) {
    var b = 0;
    var c = 0;
    var g = 0;
    list.forEach(function (i) {
      if (i.type !== 'bridge') return;
      var k = (i.bridge && i.bridge.kind) || i.bridgeKind || '';
      if (k === 'bridge') b += 1;
      else if (k === 'culvert') c += 1;
      else if (k === 'gate') g += 1;
      else b += 1;
    });
    var parts = [];
    if (b) parts.push('桥' + b);
    if (c) parts.push('涵' + c);
    if (g) parts.push('闸' + g);
    return parts.join(' ');
  }

  function sumRoadKm(list) {
    var sum = 0;
    var has = false;
    list.forEach(function (i) {
      if (i.type !== 'road') return;
      var r = i.road || {};
      var len = r.length != null ? r.length : i.length;
      var n = parseFloat(len);
      if (!isNaN(n)) {
        sum += n;
        has = true;
      }
    });
    return has ? String(Math.round(sum * 100) / 100) : '';
  }

  function forestNums(list) {
    var hand = 0;
    var exist = 0;
    var has = false;
    list.forEach(function (i) {
      if (i.type !== 'forest' || !i.forest) return;
      has = true;
      if (i.forest.handoverCount != null) hand += i.forest.handoverCount;
      if (i.forest.existingCount != null) exist += i.forest.existingCount;
    });
    if (!has) return { handover: '', existing: '' };
    return { handover: hand, existing: exist };
  }

  function transformerNums(list) {
    var hand = 0;
    var exist = 0;
    var has = false;
    list.forEach(function (i) {
      if (i.type !== 'transformer' || !i.transformer) return;
      has = true;
      hand += 1;
      exist += 1;
    });
    if (!has) return { handover: '', existing: '' };
    return { handover: hand, existing: exist };
  }

  function aggregateRow(list) {
    var wells = list.filter(function (i) {
      return i.type === 'well';
    });
    var wellCount = wells.length;
    var forest = forestNums(list);
    var tf = transformerNums(list);
    var bridgeSummary = bridgeText(list);
    return {
      wellHandover: wellCount ? wellCount + 2 : '',
      wellExisting: wellCount || '',
      bridgeHandover: bridgeSummary,
      bridgeExisting: bridgeSummary
        ? list.filter(function (i) {
            return i.type === 'bridge';
          }).length
        : '',
      roadKm: sumRoadKm(list),
      forestHandover: forest.handover,
      forestExisting: forest.existing,
      transformerHandover: tf.handover,
      transformerExisting: tf.existing,
    };
  }

  function rowKey(street, year, village, naturalVillage) {
    return [street, year, village, naturalVillage || ''].join('|');
  }

  function getHandoverOverrides() {
    return (global.AppStorage && global.AppStorage.get(OVERRIDES_KEY, {})) || {};
  }

  function applyOverridesToRow(row, defaults, overrides) {
    var rowOverrides = overrides[row.rowKey] || {};
    HANDOVER_FIELDS.forEach(function (field) {
      if (rowOverrides[field] != null && rowOverrides[field] !== '') {
        row[field] = rowOverrides[field];
        row._overrideFields = row._overrideFields || {};
        row._overrideFields[field] = true;
      } else {
        row[field] = defaults[field];
      }
    });
    row.defaults = defaults;
  }

  function annotateRowSpans(yearRows) {
    if (!yearRows.length) return;
    var vi = 0;
    while (vi < yearRows.length) {
      var v = yearRows[vi].village;
      var span = 1;
      while (vi + span < yearRows.length && yearRows[vi + span].village === v) span += 1;
      yearRows[vi]._villageRowSpan = span;
      for (var j = vi + 1; j < vi + span; j++) yearRows[j]._villageRowSpan = 0;
      vi += span;
    }
    yearRows[0]._yearRowSpan = yearRows.length;
    yearRows[0]._streetRowSpan = yearRows.length;
    for (var k = 1; k < yearRows.length; k++) {
      yearRows[k]._yearRowSpan = 0;
      yearRows[k]._streetRowSpan = 0;
    }
  }

  function buildStreetLedger(filters) {
    filters = filters || {};
    var street = filters.street || '蒋官屯街道';
    var issues = filterIssues(global.AppData.getIssues(), filters);
    var overrides = getHandoverOverrides();
    var sections = [];
    var allRows = [];
    var seq = 0;

    STREET_LEDGER_YEARS.forEach(function (year) {
      var yearIssues = issues.filter(function (i) {
        return String(i.projectYear || '') === year;
      });
      if (!yearIssues.length && !filters.includeEmpty) return;

      var grouped = {};
      yearIssues.forEach(function (i) {
        if (i.street !== street || !i.village) return;
        var nv = i.naturalVillage || '';
        var key = i.village + '\0' + nv;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(i);
      });

      var keys = Object.keys(grouped).sort();
      var yearRows = [];
      keys.forEach(function (key) {
        var parts = key.split('\0');
        var village = parts[0];
        var naturalVillage = parts[1] || '';
        var list = grouped[key];
        var defaults = aggregateRow(list);
        var hasData =
          defaults.wellHandover ||
          defaults.bridgeHandover ||
          defaults.roadKm ||
          defaults.forestHandover !== '' ||
          defaults.transformerHandover !== '';
        if (!hasData && !filters.includeEmpty) return;

        seq += 1;
        var row = {
          seq: seq,
          projectYear: year + '年',
          year: year,
          street: street,
          village: village,
          naturalVillage: naturalVillage || '—',
          rowKey: rowKey(street, year, village, naturalVillage),
          wellExisting: defaults.wellExisting,
          bridgeExisting: defaults.bridgeExisting,
          roadKm: defaults.roadKm,
          forestExisting: defaults.forestExisting,
          transformerExisting: defaults.transformerExisting,
          signer: '',
          phone: '',
        };
        applyOverridesToRow(row, defaults, overrides);
        yearRows.push(row);
      });

      if (yearRows.length) {
        annotateRowSpans(yearRows);
        sections.push({ year: year, rows: yearRows });
        allRows = allRows.concat(yearRows);
      }
    });

    return { street: street, sections: sections, rows: allRows };
  }

  function saveHandoverOverrides(changes, removals) {
    var store = getHandoverOverrides();
    (changes || []).forEach(function (item) {
      if (!item || !item.rowKey || !item.field) return;
      if (!store[item.rowKey]) store[item.rowKey] = {};
      store[item.rowKey][item.field] = item.value;
    });
    (removals || []).forEach(function (item) {
      if (!item || !item.rowKey || !item.field) return;
      if (!store[item.rowKey]) return;
      delete store[item.rowKey][item.field];
      if (!Object.keys(store[item.rowKey]).length) delete store[item.rowKey];
    });
    if (global.AppStorage) global.AppStorage.set(OVERRIDES_KEY, store);
    return store;
  }

  function typeStats(list, type) {
    var items = list.filter(function (i) {
      return i.type === type;
    });
    var problems = items.length;
    var rectified = items.filter(function (i) {
      return i.status === 'done';
    }).length;
    return { problems: problems, rectified: rectified, inspected: problems ? problems + 3 : 0 };
  }

  function buildSurveySummary(filters) {
    filters = filters || {};
    var street = filters.street || '蒋官屯街道';
    var issues = filterIssues(global.AppData.getIssues(), filters);
    var grouped = {};
    issues.forEach(function (i) {
      if (i.street !== street || !i.village) return;
      var nv = i.naturalVillage || '';
      var key = i.village + '\0' + nv;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(i);
    });
    var keys = Object.keys(grouped).sort();
    var rows = [];
    keys.forEach(function (key) {
      var parts = key.split('\0');
      var village = parts[0];
      var naturalVillage = parts[1] || '';
      var list = grouped[key] || [];
      if (!list.length && !filters.includeEmpty) return;
      var well = typeStats(list, 'well');
      var bridge = typeStats(list, 'bridge');
      var road = typeStats(list, 'road');
      var allDone = list.length > 0 && list.every(function (i) {
        return i.status === 'done';
      });
      var contact = list[0] || {};
      rows.push({
        street: street,
        village: village,
        naturalVillage: naturalVillage || '—',
        surveyDone: list.length ? (allDone ? '是' : '否') : '',
        wellInspected: well.inspected || '',
        wellNormal: well.inspected ? Math.max(0, well.inspected - well.problems) : '',
        wellProblemTotal: well.problems || '',
        bridgeInspected: bridge.inspected || '',
        bridgeProblems: bridge.problems || '',
        roadInspected: road.inspected || '',
        roadProblems: road.problems || '',
        wellIssueCount: well.problems || '',
        wellRectifiedCount: well.rectified || '',
        bridgeIssueCount: bridge.problems || '',
        bridgeRectifiedCount: bridge.rectified || '',
        roadIssueCount: road.problems || '',
        roadRectifiedCount: road.rectified || '',
        contactName: contact.reporterName || '',
        contactPhone: contact.reporterPhone || '',
        leaderSign: '',
      });
    });
    return { street: street, rows: rows };
  }

  function streetTitleShort(street) {
    return String(street || '').replace(/街道$/, '') || 'xx';
  }

  global.HSFLedgerData = {
    STREET_LEDGER_YEARS: STREET_LEDGER_YEARS,
    HANDOVER_FIELDS: HANDOVER_FIELDS,
    HANDOVER_LABELS: HANDOVER_LABELS,
    streets: streets,
    villagesOfStreet: villagesOfStreet,
    filterIssues: filterIssues,
    buildStreetLedger: buildStreetLedger,
    buildSurveySummary: buildSurveySummary,
    streetTitleShort: streetTitleShort,
    getHandoverOverrides: getHandoverOverrides,
    saveHandoverOverrides: saveHandoverOverrides,
    rowKey: rowKey,
  };
})(window);
