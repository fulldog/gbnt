(function () {
  if (!AppNav.requireSession('./login.html')) return;
  AppNav.setBreadcrumb('高标农田专项整治', '汇总台账');
  AppIcons.injectAll(document);

  function buildRows() {
    var map = {};
    AppData.getIssues().forEach(function (i) {
      var key = (i.street || '') + '|' + (i.village || '');
      if (!map[key]) {
        map[key] = {
          street: i.street || '—',
          village: i.village || '—',
          well: 0,
          wellDone: 0,
          road: 0,
          roadDone: 0,
          bridge: 0,
          bridgeDone: 0,
        };
      }
      var row = map[key];
      if (i.type === 'well') {
        row.well++;
        if (i.status === 'done') row.wellDone++;
      } else if (i.type === 'road') {
        row.road++;
        if (i.status === 'done') row.roadDone++;
      } else if (i.type === 'bridge') {
        row.bridge++;
        if (i.status === 'done') row.bridgeDone++;
      }
    });
    return Object.keys(map).map(function (k) {
      return map[k];
    });
  }

  function render() {
    var rows = buildRows();
    var tbody = document.querySelector('#ledgerTable tbody');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="app-empty">暂无汇总数据</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map(function (r) {
        var doneAll =
          r.well === r.wellDone && r.road === r.roadDone && r.bridge === r.bridgeDone && r.well + r.road + r.bridge > 0;
        return (
          '<tr><td>' +
          r.street +
          '</td><td>' +
          r.village +
          '</td><td>' +
          r.well +
          '</td><td>' +
          r.wellDone +
          '</td><td>' +
          r.road +
          '</td><td>' +
          r.roadDone +
          '</td><td>' +
          r.bridge +
          '</td><td>' +
          r.bridgeDone +
          '</td><td>' +
          (doneAll ? '是' : '否') +
          '</td></tr>'
        );
      })
      .join('');
  }

  document.getElementById('btnExportLedger').addEventListener('click', function () {
    var rows = [['街道', '村', '机井问题', '机井已整改', '道路问题', '道路已整改', '桥涵问题', '桥涵已整改', '是否完成排查']];
    buildRows().forEach(function (r) {
      var doneAll =
        r.well === r.wellDone && r.road === r.roadDone && r.bridge === r.bridgeDone && r.well + r.road + r.bridge > 0;
      rows.push([r.street, r.village, r.well, r.wellDone, r.road, r.roadDone, r.bridge, r.bridgeDone, doneAll ? '是' : '否']);
    });
    var csv = rows
      .map(function (r) {
        return r.join(',');
      })
      .join('\n');
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '汇总台账.csv';
    a.click();
  });

  render();
})();
