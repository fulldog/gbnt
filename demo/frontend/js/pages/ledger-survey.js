(function () {
  if (!AppNav.requireSession('./login.html')) return;
  AppNav.setBreadcrumb('汇总管理', '街道排查汇总');

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
    return (
      '聊城经济技术开发区高标准农田建设项目' +
      short +
      '街道机井（泵站）、桥涵、道路排查汇总台账'
    );
  }

  function renderTable(payload) {
    lastPayload = payload;
    var table = document.getElementById('ld-main-table');
    if (!table) return;
    var rows = payload.rows || [];
    var html = HSFLedgerCommon.renderColgroup(HSFLedgerCommon.SURVEY_COL_WIDTHS);
    html += '<thead>';
    html += '<tr class="ledger-title-row"><th colspan="21">' + esc(titleText(payload.street)) + '</th></tr>';
    html +=
      '<tr><th rowspan="4" class="ld-sticky-col ld-sticky-col-0">街道</th><th rowspan="4" class="ld-sticky-col ld-sticky-col-1">村</th>' +
      '<th rowspan="4" class="ld-sticky-col ld-sticky-col-2 ld-sticky-last">是否全面完成排查（是/否）</th>' +
      '<th colspan="7">机井、桥涵、道路</th><th colspan="6">排查整改情况（个）</th>' +
      '<th colspan="4">运行管护排查联系人</th><th rowspan="4">负责人签字：<br>（盖章）</th></tr>';
    html +=
      '<tr><th rowspan="3">已排查机井（泵站）总数（眼）</th><th rowspan="3">其中运行正常机井（泵站）</th>' +
      '<th rowspan="3">发现问题总数（个）</th><th rowspan="3">已排查桥、涵、闸（数）</th>' +
      '<th rowspan="3">发现桥、涵、闸问题（数）</th><th rowspan="3">已排查道路（数）</th>' +
      '<th rowspan="3">发现道路问题（数）</th><th colspan="2" rowspan="2">机井</th><th colspan="2" rowspan="2">桥涵</th>' +
      '<th colspan="2" rowspan="2">道路</th><th colspan="4" rowspan="2">排查人：社区、村</th></tr>';
    html += '<tr></tr>';
    html +=
      '<tr><th>问题数量</th><th>整改数量</th><th>问题数量</th><th>整改数量</th><th>问题数量</th><th>整改数量</th>' +
      '<th colspan="4">联系电话：</th></tr>';
    html += '</thead><tbody>';
    if (!rows.length) {
      html += '<tr class="ledger-empty"><td colspan="21">暂无数据</td></tr>';
    } else {
      rows.forEach(function (r) {
        html +=
          '<tr><td class="ld-sticky-col ld-sticky-col-0">' +
          esc(r.street) +
          '</td><td class="ld-sticky-col ld-sticky-col-1">' +
          esc(r.village) +
          '</td><td class="ld-sticky-col ld-sticky-col-2 ld-sticky-last">' +
          esc(r.surveyDone) +
          '</td><td>' +
          esc(r.wellInspected) +
          '</td><td>' +
          esc(r.wellNormal) +
          '</td><td>' +
          esc(r.wellProblemTotal) +
          '</td><td>' +
          esc(r.bridgeInspected) +
          '</td><td>' +
          esc(r.bridgeProblems) +
          '</td><td>' +
          esc(r.roadInspected) +
          '</td><td>' +
          esc(r.roadProblems) +
          '</td><td>' +
          esc(r.wellIssueCount) +
          '</td><td>' +
          esc(r.wellRectifiedCount) +
          '</td><td>' +
          esc(r.bridgeIssueCount) +
          '</td><td>' +
          esc(r.bridgeRectifiedCount) +
          '</td><td>' +
          esc(r.roadIssueCount) +
          '</td><td>' +
          esc(r.roadRectifiedCount) +
          '</td><td>' +
          esc(r.contactName) +
          '</td><td colspan="3">' +
          esc(r.contactPhone) +
          '</td><td>' +
          esc(r.leaderSign) +
          '</td></tr>';
      });
    }
    html += '</tbody><tfoot>';
    html +=
      '<tr class="ledger-foot-row"><td colspan="21">注：排查范围是2010年以来高标范围内所有机井、桥涵、道路。上报表格加盖所属街道办事处公章及主要负责人及分管负责人签字</td></tr>';
    html += '</tfoot>';
    table.innerHTML = html;
    HSFLedgerCommon.afterTableRender(table, 3);
  }

  function refresh() {
    var f = filtersApi ? filtersApi.readFilters() : {};
    var payload = HSFLedgerData.buildSurveySummary(f);
    renderTable(payload);
  }

  filtersApi = HSFLedgerCommon.initFilters({
    defaultStreet: '蒋官屯街道',
    onSearch: refresh,
  });

  HSFLedgerCommon.initTableChrome({
    onRefresh: function () {
      refresh();
      var table = document.getElementById('ld-main-table');
      HSFLedgerCommon.afterTableRender(table, 3);
    },
    onExport: function () {
      if (!lastPayload) refresh();
      if (!window.HSFLedgerXlsx) {
        AppUI.toast('表格组件未加载', 'error');
        return;
      }
      HSFLedgerXlsx.exportSurveySummary(lastPayload);
      AppUI.toast('已导出');
    },
  });

  refresh();
})();
