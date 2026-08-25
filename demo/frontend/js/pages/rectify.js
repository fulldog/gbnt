(function (global) {
  'use strict';

  if (!global.AppNav.requireSession('./login.html')) return;
  global.AppNav.setBreadcrumb('专项整改', '专项整改');

  var selectedId = null;
  var pendingDeleteId = null;
  var pageSize = 20;
  var currentPage = 1;
  var regionSelect = null;
  var filterTypeSelect = null;
  var filterStatusSelect = null;
  var updateTableShadow = function () {};

  var TYPE_FILTER_OPTS = [
    { label: '全部', value: '' },
    { label: '机井', value: 'well' },
    { label: '道路', value: 'road' },
    { label: '桥涵闸', value: 'bridge' },
    { label: '林网', value: 'forest' },
    { label: '变压器', value: 'transformer' },
  ];

  var STATUS_FILTER_OPTS = [
    { label: '全部', value: '' },
    { label: '待整改', value: 'pending' },
    { label: '已整改', value: 'done' },
    { label: '已排查', value: 'inspected' },
  ];

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/'/g, '&#39;');
  }

  function cellText(val, opts) {
    opts = opts || {};
    var text = val != null && String(val).trim() !== '' ? String(val) : '—';
    var style = opts.style || '';
    var className = opts.className || '';
    return (
      '<td' +
      (className ? ' class="' + className + '"' : '') +
      (style ? ' style="' + style + '"' : '') +
      '>' +
      escapeHtml(text) +
      '</td>'
    );
  }

  function cellStatus(item) {
    var label = global.AppData.STATUS_LABEL[item.status] || '—';
    var st;
    if (item.status === 'done') {
      st =
        'padding:2px 6px;background:#f6ffed;border:1px solid #b7eb8f;color:#1a7f4b;border-radius:4px;font-size:12px;';
    } else if (item.status === 'inspected') {
      st =
        'padding:2px 6px;background:#e6f4ff;border:1px solid #91caff;color:#015cbb;border-radius:4px;font-size:12px;';
    } else {
      st =
        'padding:2px 6px;background:#fff7e6;border:1px solid #ffd591;color:#c47a06;border-radius:4px;font-size:12px;';
    }
    return '<td><span style="' + st + '">' + escapeHtml(label) + '</span></td>';
  }

  function getFilters() {
    var region = regionSelect
      ? regionSelect.getRegion()
      : { street: '', village: '', naturalVillage: '' };
    return {
      type: filterTypeSelect ? filterTypeSelect.getValue() || '' : '',
      status: filterStatusSelect ? filterStatusSelect.getValue() || '' : '',
      keyword: ($('rf-filter-keyword') && $('rf-filter-keyword').value.trim()) || '',
      street: region.street || '',
      village: region.village || '',
      naturalVillage: region.naturalVillage || '',
    };
  }

  /** 行政区划：街道 + 村/社区 + 自然村（有则拼出） */
  function formatRegion(row) {
    if (global.AppData && typeof global.AppData.formatRegion === 'function') {
      return global.AppData.formatRegion(row) || '—';
    }
    return [row.street, row.village, row.naturalVillage]
      .map(function (s) {
        return String(s || '').trim();
      })
      .filter(Boolean)
      .join('') || '—';
  }

  function formatYear(row) {
    var y = String((row && row.projectYear) || '').trim().replace(/年$/, '');
    return y ? y + '年' : '—';
  }

  /** 排序组：0 逾期 / 1 待整改 / 2 已整改·已排查 */
  function sortGroup(row) {
    if (row.status === 'pending') {
      var rem = global.AppData.planRemain ? global.AppData.planRemain(row.planDate) : null;
      if (rem && rem.overdue) return 0;
      return 1;
    }
    if (row.status === 'done' || row.status === 'inspected') return 2;
    return 9;
  }

  /** 待整改天数权重（逾期/剩余均按天数大的在前）；非待整改返回 0 */
  function pendingDayWeight(row) {
    if (row.status !== 'pending') return 0;
    var rem = global.AppData.planRemain ? global.AppData.planRemain(row.planDate) : null;
    if (!rem) return 0;
    return rem.days + rem.hours / 24;
  }

  /** 已整改/已排查：取最近业务时间 */
  function latestTime(row) {
    if (row.status === 'done') return String(row.rectifyAt || row.createdAt || '');
    if (row.status === 'inspected') {
      return String(row.inspectionDate || row.createdAt || '');
    }
    return String(row.createdAt || '');
  }

  function sortIssues(list) {
    return list.slice().sort(function (a, b) {
      var ga = sortGroup(a);
      var gb = sortGroup(b);
      if (ga !== gb) return ga - gb;
      if (ga === 0 || ga === 1) {
        var da = pendingDayWeight(a);
        var db = pendingDayWeight(b);
        if (db !== da) return db - da;
      }
      return latestTime(b).localeCompare(latestTime(a));
    });
  }

  function filterList() {
    var f = getFilters();
    var list = global.AppData.getIssues().filter(function (row) {
      if (f.type && row.type !== f.type) return false;
      if (f.status && row.status !== f.status) return false;
      if (f.naturalVillage && String(row.naturalVillage || '') !== f.naturalVillage) return false;
      if (f.village && !f.naturalVillage && String(row.village || '') !== f.village) return false;
      if (f.street && !f.village && String(row.street || '') !== f.street) return false;
      if (f.keyword) {
        var kw = f.keyword.toLowerCase();
        var blob = [
          global.AppData.TYPE_LABEL[row.type],
          row.code,
          row.projectYear,
          row.projectName,
          formatRegion(row),
          row.village,
          row.street,
          row.naturalVillage,
          row.reporterName,
          row.reporterPhone,
          row.assigneeName,
          row.description,
        ]
          .join(' ')
          .toLowerCase();
        if (blob.indexOf(kw) === -1) return false;
      }
      return true;
    });
    return sortIssues(list);
  }

  function paginate(list) {
    var start = (currentPage - 1) * pageSize;
    return list.slice(start, start + pageSize);
  }

  function totalPages(count) {
    return Math.max(1, Math.ceil(count / pageSize));
  }

  function renderPagination(total) {
    var right = $('rf-pagi-right');
    var totalEl = $('rf-pagi-total');
    if (totalEl) totalEl.textContent = '共 ' + total + ' 条记录';
    if (!right) return;

    var pages = totalPages(total);
    if (currentPage > pages) currentPage = pages;

    var html = '';
    html +=
      '<div class="pagi-btn disabled" title="第一页"><svg viewBox="0 0 24 24"><path d="M18.41 16.59L13.82 12l4.59-4.59L17 6l-6 6 6 6 1.41-1.41zM6 6h2v12H6z"/></svg></div>';
    html +=
      '<div class="pagi-btn' +
      (currentPage <= 1 ? ' disabled' : '') +
      '" data-pagi="prev"><svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg></div>';
    for (var p = 1; p <= pages && p <= 5; p++) {
      html +=
        '<div class="pagi-btn pagi-num' +
        (p === currentPage ? ' active' : '') +
        '" data-page="' +
        p +
        '">' +
        p +
        '</div>';
    }
    html +=
      '<div class="pagi-btn' +
      (currentPage >= pages ? ' disabled' : '') +
      '" data-pagi="next"><svg viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg></div>';
    right.innerHTML = html;

    right.querySelectorAll('[data-page]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        currentPage = parseInt(btn.getAttribute('data-page'), 10);
        renderTable();
      });
    });
    var prev = right.querySelector('[data-pagi="prev"]');
    var next = right.querySelector('[data-pagi="next"]');
    if (prev && !prev.classList.contains('disabled')) {
      prev.addEventListener('click', function () {
        currentPage -= 1;
        renderTable();
      });
    }
    if (next && !next.classList.contains('disabled')) {
      next.addEventListener('click', function () {
        currentPage += 1;
        renderTable();
      });
    }
  }

  function renderTable() {
    var tbody = $('rf-tbody');
    if (!tbody) return;

    var all = filterList();
    renderPagination(all.length);
    var list = paginate(all);
    var baseIndex = (currentPage - 1) * pageSize;

    if (!list.length) {
      tbody.innerHTML =
        '<tr><td colspan="13" style="text-align:center;color:#999;">暂无记录</td></tr>';
      setTimeout(updateTableShadow, 50);
      return;
    }

    tbody.innerHTML = list
      .map(function (row, i) {
        var active = row.id === selectedId ? ' is-active' : '';
        var typeLabel = global.AppData.TYPE_LABEL[row.type] || row.type;
        var plan = global.AppData.formatPlanStatus(row);
        var rowClass = active;
        if (row.status === 'pending' && plan.level === 'overdue') rowClass += ' is-overdue';
        var countdownClass =
          'col-countdown' + (plan.level === 'overdue' ? ' col-countdown--overdue' : '');
        var inspectionDate = global.AppData.formatInspectionDate
          ? global.AppData.formatInspectionDate(row)
          : '—';
        var planDateText =
          row.status === 'inspected'
            ? '—'
            : global.AppData.formatPlanDateDisplay
              ? global.AppData.formatPlanDateDisplay(row.planDate) || '—'
              : row.planDate || '—';
        var ops =
          '<a class="op-link" data-action="view" data-id="' +
          row.id +
          '">查看</a>' +
          '<a class="op-link" data-action="edit" data-id="' +
          row.id +
          '">编辑</a>' +
          '<a class="op-link del" data-action="del" data-id="' +
          row.id +
          '">删除</a>';

        return (
          '<tr data-id="' +
          row.id +
          '" class="' +
          rowClass +
          '">' +
          '<td class="col-fixed-left" style="text-align:center">' +
          (baseIndex + i + 1) +
          '</td>' +
          cellText(typeLabel) +
          cellText(formatYear(row)) +
          cellText(row.code) +
          cellText(formatRegion(row), { className: 'col-region' }) +
          cellText(row.reporterName) +
          cellText(row.assigneeName) +
          cellText(row.assigneePhone) +
          cellText(inspectionDate, { className: 'col-date' }) +
          cellText(planDateText, { className: 'col-date' }) +
          cellText(plan.text, { className: countdownClass }) +
          cellStatus(row) +
          '<td class="col-fixed-right">' +
          ops +
          '</td></tr>'
        );
      })
      .join('');

    tbody.querySelectorAll('tr[data-id]').forEach(function (tr) {
      tr.addEventListener('click', function () {
        selectRow(tr.getAttribute('data-id'));
      });
    });

    tbody.querySelectorAll('[data-action]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var id = el.getAttribute('data-id');
        var action = el.getAttribute('data-action');
        var row = global.AppData.getIssue(id);
        if (action === 'view' && global.RectifyDetail) {
          global.RectifyDetail.open(row);
          return;
        }
        if (action === 'edit' && global.RectifyForm) {
          global.RectifyForm.open(id, row, renderTable);
          return;
        }
        if (action === 'del') openDeleteModal(id);
      });
    });

    setTimeout(updateTableShadow, 50);
  }

  function selectRow(id) {
    selectedId = id;
    renderTable();
  }

  function openDeleteModal(id) {
    var row = global.AppData.getIssue(id);
    if (!row) return;
    pendingDeleteId = id;
    var body = $('deleteModalBody');
    if (body) {
      body.innerHTML =
        '确定删除 <strong style="color:var(--app-primary)">' +
        escapeHtml(row.code || global.AppData.TYPE_LABEL[row.type]) +
        '</strong> 吗？删除后不可恢复，是否继续？';
    }
    var modal = $('modalDelete');
    if (modal) {
      if (modal.parentNode !== document.body) document.body.appendChild(modal);
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
    }
  }

  function closeDeleteModal() {
    pendingDeleteId = null;
    var modal = $('modalDelete');
    if (modal) {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  function confirmDeleteRow() {
    if (!pendingDeleteId) return;
    var id = pendingDeleteId;
    closeDeleteModal();
    global.AppData.removeIssue(id);
    global.AppData.pushLog('删除问题', id);
    if (selectedId === id) selectedId = null;
    global.AppUI.toast('已删除');
    renderTable();
  }

  function initDeleteModal() {
    var modal = $('modalDelete');
    if (!modal) return;
    if (modal.parentNode !== document.body) document.body.appendChild(modal);
    var cancelBtn = $('rf-delete-cancel');
    var confirmBtn = $('rf-delete-confirm');
    var closeX = $('rf-delete-close-x');
    if (cancelBtn) cancelBtn.addEventListener('click', closeDeleteModal);
    if (closeX) closeX.addEventListener('click', closeDeleteModal);
    if (confirmBtn) confirmBtn.addEventListener('click', confirmDeleteRow);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeDeleteModal();
    });
  }

  function initQuery() {
    if (global.HSFAtomicSelect) {
      filterTypeSelect = global.HSFAtomicSelect.create('rf-filter-type', {
        placeholder: '全部',
        searchPlaceholder: '搜索类型',
        defaultValue: '',
        options: TYPE_FILTER_OPTS,
      });
      filterStatusSelect = global.HSFAtomicSelect.create('rf-filter-status', {
        placeholder: '全部',
        searchPlaceholder: '搜索状态',
        defaultValue: '',
        options: STATUS_FILTER_OPTS,
      });
    }

    if (global.HSFRegionTreeSelect) {
      regionSelect = global.HSFRegionTreeSelect.create('rf-filter-region', {
        searchPlaceholder: '搜索街道 / 村社区 / 自然村',
        expandStreets: false,
      });
    }

    var root = $('query-group-rf');
    var trigger = $('rf-toggle-btn');
    if (trigger && root) {
      var textSpan = trigger.querySelector('.text');
      trigger.onclick = function (e) {
        e.stopPropagation();
        var isCollapsed = root.classList.toggle('collapsed');
        if (textSpan) textSpan.innerText = isCollapsed ? '展开' : '收起';
        window.dispatchEvent(new Event('resize'));
      };
    }

    var btnSearch = $('rf-btn-search');
    var btnReset = $('rf-btn-reset');
    if (btnSearch) {
      btnSearch.addEventListener('click', function () {
        currentPage = 1;
        renderTable();
      });
    }
    if (btnReset) {
      btnReset.addEventListener('click', function () {
        var kw = $('rf-filter-keyword');
        if (kw) kw.value = '';
        if (filterTypeSelect) filterTypeSelect.reset();
        if (filterStatusSelect) filterStatusSelect.reset();
        if (regionSelect) regionSelect.reset();
        currentPage = 1;
        renderTable();
      });
    }
  }

  function exportXlsx() {
    if (!global.HSFRectifyXlsx) {
      global.AppUI.toast('表格组件未加载', 'error');
      return;
    }
    global.HSFRectifyXlsx.exportIssues(filterList());
    global.AppUI.toast('已导出');
  }

  function importXlsx(file) {
    if (!file || !global.HSFRectifyXlsx) return;
    global.HSFRectifyXlsx.importWorkbook(file, function (imported) {
      global.AppData.importIssues(imported);
      global.AppUI.toast('已导入 ' + imported.length + ' 条');
      currentPage = 1;
      renderTable();
    });
  }

  function initTableChrome() {
    var root = $('combined-table-rf');
    if (!root) return;

    var wrap = $('rf-scroll-wrap');
    var table = $('rf-main-table');
    var loader = $('rf-loader');
    var colPanel = $('rf-col-panel');

    var searchBtn = $('rf-btn-toggle-query');
    var queryGroup = $('query-group-rf');
    if (searchBtn && queryGroup) {
      searchBtn.onclick = function (e) {
        e.stopPropagation();
        var isHidden = queryGroup.style.display === 'none';
        queryGroup.style.display = isHidden ? '' : 'none';
        window.dispatchEvent(new Event('resize'));
      };
    }

    updateTableShadow = function () {
      if (!wrap) return;
      var sl = wrap.scrollLeft;
      var max = wrap.scrollWidth - wrap.clientWidth;
      wrap.classList.toggle('is-scrolling-left', sl > 0);
      wrap.classList.toggle('is-scrolling-right', sl < max - 1);
    };
    if (wrap) {
      wrap.addEventListener('scroll', updateTableShadow);
      window.addEventListener('resize', updateTableShadow);
      setTimeout(updateTableShadow, 200);
    }

    var btnFullscreen = root.querySelector('#rf-btn-fullscreen');
    if (btnFullscreen) {
      btnFullscreen.onclick = function (e) {
        e.stopPropagation();
        var container = document.querySelector('.rf-page.content-container') || $('pageContent');
        if (!container) return;
        var isFull = container.classList.toggle('vben-table-fullscreen');
        document.body.style.overflow = isFull ? 'hidden' : '';
        setTimeout(updateTableShadow, 400);
      };
    }

    var btnRefresh = $('btn-refresh');
    if (btnRefresh && loader) {
      btnRefresh.onclick = function (e) {
        e.stopPropagation();
        var svg = this.querySelector('svg');
        if (svg) svg.style.animation = 'spin 1s linear infinite';
        loader.classList.add('show');
        setTimeout(function () {
          if (svg) svg.style.animation = '';
          loader.classList.remove('show');
          renderTable();
          updateTableShadow();
        }, 600);
      };
    }

    var btnCol = $('btn-col-settings');
    var colListWrap = $('rf-col-list-container');
    if (table && colListWrap) {
      var headers = Array.from(table.querySelectorAll('thead th'));
      colListWrap.innerHTML = headers
        .map(function (th, idx) {
          var title = th.querySelector('.th-title');
          var label = title ? title.textContent.trim() : th.innerText.trim();
          return (
            '<div class="col-list-item">' +
            '<input type="checkbox" checked id="rf-chk-' +
            idx +
            '" data-idx="' +
            idx +
            '">' +
            '<label for="rf-chk-' +
            idx +
            '" style="cursor:pointer;flex:1;">' +
            label +
            '</label></div>'
          );
        })
        .join('');

      if (btnCol && colPanel) {
        btnCol.onclick = function (e) {
          e.stopPropagation();
          colPanel.classList.toggle('show');
        };
        document.addEventListener('click', function () {
          colPanel.classList.remove('show');
        });
        colPanel.onclick = function (e) {
          e.stopPropagation();
        };
      }

      colListWrap.addEventListener('change', function (e) {
        if (!e.target.dataset || e.target.dataset.idx === undefined) return;
        var idx = parseInt(e.target.dataset.idx, 10);
        var show = e.target.checked;
        var cells = table.querySelectorAll('tr > *:nth-child(' + (idx + 1) + ')');
        cells.forEach(function (c) {
          c.style.display = show ? '' : 'none';
        });
        updateTableShadow();
      });
    }

    var pagiTrigger = $('rf-pagi-select-trigger');
    var pagiDropdown = $('rf-pagi-dropdown');
    var pagiSizeText = $('rf-pagi-current-size');
    if (pagiTrigger && pagiDropdown) {
      pagiTrigger.onclick = function (e) {
        e.stopPropagation();
        var isOpen = pagiDropdown.classList.toggle('show');
        pagiTrigger.classList.toggle('active', isOpen);
      };
      pagiDropdown.onclick = function (e) {
        var opt = e.target.closest('.pagi-option');
        if (!opt) return;
        e.stopPropagation();
        pagiDropdown.querySelectorAll('.pagi-option').forEach(function (o) {
          o.classList.remove('selected');
        });
        opt.classList.add('selected');
        if (pagiSizeText) pagiSizeText.innerText = opt.innerText;
        pageSize = parseInt(opt.dataset.val, 10) || 20;
        currentPage = 1;
        pagiDropdown.classList.remove('show');
        pagiTrigger.classList.remove('active');
        renderTable();
      };
      document.addEventListener('click', function () {
        pagiDropdown.classList.remove('show');
        pagiTrigger.classList.remove('active');
      });
    }

    var btnAdd = $('rf-btn-add');
    if (btnAdd) {
      btnAdd.addEventListener('click', function () {
        if (global.RectifyForm) global.RectifyForm.open(null, null, renderTable);
      });
    }

    var btnExport = $('rf-btn-export');
    if (btnExport) btnExport.addEventListener('click', exportXlsx);

    var btnImport = $('rf-btn-import');
    var importFile = $('rf-import-file');
    if (btnImport && importFile) {
      btnImport.addEventListener('click', function () {
        importFile.click();
      });
      importFile.addEventListener('change', function (e) {
        var file = e.target.files && e.target.files[0];
        e.target.value = '';
        importXlsx(file);
      });
    }
  }

  initDeleteModal();
  initQuery();
  initTableChrome();
  renderTable();
})(window);
