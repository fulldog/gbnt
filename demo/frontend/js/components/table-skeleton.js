/**
 * TableSkeleton Builder — 生成统一的数据列表骨架 (showcase 结构)
 *
 * 用法：
 *   const sk = buildTableSkeleton({
 *     title: '客户列表',
 *     tools: `...按钮 HTML...`,
 *     tableId: 'dataTable',
 *   });
 *   document.getElementById('table-container').appendChild(sk);
 *
 *   之后：renderTableHead(), renderTableRows(), renderPagination()
 */

function buildTableSkeleton(opts) {
  const { title = '数据列表', tools = '', tableId = 'dataTable' } = opts;

  const box = document.createElement('div');
  box.className = 'table-combined-box';
  const uid = tableId;

  box.innerHTML = `
    <div id="section-table-header">
      <div class="table-tools-v102">
        <div class="tools-left-title">${title}</div>
        <div class="tools-right-ops">${tools}</div>
      </div>
    </div>
    <div id="section-table-body">
      <div class="fixed-table-container">
        <table class="vben-table-std" id="${uid}">
          <thead id="${uid}-head"><tr></tr></thead>
          <tbody id="${uid}-body"></tbody>
        </table>
      </div>
    </div>
    <div id="section-pagination"></div>
  `;

  return box;
}

