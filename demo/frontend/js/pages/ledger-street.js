(function () {
  if (!AppNav.requireSession('./login.html')) return;
  AppNav.setBreadcrumb('汇总管理', '街道台账');

  var filtersApi = null;
  var lastPayload = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function titleText(street) {
    var short = HSFLedgerData.streetTitleShort(street);
    return '聊城经济技术开发区高标准农田建设项目' + short + '街道台账';
  }

  function renderTable(payload) {
    lastPayload = payload;
    var table = document.getElementById('ld-main-table');
    if (!table) return;
    var rows = payload.rows || [];
    var html = HSFLedgerCommon.renderColgroup(HSFLedgerCommon.STREET_COL_WIDTHS);
    html += '<thead>';
    html += '<tr class="ledger-title-row"><th colspan="14">' + esc(titleText(payload.street)) + '</th></tr>';
    html +=
      '<tr><th rowspan="3">序号</th><th rowspan="3">建设项目</th><th rowspan="3">涉及村庄</th>' +
      '<th colspan="11">村具体建设项目情况</th></tr>';
    html +=
      '<tr><th colspan="2">机井</th><th colspan="2">桥、涵、闸</th><th rowspan="2">路/千米</th>' +
      '<th colspan="2">林网</th><th colspan="2">变压器</th><th rowspan="2">负责人签字及村委盖章</th><th rowspan="2">电话</th></tr>';
    html +=
      '<tr><th>移交数量</th><th>现有数</th><th>移交数量</th><th>现有数</th>' +
      '<th>移交数量</th><th>现有数</th><th>移交数量</th><th>现有数</th></tr>';
    html += '</thead><tbody>';
    if (!rows.length) {
      html += '<tr class="ledger-empty"><td colspan="14">暂无数据</td></tr>';
    } else {
      rows.forEach(function (r) {
        html +=
          '<tr><td>' +
          esc(r.seq) +
          '</td><td>' +
          esc(r.projectName) +
          '</td><td>' +
          esc(r.village) +
          '</td><td>' +
          esc(r.wellHandover) +
          '</td><td>' +
          esc(r.wellExisting) +
          '</td><td>' +
          esc(r.bridgeHandover) +
          '</td><td>' +
          esc(r.bridgeExisting) +
          '</td><td>' +
          esc(r.roadKm) +
          '</td><td>' +
          esc(r.forestHandover) +
          '</td><td>' +
          esc(r.forestExisting) +
          '</td><td>' +
          esc(r.transformerHandover) +
          '</td><td>' +
          esc(r.transformerExisting) +
          '</td><td>' +
          esc(r.signer) +
          '</td><td>' +
          esc(r.phone) +
          '</td></tr>';
      });
    }
    html += '</tbody><tfoot>';
    html +=
      '<tr class="ledger-foot-row"><td colspan="14">上报表格加盖所属街道办事处公章及主要负责人及分管负责人签字。</td></tr>';
    html += '</tfoot>';
    table.innerHTML = html;
  }

  function refresh() {
    var f = filtersApi ? filtersApi.readFilters() : {};
    var payload = HSFLedgerData.buildStreetLedger(f);
    renderTable(payload);
  }

  filtersApi = HSFLedgerCommon.initFilters({
    defaultStreet: '蒋官屯街道',
    onSearch: refresh,
  });

  HSFLedgerCommon.initTableChrome({
    onRefresh: refresh,
    onExport: function () {
      if (!lastPayload) refresh();
      if (!window.HSFLedgerXlsx) {
        AppUI.toast('表格组件未加载', 'error');
        return;
      }
      HSFLedgerXlsx.exportStreetLedger(lastPayload);
      AppUI.toast('已导出');
    },
  });

  refresh();
})();
