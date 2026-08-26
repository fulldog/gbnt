/**
 * 专项整改详情弹窗（整改前 / 整改后 双栏）
 * 左栏对齐移动端巡查详情字段结构；Web 额外展示整改责任人
 */
(function (global) {
  'use strict';

  var BRIDGE_KIND = { bridge: '桥', culvert: '涵', gate: '闸' };
  var YN_MAP = {
    yes: '是',
    no: '否',
    new: '新建',
    match: '配套',
    '10kv': '10kV',
    '0.4kv': '0.4kV',
  };

  var QUIZ_META = {
    well: {
      blockKey: 'well',
      fields: ['waterOut', 'pipeOk', 'wiringOk', 'boxOk', 'coverOk'],
      names: {
        waterOut: '机井是否出水',
        pipeOk: '管道是否按要求连接',
        wiringOk: '走线是否规范',
        boxOk: '配电箱及电表等设施是否完好',
        coverOk: '井台、井盖是否完整',
      },
      hints: { waterOut: '(≥1分钟)' },
    },
    road: {
      blockKey: 'road',
      fields: ['hasShoulder', 'hasAsh', 'hasRoadDamage'],
      names: {
        hasShoulder: '是否有路肩',
        hasAsh: '是否有灰土层',
        hasRoadDamage: '是否有道路损坏',
      },
      hints: {},
    },
    bridge: {
      blockKey: 'bridge',
      fields: ['needsRectify'],
      names: { needsRectify: '是否有淤堵与损坏' },
      hints: {},
    },
    forest: {
      blockKey: 'forest',
      fields: ['brokenBelt', 'deadTrees', 'pest'],
      names: {
        brokenBelt: '林带是否断带',
        deadTrees: '是否有枯死木',
        pest: '是否发现病虫害',
      },
      hints: {},
    },
    transformer: {
      blockKey: 'transformer',
      fields: ['powered', 'deviceOk', 'cabinetOk', 'illegalWire'],
      names: {
        powered: '是否通电',
        deviceOk: '设备是否完好',
        cabinetOk: '配电设施是否完好',
        illegalWire: '是否私拉乱接',
      },
      hints: {},
    },
  };

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
    if (val == null || val === '') return '—';
    if (YN_MAP[val] != null) return YN_MAP[val];
    if (val === true || val === '是') return '是';
    if (val === false || val === '否') return '否';
    return displayText(val);
  }

  function normalizeAnswer(v) {
    if (v === 'yes' || v === 'no') return v;
    if (v === '是') return 'yes';
    if (v === '否') return 'no';
    return v ? String(v) : '';
  }

  function regionLine(item) {
    return [item.street || '', item.village || '', item.naturalVillage || '']
      .filter(Boolean)
      .join('');
  }

  function formatProjectYear(item) {
    if (item.projectYear) return String(item.projectYear).replace(/年$/, '') + '年';
    return '—';
  }

  function formatInspectionDate(item) {
    if (global.AppData && typeof AppData.formatInspectionDate === 'function') {
      return AppData.formatInspectionDate(item) || '—';
    }
    return '—';
  }

  function formatPlanDate(item) {
    if (global.AppData && typeof AppData.formatPlanDateDisplay === 'function') {
      return AppData.formatPlanDateDisplay(item.planDate) || displayText(item.planDate);
    }
    return displayText(item.planDate);
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
        '<span class="m-media__ph" aria-hidden="true"></span>' +
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
    if (variant === 'quiz') cls += ' rf-detail-photos--quiz';
    var cells = photos
      .slice(0, 6)
      .map(function (src) {
        return renderPhotoCell(src, !!loading);
      })
      .join('');
    return '<div class="' + cls + '">' + cells + '</div>';
  }

  function renderMetaFooter(title, rowsHtml) {
    if (!rowsHtml) return '';
    return (
      '<div class="rf-detail-meta">' +
      '<div class="rf-detail-meta__title">' +
      escapeHtml(title || '责任与时限') +
      '</div>' +
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

  function typeBlock(item) {
    var meta = QUIZ_META[item.type];
    if (!meta) return null;
    return item[meta.blockKey] || null;
  }

  function collectQuizPhotoSet(item, meta, block) {
    var set = {};
    if (!meta) return set;
    meta.fields.forEach(function (field) {
      var slot = getQuizSlot(item, field, block);
      if (slot && slot.photos && slot.photos.length) {
        slot.photos.forEach(function (p) {
          if (p) set[p] = true;
        });
      }
    });
    return set;
  }

  function getWellFillPhotos(item) {
    var w = item.well || {};
    if (w.fillPhotos && w.fillPhotos.length) {
      return w.fillPhotos.filter(Boolean);
    }
    var quizSet = collectQuizPhotoSet(item, QUIZ_META.well, w);
    var fill = [];
    (item.photos || []).forEach(function (p) {
      if (p && !quizSet[p]) fill.push(p);
    });
    return fill;
  }

  function buildWellFillPhotosBlock(item, photoLoading) {
    var photos = getWellFillPhotos(item);
    if (!photos.length) return '';
    return (
      '<div class="rf-detail-row rf-detail-row--fill-photos">' +
      '<span class="rf-detail-label">全景照片</span>' +
      '<div class="rf-detail-value rf-detail-value--photos">' +
      renderPhotos(photos, 'quiz', photoLoading) +
      '</div></div>'
    );
  }

  function getQuizSlot(item, field, block) {
    if (item.quizSteps && item.quizSteps[field]) {
      return item.quizSteps[field];
    }
    if (block && block.quizSteps && block.quizSteps[field]) {
      return block.quizSteps[field];
    }
    var ans = block && block[field] != null ? block[field] : item[field];
    if (field === 'needsRectify' && block && block.needsRectify) {
      ans = block.needsRectify;
    }
    ans = normalizeAnswer(ans);
    if (!ans) return null;
    return { answer: ans, desc: '', photos: [] };
  }

  function collectQuizPhotoSrcs(item) {
    var meta = QUIZ_META[item.type];
    if (!meta) return [];
    var block = typeBlock(item);
    var out = [];
    meta.fields.forEach(function (field) {
      var slot = getQuizSlot(item, field, block);
      if (!slot || !slot.photos) return;
      slot.photos.forEach(function (p) {
        if (p) out.push(p);
      });
    });
    return out;
  }

  function buildFillFields(item, photoLoading) {
    var html = '';
    if (item.type === 'well') {
      var w = item.well || {};
      html += renderRow('设施类型', yn(w.buildKind));
      html += renderRow('出水口总数', w.outletTotal != null ? w.outletTotal + ' 个' : '');
      html += renderRow('出水口损坏', w.outletDamaged != null ? w.outletDamaged + ' 个' : '');
      html += renderRow('护筒总数', w.casingTotal != null ? w.casingTotal + ' 个' : '');
      html += renderRow('护筒损坏', w.casingDamaged != null ? w.casingDamaged + ' 个' : '');
      html += buildWellFillPhotosBlock(item, photoLoading);
    } else if (item.type === 'road') {
      var r = item.road || {};
      var len = r.length != null ? r.length : item.length;
      var wid = r.width != null ? r.width : item.width;
      var thk = r.thickness != null ? r.thickness : item.thickness;
      html += renderRow('长度', len != null && len !== '' ? len + ' 千米' : '');
      html += renderRow('宽度', wid != null && wid !== '' ? wid + ' 米' : '');
      html += renderRow('厚度', thk != null && thk !== '' ? thk + ' 米' : '');
    } else if (item.type === 'bridge') {
      var b = item.bridge || {};
      var bl = b.length != null ? b.length : item.length;
      var bw = b.width != null ? b.width : item.width;
      html += renderRow('设施类型', BRIDGE_KIND[b.kind] || item.bridgeKindLabel || '');
      html += renderRow('长度', bl != null && bl !== '' ? bl + ' 米' : '');
      html += renderRow('宽度', bw != null && bw !== '' ? bw + ' 米' : '');
    } else if (item.type === 'forest') {
      var f = item.forest || {};
      html += renderRow('移交株数', f.handoverCount != null ? f.handoverCount + ' 株' : '');
      html += renderRow('现有株数', f.existingCount != null ? f.existingCount + ' 株' : '');
    } else if (item.type === 'transformer') {
      var t = item.transformer || {};
      html += renderRow('容量', t.capacity != null ? t.capacity + ' kVA' : '');
      html += renderRow('型号', t.model);
      html += renderRow('电压等级', yn(t.voltage) || t.voltage);
    }
    return html;
  }

  function buildChecklist(item, photoLoading) {
    var meta = QUIZ_META[item.type];
    if (!meta) return '';
    var block = typeBlock(item);
    var items = '';

    meta.fields.forEach(function (field) {
      var slot = getQuizSlot(item, field, block);
      if (!slot || !slot.answer) return;
      var hint = (meta.hints && meta.hints[field]) || '';
      var label = (meta.names && meta.names[field]) || field;
      var ansText = yn(slot.answer);
      var ansCls =
        slot.answer === 'yes' ? 'rf-detail-quiz-ans--yes' : 'rf-detail-quiz-ans--no';
      var desc = (slot.desc || '').trim();
      var photos = [];
      if (slot.photos && slot.photos.length) {
        slot.photos.forEach(function (p) {
          if (p) photos.push(p);
        });
      }

      items +=
        '<article class="rf-detail-quiz-item">' +
        '<div class="rf-detail-quiz-hd">' +
        '<span class="rf-detail-quiz-q">' +
        escapeHtml(label + hint) +
        '</span>' +
        '<span class="rf-detail-quiz-ans ' +
        ansCls +
        '">' +
        escapeHtml(ansText) +
        '</span></div>' +
        (desc
          ? '<p class="rf-detail-quiz-desc">' + escapeHtml(desc) + '</p>'
          : '') +
        (photos.length ? renderPhotos(photos, 'quiz', photoLoading) : '') +
        '</article>';
    });

    if (!items) return '';
    return renderBlock('排查清单', '<div class="rf-detail-quiz-list">' + items + '</div>');
  }

  /** 排查上报签名；三态均可展示（整改责任人不另签） */
  function buildSignature(item) {
    var src = item.reporterSignature || '';
    if (!src) return '';
    return renderBlock(
      '电子签名',
      '<div class="rf-detail-sign-board">' +
        '<div class="rf-detail-media m-media is-loading rf-detail-sign-media">' +
        '<div class="m-media__skel" aria-hidden="true"></div>' +
        '<img class="rf-detail-sign-img" src="' +
        escapeHtml(src) +
        '" alt="" />' +
        '</div></div>'
    );
  }

  function buildBasicBlock(item, photoLoading) {
    var typeLabel = (global.AppData && AppData.TYPE_LABEL[item.type]) || item.type;
    var rows =
      renderRow('问题类型', typeLabel) +
      renderRow('行政区划', regionLine(item)) +
      renderRow('项目年度', formatProjectYear(item)) +
      renderRow('设施编号', item.code) +
      renderRow('排查日期', formatInspectionDate(item)) +
      buildFillFields(item, photoLoading) +
      renderRow('现场地址', item.address || item.locationText);
    return renderBlock('基本信息', '<div class="rf-detail-rows">' + rows + '</div>');
  }

  function buildLegacyFallback(item, sources, photoLoading) {
    var html = '';
    if (sources.length) {
      html += renderBlock('', renderPhotos(sources, 'hero', photoLoading));
    }
    var desc = (item.description || '').trim();
    if (desc) {
      html += renderBlock(
        '问题描述',
        '<p class="rf-detail-block__text">' + escapeHtml(desc) + '</p>'
      );
    }
    return html;
  }

  function buildBeforePanel(item, plan, photoLoading) {
    var quizHtml = buildChecklist(item, photoLoading);
    var quizPhotos = collectQuizPhotoSrcs(item);
    var legacySrc = quizPhotos.length ? [] : photoSources(item, 'before');
    var body = '';

    body += buildBasicBlock(item, photoLoading);

    if (quizHtml) {
      body += quizHtml;
    } else {
      body += buildLegacyFallback(item, legacySrc, photoLoading);
    }

    body += buildSignature(item);

    body += renderMetaFooter(
      '责任与时限',
      renderRow('整改责任人', item.assigneeName) +
        renderRow('联系电话', item.assigneePhone) +
        renderRow('计划完成', formatPlanDate(item)) +
        '<div class="rf-detail-meta__split" role="presentation"></div>' +
        renderRow('上报人', item.reporterName) +
        renderRow('上报电话', item.reporterPhone) +
        renderRow(
          '上报时间',
          global.AppData ? AppData.formatTime(item.createdAt) : item.createdAt
        )
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
        escapeHtml(formatPlanDate(item)) +
        '</div></div>';
    } else {
      countdownBlock =
        '<div class="rf-detail-wait-count">' +
        '<div class="rf-detail-wait-count__label">计划完成</div>' +
        '<div class="rf-detail-wait-count__plan-only">' +
        escapeHtml(formatPlanDate(item)) +
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

  function buildInspectedAfter() {
    return (
      '<div class="rf-detail-wait rf-detail-wait--inspected">' +
      '<p class="rf-detail-wait__hint">排查无问题，无需整改</p>' +
      '</div>'
    );
  }

  function buildAfterPanel(item, plan, sources, photoLoading) {
    sources = sources || [];
    var isDone = item.status === 'done';
    var isInspected = item.status === 'inspected';
    var panelClass =
      'rf-detail-panel rf-detail-panel--after' +
      (isDone ? ' is-done' : isInspected ? ' is-inspected' : ' is-pending');
    var body = '';

    if (isInspected) {
      body = buildInspectedAfter();
    } else if (!isDone) {
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

      /* 已整改右栏：仅整改反馈 + 完成信息（无整改措施、无整改签名） */
      body += renderBlock(
        '整改反馈',
        '<p class="rf-detail-block__text">' + escapeHtml(displayText(note)) + '</p>'
      );

      body += renderMetaFooter(
        '完成信息',
        renderRow(
          '完成时间',
          item.rectifyAt ? AppData.formatTime(item.rectifyAt) : '—',
          { valueClass: 'rf-detail-value--done' }
        ) +
          renderRow('整改责任人', item.assigneeName) +
          renderRow('联系电话', item.assigneePhone)
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
          function onOk() {
            if (!cell.isConnected) return;
            img.setAttribute('data-preview-src', baked);
            cell.classList.remove('is-loading', 'is-error');
            cell.classList.add('is-ready');
            cell.removeAttribute('data-wm-src');
          }
          function onFail() {
            if (!cell.isConnected) return;
            keepMediaSkeleton(cell, img);
            cell.removeAttribute('data-wm-src');
          }
          img.onload = onOk;
          img.onerror = onFail;
          img.src = baked;
          if (img.complete && img.naturalWidth > 0) onOk();
        })
        .catch(function () {
          if (!cell.isConnected) return;
          if (global.AppLog) global.AppLog.warn('rectify-detail', 'watermark fail', src);
          var img = cell.querySelector('img');
          keepMediaSkeleton(cell, img);
          cell.removeAttribute('data-wm-src');
        });
    });
  }

  /** 加载失败：不露裂图，持续骨架屏 */
  function keepMediaSkeleton(wrap, img) {
    if (!wrap) return;
    wrap.classList.remove('is-ready', 'is-error');
    wrap.classList.add('is-loading');
    if (img) {
      img.removeAttribute('src');
      img.removeAttribute('data-preview-src');
    }
  }

  /** 非水印图（如电子签名）：成功→ready，失败→持续骨架 */
  function bindPlainMediaSkeletons(root) {
    if (!root) return;
    root.querySelectorAll('.m-media.is-loading img').forEach(function (img) {
      var wrap = img.closest('.m-media');
      if (!wrap || wrap.hasAttribute('data-wm-src')) return;
      if (wrap.dataset.rfSkelBound === '1') return;
      wrap.dataset.rfSkelBound = '1';

      function done(ok) {
        if (!wrap.isConnected) return;
        if (ok) {
          wrap.classList.remove('is-loading', 'is-error');
          wrap.classList.add('is-ready');
          return;
        }
        keepMediaSkeleton(wrap, img);
      }

      if (img.complete) {
        done(img.naturalWidth > 0);
        return;
      }
      img.addEventListener('load', function () {
        done(true);
      });
      img.addEventListener('error', function () {
        done(false);
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

    var titleEl = overlay && overlay.querySelector('.v50-modal-title');
    if (titleEl) titleEl.textContent = '巡查详情';

    var plan = global.AppData.formatPlanStatus(item);
    var panelsEl = $('rf-detail-panels');
    if (!panelsEl) {
      toggle(true);
      return;
    }

    var quizPhotos = collectQuizPhotoSrcs(item);
    var beforeSrc = quizPhotos.length ? quizPhotos : photoSources(item, 'before');
    var afterSrc = item.status === 'done' ? photoSources(item, 'after') : [];
    var hasBeforePhotos = beforeSrc.length > 0;
    var hasAfterPhotos = afterSrc.length > 0;

    panelsEl.innerHTML =
      buildBeforePanel(item, plan, hasBeforePhotos) +
      buildAfterPanel(item, plan, afterSrc, hasAfterPhotos);
    toggle(true);

    bindPlainMediaSkeletons(panelsEl);

    var beforePanel = panelsEl.querySelector('.rf-detail-panel--before');
    var afterPanel = panelsEl.querySelector('.rf-detail-panel--after');
    if (hasBeforePhotos) {
      applyWatermarksInPanel(beforePanel, photoMeta(item, 'before'));
    }
    if (hasAfterPhotos) {
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
