(function () {
  if (!AppNav.requireSession('./login.html')) return;
  AppNav.setBreadcrumb('汇总管理', '街道台账');

  if (window.LadsStorage && LadsStorage.ensure) LadsStorage.ensure();

  var filtersApi = null;
  var lastPayload = null;
  var editSession = null;

  var HANDOVER_FIELDS = (window.HSFLedgerData && HSFLedgerData.HANDOVER_FIELDS) || [
    'wellHandover',
    'bridgeHandover',
    'forestHandover',
    'transformerHandover',
  ];
  var HANDOVER_LABELS = (window.HSFLedgerData && HSFLedgerData.HANDOVER_LABELS) || {
    wellHandover: '机井移交数量',
    bridgeHandover: '桥涵移交数量',
    forestHandover: '林网移交数量',
    transformerHandover: '变压器移交数量',
  };
  var COL_COUNT = 16;

  function $(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escAttr(s) {
    return esc(s);
  }

  function titleText(street) {
    var short = HSFLedgerData.streetTitleShort(street);
    return '聊城经济技术开发区高标准农田建设项目' + short + '街道台账';
  }

  function isHandoverField(field) {
    return HANDOVER_FIELDS.indexOf(field) >= 0;
  }

  function showEditToolbar(show) {
    var bar = $('ld-edit-actions');
    if (bar) bar.hidden = !show;
  }

  function endEditSession() {
    editSession = null;
    showEditToolbar(false);
  }

  function startEditSession() {
    if (!editSession) {
      editSession = { dirty: {} };
      showEditToolbar(true);
    }
  }

  function dirtyKey(rowKey, field) {
    return rowKey + '\0' + field;
  }

  function getCellDisplayValue(row, field) {
    var dk = dirtyKey(row.rowKey, field);
    if (editSession && editSession.dirty[dk] != null) {
      return editSession.dirty[dk];
    }
    return row[field] == null ? '' : row[field];
  }

  function renderHandoverCell(row, field) {
    var val = getCellDisplayValue(row, field);
    var dk = dirtyKey(row.rowKey, field);
    var isDirty = editSession && editSession.dirty[dk] != null;
    var isOverride = row._overrideFields && row._overrideFields[field];
    var cls = 'ld-handover-cell';
    if (isDirty) cls += ' is-dirty';
    else if (isOverride) cls += ' is-override';
    return (
      '<td class="' +
      cls +
      '" tabindex="0" role="button" data-row-key="' +
      escAttr(row.rowKey) +
      '" data-field="' +
      escAttr(field) +
      '" data-default="' +
      escAttr(row.defaults && row.defaults[field] != null ? row.defaults[field] : '') +
      '">' +
      esc(val) +
      '</td>'
    );
  }

  function renderDataRow(row) {
    var html = '<tr data-row-key="' + escAttr(row.rowKey) + '">';
    html += '<td>' + esc(row.seq) + '</td>';
    if (row._yearRowSpan) {
      html += '<td rowspan="' + row._yearRowSpan + '">' + esc(row.projectYear) + '</td>';
    }
    if (row._streetRowSpan) {
      html += '<td rowspan="' + row._streetRowSpan + '">' + esc(row.street) + '</td>';
    }
    if (row._villageRowSpan) {
      html += '<td rowspan="' + row._villageRowSpan + '">' + esc(row.village) + '</td>';
    }
    html += '<td>' + esc(row.naturalVillage) + '</td>';
    html += renderHandoverCell(row, 'wellHandover');
    html += '<td>' + esc(row.wellExisting) + '</td>';
    html += renderHandoverCell(row, 'bridgeHandover');
    html += '<td>' + esc(row.bridgeExisting) + '</td>';
    html += '<td>' + esc(row.roadKm) + '</td>';
    html += renderHandoverCell(row, 'forestHandover');
    html += '<td>' + esc(row.forestExisting) + '</td>';
    html += renderHandoverCell(row, 'transformerHandover');
    html += '<td>' + esc(row.transformerExisting) + '</td>';
    html += '<td>' + esc(row.signer) + '</td>';
    html += '<td>' + esc(row.phone) + '</td>';
    html += '</tr>';
    return html;
  }

  function renderTable(payload) {
    lastPayload = payload;
    var table = $('ld-main-table');
    if (!table) return;
    var rows = payload.rows || [];
    var html = HSFLedgerCommon.renderColgroup(HSFLedgerCommon.STREET_COL_WIDTHS);
    html += '<thead>';
    html += '<tr class="ledger-title-row"><th colspan="' + COL_COUNT + '">' + esc(titleText(payload.street)) + '</th></tr>';
    html +=
      '<tr><th rowspan="3">序号</th><th rowspan="3">建设年份</th><th rowspan="3">街道</th>' +
      '<th rowspan="3">新村/社区</th><th rowspan="3">自然村</th>' +
      '<th colspan="11">村具体建设项目情况</th></tr>';
    html +=
      '<tr><th colspan="2">机井</th><th colspan="2">桥、涵、闸</th><th rowspan="2">路/千米</th>' +
      '<th colspan="2">林网</th><th colspan="2">变压器</th><th rowspan="2">负责人签字及村委盖章</th><th rowspan="2">电话</th></tr>';
    html +=
      '<tr><th>移交数量</th><th>现有数</th><th>移交数量</th><th>现有数</th>' +
      '<th>移交数量</th><th>现有数</th><th>移交数量</th><th>现有数</th></tr>';
    html += '</thead><tbody>';
    if (!rows.length) {
      html += '<tr class="ledger-empty"><td colspan="' + COL_COUNT + '">暂无数据</td></tr>';
    } else {
      rows.forEach(function (r) {
        html += renderDataRow(r);
      });
    }
    html += '</tbody><tfoot>';
    html +=
      '<tr class="ledger-foot-row"><td colspan="' +
      COL_COUNT +
      '">上报表格加盖所属街道办事处公章及主要负责人及分管负责人签字。</td></tr>';
    html += '</tfoot>';
    table.innerHTML = html;
  }

  function initHandoverEdit() {
    var table = $('ld-main-table');
    if (!table || table._ldHandoverBound) return;
    table._ldHandoverBound = true;

    table.addEventListener('click', function (e) {
      var cell = e.target.closest('.ld-handover-cell');
      if (!cell || !table.contains(cell)) return;
      e.preventDefault();
      e.stopPropagation();
      if (cell.classList.contains('is-editing')) return;
      activateCellEditor(cell);
    });

    table.addEventListener('keydown', function (e) {
      var cell = e.target.closest('.ld-handover-cell');
      if (!cell || !table.contains(cell)) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activateCellEditor(cell);
      }
    });
  }

  function findRowByKey(rowKey) {
    if (!lastPayload || !lastPayload.rows) return null;
    return lastPayload.rows.find(function (r) {
      return r.rowKey === rowKey;
    });
  }

  function activateCellEditor(cell) {
    if (!cell || cell.classList.contains('is-editing')) return;
    var rowKey = cell.getAttribute('data-row-key');
    var field = cell.getAttribute('data-field');
    if (!rowKey || !isHandoverField(field)) return;

    startEditSession();
    cell.classList.add('is-editing');
    var current = cell.textContent.trim();
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'ld-handover-input';
    input.value = current;
    input.setAttribute('data-row-key', rowKey);
    input.setAttribute('data-field', field);
    cell.textContent = '';
    cell.appendChild(input);
    input.focus();
    input.select();

    function commitInput() {
      var val = input.value.trim();
      editSession.dirty[dirtyKey(rowKey, field)] = val;
      cell.classList.remove('is-editing');
      cell.textContent = val;
      cell.classList.add('is-dirty');
    }

    input.addEventListener('blur', function () {
      commitInput();
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        var dk = dirtyKey(rowKey, field);
        delete editSession.dirty[dk];
        cell.classList.remove('is-editing', 'is-dirty');
        var row = findRowByKey(rowKey);
        cell.textContent = row ? getCellDisplayValue(row, field) : current;
      }
    });
  }

  function collectDirtyChanges() {
    if (!editSession || !editSession.dirty) return { saves: [], removals: [], logs: [] };
    var saves = [];
    var removals = [];
    var logs = [];
    Object.keys(editSession.dirty).forEach(function (dk) {
      var parts = dk.split('\0');
      var rowKey = parts[0];
      var field = parts[1];
      var row = findRowByKey(rowKey);
      if (!row) return;
      var newVal = editSession.dirty[dk];
      var oldVal = row[field] == null ? '' : String(row[field]);
      var defVal = row.defaults && row.defaults[field] != null ? String(row.defaults[field]) : '';
      if (newVal === defVal) {
        if (row._overrideFields && row._overrideFields[field]) {
          removals.push({ rowKey: rowKey, field: field });
          logs.push(formatLogLine(row, field, oldVal, defVal, true));
        }
        return;
      }
      if (newVal !== oldVal) {
        saves.push({ rowKey: rowKey, field: field, value: newVal });
        logs.push(formatLogLine(row, field, oldVal, newVal, false));
      }
    });
    return { saves: saves, removals: removals, logs: logs };
  }

  function formatLogLine(row, field, oldVal, newVal, isRestore) {
    var label = HANDOVER_LABELS[field] || field;
    var region = [row.street, row.projectYear, row.village, row.naturalVillage !== '—' ? row.naturalVillage : '']
      .filter(Boolean)
      .join(' ');
    if (isRestore) {
      return region + ' ' + label + ' 恢复默认：' + (oldVal || '—') + '→' + (newVal || '—');
    }
    return region + ' ' + label + '：' + (oldVal || '—') + '→' + (newVal || '—');
  }

  function appendOpLogs(lines) {
    if (!lines.length) return;
    var detail = lines.join('；');
    if (window.LadsStorage && LadsStorage.appendLog) {
      LadsStorage.appendLog('街道台账修改', detail);
    } else if (AppData && AppData.pushLog) {
      AppData.pushLog('街道台账修改', detail);
    }
  }

  function saveEdits() {
    if (!editSession) return;
    document.activeElement && document.activeElement.blur();
    var pack = collectDirtyChanges();
    if (!pack.saves.length && !pack.removals.length) {
      AppUI.toast('没有需要保存的修改');
      endEditSession();
      refresh();
      return;
    }
    HSFLedgerData.saveHandoverOverrides(pack.saves, pack.removals);
    appendOpLogs(pack.logs);
    AppUI.toast('已保存');
    endEditSession();
    refresh();
  }

  function restoreDefaults() {
    if (!editSession || !lastPayload) return;
    document.activeElement && document.activeElement.blur();
    Object.keys(editSession.dirty).forEach(function (dk) {
      var parts = dk.split('\0');
      var rowKey = parts[0];
      var field = parts[1];
      var row = findRowByKey(rowKey);
      if (!row || !row.defaults) return;
      editSession.dirty[dk] =
        row.defaults[field] == null ? '' : String(row.defaults[field]);
    });
    if (!Object.keys(editSession.dirty).length) {
      lastPayload.rows.forEach(function (row) {
        HANDOVER_FIELDS.forEach(function (field) {
          if (row._overrideFields && row._overrideFields[field]) {
            editSession.dirty[dirtyKey(row.rowKey, field)] =
              row.defaults[field] == null ? '' : String(row.defaults[field]);
          }
        });
      });
    }
    renderTable(lastPayload);
    showEditToolbar(true);
  }

  function initEditToolbar() {
    var btnSave = $('ld-btn-save-edit');
    var btnRestore = $('ld-btn-restore-default');
    if (btnSave) btnSave.addEventListener('click', saveEdits);
    if (btnRestore) btnRestore.addEventListener('click', restoreDefaults);
  }

  function refresh() {
    var f = filtersApi ? filtersApi.readFilters() : {};
    var payload = HSFLedgerData.buildStreetLedger(f);
    renderTable(payload);
  }

  filtersApi = HSFLedgerCommon.initFilters({
    defaultStreet: '蒋官屯街道',
    onSearch: function () {
      endEditSession();
      refresh();
    },
  });

  HSFLedgerCommon.initTableChrome({
    onRefresh: function () {
      endEditSession();
      refresh();
    },
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

  initEditToolbar();
  initHandoverEdit();
  refresh();
})();
