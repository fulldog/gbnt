/**
 * 汇总管理 · 街道台账 / 街道排查汇总 数据聚合
 */
(function (global) {
  'use strict';

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

  function groupByVillage(issues, streetName) {
    var map = {};
    villagesOfStreet(streetName).forEach(function (v) {
      map[v] = [];
    });
    issues.forEach(function (i) {
      if (i.street !== streetName || !i.village) return;
      if (!map[i.village]) map[i.village] = [];
      map[i.village].push(i);
    });
    return map;
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

  function projectNameOf(list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].projectName) return list[i].projectName;
    }
    return '高标农田建设项目';
  }

  function buildStreetLedger(filters) {
    filters = filters || {};
    var street = filters.street || '蒋官屯街道';
    var issues = filterIssues(global.AppData.getIssues(), filters);
    var grouped = groupByVillage(issues, street);
    var villages = Object.keys(grouped).sort();
    var rows = [];
    var seq = 0;
    villages.forEach(function (village) {
      var list = grouped[village] || [];
      var wells = list.filter(function (i) {
        return i.type === 'well';
      });
      var wellCount = wells.length;
      var forest = forestNums(list);
      var tf = transformerNums(list);
      var bridgeSummary = bridgeText(list);
      var hasData =
        wellCount ||
        bridgeSummary ||
        sumRoadKm(list) ||
        forest.handover !== '' ||
        tf.handover !== '';
      if (!hasData && !filters.includeEmpty) return;
      seq += 1;
      rows.push({
        seq: seq,
        projectName: projectNameOf(list),
        village: village,
        wellHandover: wellCount ? wellCount + 2 : '',
        wellExisting: wellCount || '',
        bridgeHandover: bridgeSummary,
        bridgeExisting: bridgeSummary ? list.filter(function (i) {
          return i.type === 'bridge';
        }).length : '',
        roadKm: sumRoadKm(list),
        forestHandover: forest.handover,
        forestExisting: forest.existing,
        transformerHandover: tf.handover,
        transformerExisting: tf.existing,
        signer: '',
        phone: '',
      });
    });
    return { street: street, rows: rows };
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
    var grouped = groupByVillage(issues, street);
    var villages = Object.keys(grouped).sort();
    var rows = [];
    villages.forEach(function (village) {
      var list = grouped[village] || [];
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
    streets: streets,
    villagesOfStreet: villagesOfStreet,
    filterIssues: filterIssues,
    buildStreetLedger: buildStreetLedger,
    buildSurveySummary: buildSurveySummary,
    streetTitleShort: streetTitleShort,
  };
})(window);
