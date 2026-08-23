/**
 * 专项整改详情弹窗（整改前 / 整改后 双栏）
 */
(function (global) {
  'use strict';

  var BRIDGE_KIND = { bridge: '桥', culvert: '涵', gate: '闸' };

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

  function displayText(val) {
    return val != null && String(val).trim() !== '' ? String(val) : '—';
  }

  function yn(val) {
    if (val === 'yes' || val === true || val === '是') return '是';
    if (val === 'no' || val === false || val === '否') return '否';
    if (val === 'new') return '新建';
    if (val === 'match') return '配套';
    return displayText(val);
  }

  function renderRow(label, value, opts) {
    opts = opts || {};
    var valueClass = 'rf-detail-value' + (opts.valueClass ? ' ' + opts.valueClass : '');
    return (
      '<div class="rf-detail-row">' +
      '<span class="rf-detail-label">' +
      escapeHtml(label) +
      '</span>' +
      '<span class="' +
      valueClass +
      '">' +
      escapeHtml(displayText(value)) +
      '</span></div>'
    );
  }

  function renderBlock(title, bodyHtml) {
    if (!bodyHtml) return '';
    return (
      '<div class="rf-detail-block">' +
      (title
        ? '<div class="rf-detail-block__title">' + escapeHtml(title) + '</div>'
        : '') +
      bodyHtml +
      '</div>'
    );
  }

  function renderPhotoCell(src, loading) {
    if (loading) {
      return (
        '<div class="rf-detail-media m-media is-loading" data-wm-src="' +
        escapeHtml(src) +
        '">' +
        '<span class="m-media__ph" aria-hidden="true">img</span>' +
        '<div class="m-media__skel" aria-hidden="true"></div>' +
        '<img class="rf-detail-thumb" alt="" /></div>'
      );
    }
    return (
      '<div class="rf-detail-media m-media is-ready">' +
      '<img class="rf-detail-thumb" src="' +
      escapeHtml(src) +
      '" alt="" data-preview-src="' +
      escapeHtml(src) +
      '" /></div>'
    );
  }

  function renderPhotos(photos, variant, loading) {
    if (!photos || !photos.length) return '';
    var cls = 'rf-detail-photos';
    if (variant === 'hero') cls += ' rf-detail-photos--hero';
    var cells = photos
      .slice(0, 6)
      .map(function (src) {
        return renderPhotoCell(src, !!loading);
      })
      .join('');
    return '<div class="' + cls + '">' + cells + '</div>';
  }

  function renderMetaFooter(rowsHtml) {
    if (!rowsHtml) return '';
    return (
      '<div class="rf-detail-meta">' +
      '<div class="rf-detail-meta__title">联系与时限</div>' +
      '<div class="rf-detail-rows">' +
      rowsHtml +
      '</div></div>'
    );
  }

  function photoSources(item, kind) {
    if (kind === 'after') {
      return item.rectifyPhotos && item.rectifyPhotos.length ? item.rectifyPhotos.slice() : [];
    }
    if (item.photos && item.photos.length) return item.photos.slice();
    return item.photoSrc ? [item.photoSrc] : [];
  }

  function photoMeta(item, kind) {
    if (!global.AppWatermark) return {};
    var meta = global.AppWatermark.metaFromIssue(item);
    if (kind === 'after' && item.rectifyAt) {
      meta.time = global.AppWatermark.formatDateZh(item.rectifyAt);
    }
    return meta;
  }

  function buildTypeFields(item) {
    var html = '';
    var i = item;

    if (i.type === 'well' && i.well) {
      var w = i.well;
      html += renderRow('建设类型', yn(w.buildKind));
      html += renderRow('机井出水', yn(w.waterOut));
      html += renderRow('管道连接', yn(w.pipeOk));
      html += renderRow('走线规范', yn(w.wiringOk));
      html += renderRow('配电箱', yn(w.boxOk));
      html += renderRow('井盖完好', yn(w.coverOk));
      html += renderRow('出水口总数', w.outletTotal != null ? w.outletTotal + ' 个' : '');
      html += renderRow('出水口损坏', w.outletDamaged != null ? w.outletDamaged + ' 个' : '');
      html += renderRow('护筒总数', w.casingTotal != null ? w.casingTotal + ' 个' : '');
      html += renderRow('护筒损坏', w.casingDamaged != null ? w.casingDamaged + ' 个' : '');
      html += renderRow('井长及负责人', w.keeperName);
      html += renderRow('联系电话', w.keeperPhone);
    } else if (i.type === 'road') {
      var r = i.road || {};
      var len = r.length != null ? r.length : i.length;
      var wid = r.width != null ? r.width : i.width;
      var thk = r.thickness != null ? r.thickness : i.thickness;
      var trees = r.treeSurvive != null ? r.treeSurvive : i.treeSurvive;
      html += renderRow('长度', len != null && len !== '' ? len + ' km' : '');
      html += renderRow('宽度', wid != null && wid !== '' ? wid + ' m' : '');
      html += renderRow('厚度', thk != null && thk !== '' ? thk + ' m' : '');
      html += renderRow('路肩', r.hasShoulder ? yn(r.hasShoulder) : i.hasShoulder);
      html += renderRow('灰土层', r.hasAsh ? yn(r.hasAsh) : i.hasAsh);
      html += renderRow('林网存活', trees != null && trees !== '' ? trees + ' 棵' : '');
      html += renderRow('负责人', r.keeperName);
      html += renderRow('联系电话', r.keeperPhone);
    } else if (i.type === 'bridge') {
      var b = i.bridge || {};
      var bl = b.length != null ? b.length : i.length;
      var bw = b.width != null ? b.width : i.width;
      html += renderRow('设施类型', BRIDGE_KIND[b.kind] || i.bridgeKindLabel || '');
      html += renderRow('长度', bl != null && bl !== '' ? bl + ' m' : '');
      html += renderRow('宽度', bw != null && bw !== '' ? bw + ' m' : '');
      html += renderRow('负责人', b.keeperName);
      html += renderRow('联系电话', b.keeperPhone);
    } else if (i.type === 'forest' && i.forest) {
      var f = i.forest;
      html += renderRow('移交株数', f.handoverCount != null ? f.handoverCount + ' 株' : '');
      html += renderRow('现有株数', f.existingCount != null ? f.existingCount + ' 株' : '');
      html += renderRow('存活率', f.surviveRate != null ? f.surviveRate + '%' : '');
      html += renderRow('断带', yn(f.brokenBelt));
      html += renderRow('枯死木', yn(f.deadTrees));
      html += renderRow('病虫害', yn(f.pest));
      html += renderRow('负责人', f.keeperName);
      html += renderRow('联系电话', f.keeperPhone);
    } else if (i.type === 'transformer' && i.transformer) {
      var t = i.transformer;
      html += renderRow('容量', t.capacity != null ? t.capacity + ' kVA' : '');
      html += renderRow('型号', t.model);
      html += renderRow('电压', t.voltage);
      html += renderRow('通电', yn(t.powered));
      html += renderRow('设备完好', yn(t.deviceOk));
      html += renderRow('配电完好', yn(t.cabinetOk));
      html += renderRow('私拉乱接', yn(t.illegalWire));
      html += renderRow('负责人', t.keeperName);
      html += renderRow('联系电话', t.keeperPhone);
    }

    return html;
  }

  function buildBeforePanel(item, plan, sources, photoLoading) {
    sources = sources || [];
    var measures =
      (item.measures || (item.well && item.well.rectifyMeasure) || item.rectifyPlan || '').trim();
    var typeLabel = global.AppData.TYPE_LABEL[item.type] || item.type;
    var typeFields = buildTypeFields(item);

    var body = '';

    if (sources.length) {
      body += renderBlock('', renderPhotos(sources, 'hero', photoLoading));
    } else {
      body += renderBlock(
        '',
        '<div class="rf-detail-photos rf-detail-photos--hero rf-detail-photos--empty">暂无现场照片</div>'
      );
    }

    body += renderBlock(
      '问题描述',
      '<p class="rf-detail-block__text">' + escapeHtml(displayText(item.description)) + '</p>'
    );

    body += renderBlock(
      '现场地址',
      '<p class="rf-detail-block__text">' +
        escapeHtml(displayText(item.address || item.locationText)) +
        '</p>'
    );

    body += renderBlock(
      '基本信息',
      '<div class="rf-detail-rows">' +
        renderRow('问题类型', typeLabel) +
        renderRow('项目名称', item.projectName) +
        renderRow('问题编号', item.code) +
        renderRow('街道', item.street) +
        renderRow('村/社区', item.village) +
        '</div>'
    );

    if (typeFields) {
      body += renderBlock('问题明细', '<div class="rf-detail-rows">' + typeFields + '</div>');
    }

    if (measures) {
      body += renderBlock(
        '整改措施',
        '<p class="rf-detail-block__text">' + escapeHtml(measures) + '</p>'
      );
    }

    body += renderMetaFooter(
      renderRow('整改责任人', item.assigneeName) +
        renderRow('联系电话', item.assigneePhone) +
        renderRow('计划完成', item.planDate) +
        renderRow('倒计时', plan.text, {
          valueClass: plan.level === 'overdue' ? 'rf-detail-countdown--overdue' : '',
        }) +
        renderRow('上报人', item.reporterName) +
        renderRow('上报电话', item.reporterPhone) +
        renderRow('上报时间', global.AppData.formatTime(item.createdAt))
    );

    return (
      '<section class="rf-detail-panel rf-detail-panel--before" aria-label="整改前">' +
      '<div class="rf-detail-panel__hd">整改前</div>' +
      '<div class="rf-detail-panel__bd">' +
      body +
      '</div></section>'
    );
  }

  function buildPendingAfter(item, plan) {
    var rem = global.AppData.planRemain(item.planDate);
    var overdue = plan && plan.level === 'overdue';
    var warn = plan && plan.level === 'warn';
    var stateClass = overdue ? ' is-overdue' : warn ? ' is-warn' : '';
    var countdownBlock = '';

    if (rem) {
      countdownBlock =
        '<div class="rf-detail-wait-count' +
        stateClass +
        '">' +
        '<div class="rf-detail-wait-count__label">' +
        (overdue ? '已逾期' : '剩余时间') +
        '</div>' +
        '<div class="rf-detail-wait-count__nums" aria-label="' +
        escapeHtml(plan.text) +
        '">' +
        '<span class="rf-detail-wait-count__part"><span class="rf-detail-wait-count__n">' +
        rem.days +
        '</span><span class="rf-detail-wait-count__u">天</span></span>' +
        '<span class="rf-detail-wait-count__part"><span class="rf-detail-wait-count__n">' +
        rem.hours +
        '</span><span class="rf-detail-wait-count__u">时</span></span>' +
        '</div>' +
        '<div class="rf-detail-wait-count__plan">计划完成 ' +
        escapeHtml(displayText(item.planDate)) +
        '</div></div>';
    } else {
      countdownBlock =
        '<div class="rf-detail-wait-count">' +
        '<div class="rf-detail-wait-count__label">计划完成</div>' +
        '<div class="rf-detail-wait-count__plan-only">' +
        escapeHtml(displayText(item.planDate)) +
        '</div></div>';
    }

    return (
      '<div class="rf-detail-wait">' +
      countdownBlock +
      '<div class="rf-detail-wait__slots" aria-hidden="true">' +
      '<span class="rf-detail-wait__slot"></span>' +
      '<span class="rf-detail-wait__slot"></span>' +
      '</div>' +
      '<p class="rf-detail-wait__hint">整改人提交结果后，照片与说明将在此展示</p>' +
      '<div class="rf-detail-wait__meta">' +
      '<div class="rf-detail-rows">' +
      renderRow('整改责任人', item.assigneeName) +
      renderRow('联系电话', item.assigneePhone) +
      '</div></div></div>'
    );
  }

  function buildAfterPanel(item, plan, sources, photoLoading) {
    sources = sources || [];
    var isDone = item.status === 'done';
    var panelClass =
      'rf-detail-panel rf-detail-panel--after' + (isDone ? ' is-done' : ' is-pending');
    var body = '';

    if (!isDone) {
      body = buildPendingAfter(item, plan);
    } else {
      var note = (item.rectifyNote || '').trim();

      if (sources.length) {
        body += renderBlock('', renderPhotos(sources, 'hero', photoLoading));
      } else {
        body += renderBlock(
          '',
          '<div class="rf-detail-photos rf-detail-photos--hero rf-detail-photos--empty">暂无整改后照片</div>'
        );
      }

      body += renderBlock(
        '整改说明',
        '<p class="rf-detail-block__text">' + escapeHtml(displayText(note)) + '</p>'
      );

      body += renderMetaFooter(
        renderRow(
          '完成时间',
          item.rectifyAt ? global.AppData.formatTime(item.rectifyAt) : '—',
          { valueClass: 'rf-detail-value--done' }
        )
      );
    }

    return (
      '<section class="' +
      panelClass +
      '" aria-label="整改后">' +
      '<div class="rf-detail-panel__hd">整改后</div>' +
      '<div class="rf-detail-panel__bd">' +
      body +
      '</div></section>'
    );
  }

  function applyWatermarksInPanel(panel, meta) {
    if (!panel || !global.AppWatermark || !global.AppWatermark.apply) return;
    panel.querySelectorAll('.m-media.is-loading[data-wm-src]').forEach(function (cell) {
      var src = cell.getAttribute('data-wm-src');
      if (!src) return;
      global.AppWatermark.apply(src, meta)
        .then(function (baked) {
          var overlay = $('rf-detail-overlay');
          if (!overlay || !overlay.classList.contains('open') || !cell.isConnected) return;
          var img = cell.querySelector('img');
          if (!img) return;
          img.src = baked;
          img.setAttribute('data-preview-src', baked);
          cell.classList.remove('is-loading');
          cell.classList.add('is-ready');
          cell.removeAttribute('data-wm-src');
        })
        .catch(function () {
          if (!cell.isConnected) return;
          if (global.AppLog) global.AppLog.warn('rectify-detail', 'watermark fail', src);
          cell.classList.remove('is-loading');
          cell.classList.add('is-error');
          cell.removeAttribute('data-wm-src');
        });
    });
  }

  function bindPhotoPreview(root) {
    if (!root || !global.AppWatermark) return;
    if (root.dataset.rfPreviewBound === '1') return;
    root.dataset.rfPreviewBound = '1';
    root.addEventListener('click', function (e) {
      var img = e.target.closest('.rf-detail-thumb');
      if (!img || !root.contains(img)) return;
      var cell = img.closest('.m-media');
      if (cell && !cell.classList.contains('is-ready')) return;
      e.stopPropagation();
      var src = img.getAttribute('data-preview-src') || img.src;
      if (!src) return;
      global.AppWatermark.openPreview(src, null, { baked: true });
    });
  }

  function toggle(open) {
    var overlay = $('rf-detail-overlay');
    if (!overlay) return;
    if (open) {
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    } else {
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      if (global.AppWatermark) global.AppWatermark.closePreview();
    }
  }

  function open(item) {
    if (!item) return;
    var overlay = $('rf-detail-overlay');
    if (overlay && overlay.parentNode !== document.body) {
      document.body.appendChild(overlay);
    }

    var plan = global.AppData.formatPlanStatus(item);
    var panelsEl = $('rf-detail-panels');
    if (!panelsEl) {
      toggle(true);
      return;
    }

    var beforeSrc = photoSources(item, 'before');
    var afterSrc = item.status === 'done' ? photoSources(item, 'after') : [];
    var hasPhotos = beforeSrc.length || afterSrc.length;

    panelsEl.innerHTML =
      buildBeforePanel(item, plan, beforeSrc, hasPhotos) +
      buildAfterPanel(item, plan, afterSrc, hasPhotos && item.status === 'done');
    toggle(true);

    if (!hasPhotos) return;

    var beforePanel = panelsEl.querySelector('.rf-detail-panel--before');
    var afterPanel = panelsEl.querySelector('.rf-detail-panel--after');
    if (beforeSrc.length) {
      applyWatermarksInPanel(beforePanel, photoMeta(item, 'before'));
    }
    if (afterSrc.length) {
      applyWatermarksInPanel(afterPanel, photoMeta(item, 'after'));
    }
  }

  function close() {
    toggle(false);
  }

  function init() {
    var closeBtn = $('rf-detail-btn-close');
    var overlay = $('rf-detail-overlay');
    var panelsEl = $('rf-detail-panels');
    bindPhotoPreview(panelsEl);
    if (closeBtn) closeBtn.onclick = close;
    if (overlay) {
      overlay.onclick = function (e) {
        if (e.target === overlay) close();
      };
    }
  }

  global.RectifyDetail = { open: open, close: close, init: init };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