function escapeTableHead(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 按列标题推断列宽 class（样式见 components.css .col-w-*） */
function inferColClass(label) {
  var t = String(label || '').trim();
  if (t === '序号') return 'col-w-seq';
  if (t === '操作') return 'col-actions';
  if (/时间|日期/.test(t)) return 'col-w-datetime';
  if (/手机|电话/.test(t)) return 'col-w-phone';
  if (/编号|编码|单号/.test(t)) return 'col-w-code';
  if (/状态|来源|类型/.test(t)) return 'col-w-tag';
  if (/门店|治疗师|姓名|课程|项目|客户|标题|名称/.test(t)) return 'col-w-text-md';
  return 'col-w-text';
}

function normalizeTableColumn(c) {
  if (c && typeof c === 'object' && c.label != null) {
    return { label: c.label, cls: c.cls || inferColClass(c.label) };
  }
  var label = String(c);
  return { label: label, cls: inferColClass(label) };
}

function renderTableHead(tableId, columns) {
  const thead = document.getElementById(tableId + '-head');
  if (!thead) return;
  const cols = columns.map(normalizeTableColumn);
  thead.innerHTML =
    '<tr>' +
    cols
      .map(function (c) {
        return '<th class="' + c.cls + '">' + escapeTableHead(c.label) + '</th>';
      })
      .join('') +
    '</tr>';
}

/** 将表头列 class 同步到 tbody（与 TzttAdmin.syncRowColClasses 相同） */
function syncRowColClasses(tableId) {
  var headRow = document.querySelector('#' + tableId + '-head tr');
  if (!headRow) return;
  var ths = headRow.children;
  var rows = document.querySelectorAll('#' + tableId + '-body tr');
  for (var r = 0; r < rows.length; r++) {
    var tr = rows[r];
    var tds = tr.children;
    if (tds.length === 1 && tds[0].colSpan > 1) continue;
    for (var i = 0; i < tds.length && i < ths.length; i++) {
      var td = tds[i];
      var fixed = [];
      if (td.classList.contains('col-fixed-left')) fixed.push('col-fixed-left');
      if (td.classList.contains('col-fixed-right')) fixed.push('col-fixed-right');
      td.className = ths[i].className;
      for (var j = 0; j < fixed.length; j++) td.classList.add(fixed[j]);
    }
  }
}

function renderTableRows(tableId, rowsHtml) {
  const tbody = document.getElementById(tableId + '-body');
  if (!tbody) return;
  tbody.innerHTML = rowsHtml;
}

function renderPagination(pagiContainerId, total, currentPage, pageSize, goPageFn) {
  var container = document.getElementById(pagiContainerId);
  if (!container) return;

  var totalPages = Math.ceil(total / pageSize) || 1;
  var fn = goPageFn || 'goPage';
  var uid = 'pagi-' + Date.now();

  var leftHtml = '<div class="pagi-left">'
    + '<span>共 ' + total + ' 条记录</span>'
    + '<div class="pagi-custom-select" id="' + uid + '-trigger">'
    + '<span id="' + uid + '-size">' + pageSize + '条/页</span>'
    + '<svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5H7z"/></svg>'
    + '<div class="pagi-dropdown" id="' + uid + '-drop">'
    + [10,20,30,50,100].map(function(v) {
        return '<div class="pagi-option' + (v === pageSize ? ' selected' : '') + '" data-val="' + v + '">' + v + '条/页</div>';
      }).join('')
    + '</div></div></div>';

  // Right: navigation buttons
  var rightHtml = '<div class="pagi-right">';

  // First page
  rightHtml += '<div class="pagi-btn' + (currentPage <= 1 ? ' disabled' : '') + '" onclick="' + fn + '(1)" title="第一页">'
    + '<svg viewBox="0 0 24 24"><path d="M18.41 16.59L13.82 12l4.59-4.59L17 6l-6 6 6 6 1.41-1.41zM6 6h2v12H6z"/></svg></div>';

  // Previous 5
  rightHtml += '<div class="pagi-btn' + (currentPage <= 1 ? ' disabled' : '') + '" onclick="' + fn + '(' + Math.max(1, currentPage - 5) + ')" title="向前 5 页">'
    + '<svg viewBox="0 0 24 24"><path d="M11.5 12l8.5 6V6l-8.5 6zm-9 0l8.5 6V6l-8.5 6z"/></svg></div>';

  // Previous
  rightHtml += '<div class="pagi-btn' + (currentPage <= 1 ? ' disabled' : '') + '" onclick="' + fn + '(' + (currentPage - 1) + ')" title="上一页">'
    + '<svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg></div>';

  // Page numbers
  var maxVisible = 5;
  var start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  var end = Math.min(totalPages, start + maxVisible - 1);
  if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);
  if (start > 1) rightHtml += '<div class="pagi-btn disabled">...</div>';
  for (var i = start; i <= end; i++) {
    rightHtml += '<div class="pagi-btn pagi-num' + (i === currentPage ? ' active' : '') + '" onclick="' + fn + '(' + i + ')">' + i + '</div>';
  }
  if (end < totalPages) rightHtml += '<div class="pagi-btn disabled">...</div>';

  // Next
  rightHtml += '<div class="pagi-btn' + (currentPage >= totalPages ? ' disabled' : '') + '" onclick="' + fn + '(' + (currentPage + 1) + ')" title="下一页">'
    + '<svg viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg></div>';

  // Next 5
  rightHtml += '<div class="pagi-btn' + (currentPage >= totalPages ? ' disabled' : '') + '" onclick="' + fn + '(' + Math.min(totalPages, currentPage + 5) + ')" title="向后 5 页">'
    + '<svg viewBox="0 0 24 24"><path d="M18.5 12l-8.5-6v12l8.5-6zm-9 0l-8.5-6v12l8.5-6z"/></svg></div>';

  // Last page
  rightHtml += '<div class="pagi-btn' + (currentPage >= totalPages ? ' disabled' : '') + '" onclick="' + fn + '(' + totalPages + ')" title="最后一页">'
    + '<svg viewBox="0 0 24 24"><path d="M5.59 7.41L10.18 12l-4.59 4.59L7 18l6-6-6-6-1.41 1.41zM18 6h2v12h-2z"/></svg></div>';

  rightHtml += '</div>';

  container.innerHTML = '<div class="pagination-bar">' + leftHtml + rightHtml + '</div>';

  // Bind page size selector
  var trigger = document.getElementById(uid + '-trigger');
  var drop = document.getElementById(uid + '-drop');
  if (trigger && drop) {
    trigger.onclick = function(e) { e.stopPropagation(); drop.classList.toggle('show'); };
    drop.onclick = function(e) { e.stopPropagation(); };
    drop.querySelectorAll('.pagi-option').forEach(function(opt) {
      opt.onclick = function() {
        drop.querySelectorAll('.pagi-option').forEach(function(o) { o.classList.remove('selected'); });
        this.classList.add('selected');
        document.getElementById(uid + '-size').textContent = this.dataset.val + '条/页';
        drop.classList.remove('show');
      };
    });
  }
}
