/**
 * 巡查详情
 * - 基本信息（填写页字段 + 定位）→ 排查清单 → 电子签名（排查上报签，三态均可显）
 * - 待整改且匹配责任人：底栏「整改反馈」（说明+照片，无签名）
 * - 已整改：展示「整改反馈」，无整改措施板块
 */
(function () {
  var MAX_RECTIFY = 6;
  var session = AppStorage.get('session', null);
  if (!session) {
    if (window.HSFNav) HSFNav.go('./login.html');
    else location.href = './login.html';
    return;
  }

  var params = new URLSearchParams(location.search);
  var id = params.get('id');
  var backHref = params.get('back') || './todo.html';
  var root = document.getElementById('mIssueDetail');
  var empty = document.getElementById('mIssueEmpty');
  var item = AppData.getIssue(id);

  if (window.HSFDevice) HSFDevice.setNavBack(backHref);
  var vp = document.getElementById('app-viewport');
  if (vp) {
    vp.setAttribute('data-mp-back', backHref);
    vp.setAttribute('data-mp-title', '巡查详情');
  }

  if (window.AppLog) AppLog.info('m-issue-detail', 'page ready', { id: id });

  if (!item) {
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;

  var rectifyPhotos = [];
  var photoStrip = null;

  var YN = {
    yes: '是',
    no: '否',
    new: '新建',
    match: '配套',
    build: '新建配套',
    '10kv': '10kV',
    '0.4kv': '0.4kV',
  };
  var BRIDGE_KIND = { bridge: '桥', culvert: '涵', gate: '闸' };

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

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function yn(v) {
    if (v == null || v === '') return '—';
    if (YN[v] != null) return YN[v];
    return String(v);
  }

  function normalizeAnswer(v) {
    if (v === 'yes' || v === 'no') return v;
    if (v === '是') return 'yes';
    if (v === '否') return 'no';
    return v ? String(v) : '';
  }

  function needsMyAction(i) {
    if (!i || i.status !== 'pending') return false;
    var phone = String(session.phone || '').trim();
    var name = String(session.name || '').trim();
    var staffId = String(session.staffId || '').trim();
    if (phone && String(i.assigneePhone || '').trim() === phone) return true;
    if (staffId && String(i.assigneeId || '').trim() === staffId) return true;
    if (name && String(i.assigneeName || '').trim() === name) return true;
    return false;
  }

  function row(k, v) {
    return (
      '<div class="m-issue-detail__row"><span class="k">' +
      esc(k) +
      '：</span>' +
      esc(v == null || v === '' ? '—' : v) +
      '</div>'
    );
  }

  function sectionTitle(text) {
    return '<h2 class="m-issue-detail__section-title">' + esc(text) + '</h2>';
  }

  function sectionHead(title, trailing) {
    return (
      '<div class="m-issue-detail__section-hd">' +
      sectionTitle(title) +
      (trailing || '') +
      '</div>'
    );
  }

  function rule() {
    return '<div class="m-issue-detail__rule" role="presentation"></div>';
  }

  function regionLine(i) {
    return [(i.street || ''), (i.village || ''), (i.naturalVillage || '')]
      .filter(Boolean)
      .join('');
  }

  function formatProjectYear(i) {
    if (i.projectYear) return String(i.projectYear).replace(/年$/, '') + '年';
    return '—';
  }

  function typeBlock(i) {
    var meta = QUIZ_META[i.type];
    if (!meta) return null;
    return i[meta.blockKey] || null;
  }

  function collectQuizPhotoSet(i, meta, block) {
    var set = {};
    if (!meta) return set;
    meta.fields.forEach(function (field) {
      var slot = getQuizSlot(i, field, block);
      if (slot && slot.photos && slot.photos.length) {
        slot.photos.forEach(function (p) {
          if (p) set[p] = true;
        });
      }
    });
    return set;
  }

  /** 机井填写页全景照片：优先 well.fillPhotos，否则从总图减去排查题照片 */
  function getWellFillPhotos(i) {
    var w = i.well || {};
    if (w.fillPhotos && w.fillPhotos.length) {
      return w.fillPhotos.filter(Boolean);
    }
    var quizSet = collectQuizPhotoSet(i, QUIZ_META.well, w);
    var fill = [];
    (i.photos || []).forEach(function (p) {
      if (p && !quizSet[p]) fill.push(p);
    });
    return fill;
  }

  function buildFillPhotosBlock(label, photos, dataAttr) {
    if (!photos || !photos.length) return '';
    return (
      '<div class="m-issue-detail__fill-photos">' +
      '<span class="m-issue-detail__fill-photos-label">' +
      esc(label) +
      '</span>' +
      thumbHtml(photos, dataAttr) +
      '</div>'
    );
  }

  function getQuizSlot(i, field, block) {
    if (block && block.quizSteps && block.quizSteps[field]) {
      return block.quizSteps[field];
    }
    var ans = block && block[field] != null ? block[field] : i[field];
    if (field === 'needsRectify' && block && block.needsRectify) {
      ans = block.needsRectify;
    }
    ans = normalizeAnswer(ans);
    if (!ans) return null;
    return { answer: ans, desc: '', photos: [] };
  }

  function buildBasicFields(i) {
    var html = '';
    html += row('行政区划', regionLine(i) || '—');
    html += row('项目年度', formatProjectYear(i));
    html += row('设施编号', i.code || '—');
    html += row(
      '排查日期',
      window.AppData && typeof AppData.formatInspectionDate === 'function'
        ? AppData.formatInspectionDate(i)
        : '—'
    );

    if (i.type === 'well') {
      var w = i.well || {};
      html += row('设施类型', yn(w.buildKind));
      html += row('出水口总数', w.outletTotal != null ? w.outletTotal + ' 个' : '—');
      html += row('出水口损坏', w.outletDamaged != null ? w.outletDamaged + ' 个' : '—');
      html += row('护筒总数', w.casingTotal != null ? w.casingTotal + ' 个' : '—');
      html += row('护筒损坏', w.casingDamaged != null ? w.casingDamaged + ' 个' : '—');
      html += buildFillPhotosBlock('全景照片', getWellFillPhotos(i), 'fill-preview');
    } else if (i.type === 'road') {
      var r = i.road || {};
      var len = r.length != null ? r.length : i.length;
      var wid = r.width != null ? r.width : i.width;
      var thk = r.thickness != null ? r.thickness : i.thickness;
      html += row('长度', len != null && len !== '' ? len + ' 千米' : '—');
      html += row('宽度', wid != null && wid !== '' ? wid + ' 米' : '—');
      html += row('厚度', thk != null && thk !== '' ? thk + ' 米' : '—');
    } else if (i.type === 'bridge') {
      var b = i.bridge || {};
      var bl = b.length != null ? b.length : i.length;
      var bw = b.width != null ? b.width : i.width;
      html += row('设施类型', BRIDGE_KIND[b.kind] || i.bridgeKindLabel || '—');
      html += row('长度', bl != null && bl !== '' ? bl + ' 米' : '—');
      html += row('宽度', bw != null && bw !== '' ? bw + ' 米' : '—');
    } else if (i.type === 'forest') {
      var f = i.forest || {};
      html += row('移交株数', f.handoverCount != null ? f.handoverCount + ' 株' : '—');
      html += row('现有株数', f.existingCount != null ? f.existingCount + ' 株' : '—');
    } else if (i.type === 'transformer') {
      var t = i.transformer || {};
      html += row('容量', t.capacity != null ? t.capacity + ' kVA' : '—');
      html += row('型号', t.model || '—');
      html += row('电压等级', yn(t.voltage) || t.voltage || '—');
    }

    return html;
  }

  function buildLocationRow(i, mapHref) {
    var locText = i.locationText || i.address || '查看位置';
    var hasCoord = i.lng != null && i.lat != null;
    return (
      '<div class="m-issue-detail__loc-bar">' +
      '<button type="button" class="m-issue-detail__loc" id="mDetailLoc">' +
      '<span class="m-issue-detail__loc-icon" data-icon="mapPin" aria-hidden="true"></span>' +
      '<span class="m-issue-detail__loc-text">' +
      esc(locText) +
      '</span></button>' +
      (hasCoord
        ? '<button type="button" class="m-issue-detail__dist-btn" id="mDetailDist" aria-label="查看地图与距离">定位中…</button>'
        : '') +
      '</div>'
    );
  }

  function haversineM(lng1, lat1, lng2, lat2) {
    var R = 6371000;
    var toRad = Math.PI / 180;
    var dLat = (lat2 - lat1) * toRad;
    var dLng = (lng2 - lng1) * toRad;
    var a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function formatDist(m) {
    if (m == null || isNaN(m)) return '—';
    if (m < 1000) return Math.round(m) + 'm';
    return (m / 1000).toFixed(2) + 'km';
  }

  function setupDistanceButton(mapHref) {
    var distBtn = document.getElementById('mDetailDist');
    if (!distBtn || item.lng == null || item.lat == null) return;
    var targetLng = Number(item.lng);
    var targetLat = Number(item.lat);

    function goMap(e) {
      if (e) e.stopPropagation();
      if (window.HSFNav) HSFNav.go(mapHref);
      else location.href = mapHref;
    }

    distBtn.addEventListener('click', goMap);

    if (!navigator.geolocation) {
      distBtn.textContent = '—';
      return;
    }

    navigator.geolocation.getCurrentPosition(
      function (pos) {
        distBtn.textContent = formatDist(
          haversineM(pos.coords.longitude, pos.coords.latitude, targetLng, targetLat)
        );
      },
      function () {
        distBtn.textContent = '—';
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  }

  function mediaCell(src, extraClass, imgAttrs) {
    if (window.AppMpMedia && typeof AppMpMedia.mediaCellHtml === 'function') {
      return AppMpMedia.mediaCellHtml(src, {
        extraClass: extraClass,
        imgAttrs: imgAttrs || '',
      });
    }
    if (!src) {
      return (
        '<div class="m-media is-empty' +
        (extraClass ? ' ' + extraClass : '') +
        '"><span class="m-media__ph" aria-hidden="true">img</span></div>'
      );
    }
    return (
      '<div class="m-media is-loading' +
      (extraClass ? ' ' + extraClass : '') +
      '"><span class="m-media__ph" aria-hidden="true">img</span>' +
      '<div class="m-media__skel" aria-hidden="true"></div>' +
      '<img src="' +
      esc(src) +
      '" alt="" loading="lazy"' +
      (imgAttrs || '') +
      ' /></div>'
    );
  }

  function thumbHtml(photos, dataAttr) {
    if (!photos || !photos.length) return '';
    return (
      '<div class="m-issue-detail__thumbs" aria-label="现场照片">' +
      photos
        .map(function (src, idx) {
          return mediaCell(
            src,
            'm-issue-detail__thumb',
            ' data-' + dataAttr + '="' + idx + '"'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function formatWaterProofMeta(slot, issue) {
    if (!slot || slot.answer !== 'yes') return '';
    var parts = [];
    if (issue.lat != null && issue.lng != null && AppData.toDms) {
      parts.push(AppData.toDms(issue.lat, true) + ', ' + AppData.toDms(issue.lng, false));
    }
    var proof = slot.photoProof || {};
    if (proof.firstCapturedAt && proof.lastCapturedAt) {
      var ms =
        new Date(proof.lastCapturedAt).getTime() -
        new Date(proof.firstCapturedAt).getTime();
      if (ms > 0) {
        var sec = Math.round(ms / 1000);
        var m = Math.floor(sec / 60);
        var s = sec % 60;
        parts.push('拍摄间隔 ' + m + '分' + String(s).padStart(2, '0') + '秒');
      }
    }
    if (!parts.length) return '';
    return (
      '<p class="m-issue-detail__quiz-proof">' + esc(parts.join(' · ')) + '</p>'
    );
  }

  function canDeleteIssue(i) {
    return AppData.isReporterMatch(i, session);
  }

  function buildDeleteAction() {
    if (!canDeleteIssue(item)) return '';
    return (
      '<div class="m-issue-detail__delete-wrap">' +
      '<button type="button" class="m-issue-detail__delete" id="mDetailDelete">删除上报</button>' +
      '</div>'
    );
  }

  function buildChecklist(i) {
    var meta = QUIZ_META[i.type];
    if (!meta) return '';
    var block = typeBlock(i);
    var items = '';

    meta.fields.forEach(function (field) {
      var slot = getQuizSlot(i, field, block);
      if (!slot || !slot.answer) return;
      var hint = (meta.hints && meta.hints[field]) || '';
      var label = (meta.names && meta.names[field]) || field;
      var ansText = yn(slot.answer);
      var ansCls =
        slot.answer === 'yes'
          ? 'm-issue-detail__quiz-ans--yes'
          : 'm-issue-detail__quiz-ans--no';
      var desc = (slot.desc || '').trim();
      var photos = [];
      if (slot.photos && slot.photos.length) {
        slot.photos.forEach(function (p) {
          if (p) photos.push(p);
        });
      }

      items +=
        '<article class="m-issue-detail__quiz-item">' +
        '<div class="m-issue-detail__quiz-hd">' +
        '<span class="m-issue-detail__quiz-q">' +
        esc(label + hint) +
        '</span>' +
        '<span class="m-issue-detail__quiz-ans ' +
        ansCls +
        '">' +
        esc(ansText) +
        '</span></div>' +
        (desc ? '<p class="m-issue-detail__quiz-desc">' + esc(desc) + '</p>' : '') +
        (field === 'waterOut' ? formatWaterProofMeta(slot, i) : '') +
        thumbHtml(photos, 'quiz-preview') +
        '</article>';
    });

    if (!items) return '';
    return (
      '<section class="m-issue-detail__section" aria-label="排查清单">' +
      sectionHead('排查清单') +
      '<div class="m-issue-detail__quiz-list">' +
      items +
      '</div></section>'
    );
  }

  /** 排查上报签名；待整改/已整改/已排查均可展示（整改环节不另签） */
  function buildSignature(i) {
    var src = i.reporterSignature || '';
    if (!src) return '';
    return (
      '<section class="m-issue-detail__section" aria-label="电子签名">' +
      sectionHead('电子签名') +
      '<div class="m-issue-detail__sign-board">' +
      mediaCell(src, 'm-issue-detail__sign-media', ' class="m-issue-detail__sign-img"') +
      '</div></section>'
    );
  }

  /** 已整改：仅展示整改反馈（说明+照片），无整改措施、无整改签名 */
  function buildResult(i) {
    if (!i || i.status !== 'done') return '';
    var note = (i.rectifyNote || '').trim() || '—';
    var time = i.rectifyAt ? AppData.formatTime(i.rectifyAt) : '—';
    var thumbs = '';
    if (i.rectifyPhotos && i.rectifyPhotos.length) {
      thumbs =
        '<div class="m-issue-detail__result-photos" aria-label="整改后照片">' +
        i.rectifyPhotos
          .map(function (src, idx) {
            return mediaCell(
              src,
              'm-issue-detail__result-thumb',
              ' data-rectify-preview="' + idx + '"'
            );
          })
          .join('') +
        '</div>';
    }
    return (
      rule() +
      '<section class="m-issue-detail__result" aria-label="整改反馈">' +
      '<div class="m-issue-detail__result-hd">' +
      '<span class="m-issue-detail__result-icon" data-icon="check" aria-hidden="true"></span>' +
      '<h2 class="m-issue-detail__result-title">整改反馈</h2>' +
      '<span class="m-issue-detail__result-badge">已完成</span></div>' +
      '<p class="m-issue-detail__result-note">' +
      esc(note) +
      '</p>' +
      thumbs +
      '<p class="m-issue-detail__result-time" aria-label="完成时间">' +
      '<span class="m-issue-detail__result-time-icon" data-icon="clock" aria-hidden="true"></span>' +
      esc(time) +
      '</p></section>'
    );
  }

  function openPreview(src) {
    if (window.AppWatermark && typeof AppWatermark.openPreview === 'function') {
      AppWatermark.openPreview(src, AppWatermark.metaFromIssue(item));
    }
  }

  var canAct = needsMyAction(item);
  var plan = AppData.formatPlanStatus(item);
  var mapHref =
    './issue-map.html?id=' +
    encodeURIComponent(item.id) +
    '&back=' +
    encodeURIComponent(
      './issue-detail.html?id=' +
        encodeURIComponent(item.id) +
        (params.get('back') ? '&back=' + encodeURIComponent(params.get('back')) : '')
    );

  var basicSection =
    '<section class="m-issue-detail__section" aria-label="基本信息">' +
    sectionHead(
      '基本信息',
      '<div class="m-issue-detail__meta-inline">' +
        '<span class="m-issue-detail__meta-time is-' +
        esc(plan.level || 'pending') +
        '">' +
        esc(plan.text || '—') +
        '</span></div>'
    ) +
    '<div class="m-issue-detail__panel"><div class="m-issue-detail__dl">' +
    buildBasicFields(item) +
    '</div>' +
    buildLocationRow(item, mapHref) +
    '</div></section>';

  var checklistHtml = buildChecklist(item);

  root.className = 'm-page m-issue-detail' + (canAct ? ' is-action' : '');
  root.innerHTML =
    '<div class="m-issue-detail__scroll">' +
    basicSection +
    (checklistHtml ? rule() + checklistHtml : '') +
    (buildSignature(item) ? rule() + buildSignature(item) : '') +
    buildResult(item) +
    (canAct
      ? rule() +
        '<section class="m-issue-detail__action" aria-label="提交整改">' +
        '<div class="m-issue-detail__action-title">整改反馈</div>' +
        '<div class="m-issue-detail__note" id="mDetailNote">' +
        '<textarea class="m-issue-detail__note-input" id="mDetailNoteInput" placeholder="填写整改说明" rows="4"></textarea>' +
        '<div class="m-report__photos" id="rPhotos" aria-label="整改后照片"></div>' +
        '</div></section>'
      : '') +
    (canDeleteIssue(item) ? rule() + buildDeleteAction() : '') +
    '</div>' +
    (canAct
      ? '<div class="m-issue-detail__foot">' +
        '<button type="button" class="m-issue-detail__submit" id="mDetailSubmit">提交整改</button>' +
        '</div>'
      : '');

  AppIcons.injectAll(root);

  if (window.AppMpMedia && typeof AppMpMedia.bindMedia === 'function') {
    AppMpMedia.bindMedia(root);
  }

  var locBtn = document.getElementById('mDetailLoc');
  if (locBtn) {
    locBtn.addEventListener('click', function () {
      if (window.HSFNav) HSFNav.go(mapHref);
      else location.href = mapHref;
    });
  }
  setupDistanceButton(mapHref);

  root.querySelectorAll('[data-quiz-preview]').forEach(function (img) {
    img.addEventListener('click', function () {
      openPreview(img.getAttribute('src') || img.src);
    });
  });

  root.querySelectorAll('[data-fill-preview]').forEach(function (img) {
    img.addEventListener('click', function () {
      openPreview(img.getAttribute('src') || img.src);
    });
  });

  root.querySelectorAll('[data-rectify-preview]').forEach(function (img) {
    img.addEventListener('click', function () {
      openPreview(img.getAttribute('src') || img.src);
    });
  });

  var deleteBtn = document.getElementById('mDetailDelete');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', function () {
      AppUI.modal({
        title: '删除上报',
        content: '确定删除「' + (item.code || item.id) + '」吗？删除后不可恢复。',
        okText: '删除',
        cancelText: '取消',
      }).then(function (ok) {
        if (!ok) return;
        AppData.removeIssue(item.id);
        AppData.pushLog('删除上报', item.code || item.id);
        AppUI.toast('已删除');
        if (window.AppLog) AppLog.info('m-issue-detail', 'deleted', { id: item.id });
        setTimeout(function () {
          if (window.HSFNav) HSFNav.go(backHref);
          else location.href = backHref;
        }, 350);
      });
    });
  }

  if (canAct) {
    var photosEl = document.getElementById('rPhotos');
    if (photosEl && window.AppMpPhotos) {
      photoStrip = AppMpPhotos.attach({
        el: photosEl,
        photos: rectifyPhotos,
        max: MAX_RECTIFY,
        logScope: 'm-issue-detail',
        previewMeta: function () {
          return window.AppWatermark ? AppWatermark.metaFromIssue(item) : {};
        },
      });
    }

    var submitBtn = document.getElementById('mDetailSubmit');
    if (submitBtn) {
      submitBtn.addEventListener('click', function () {
        var noteEl = document.getElementById('mDetailNoteInput');
        var note = (noteEl && noteEl.value ? noteEl.value : '').trim();
        if (!note) {
          AppUI.toast('请填写整改说明', 'error');
          return;
        }
        if (!rectifyPhotos.length) {
          AppUI.toast('请至少上传 1 张整改后照片', 'error');
          return;
        }
        AppData.completeRectify(item.id, rectifyPhotos.slice(), note);
        AppData.pushLog('提交整改', item.code || item.id);
        AppUI.toast('整改已提交');
        if (window.AppLog) AppLog.info('m-issue-detail', 'rectify ok', { id: item.id });
        setTimeout(function () {
          if (window.HSFNav) HSFNav.go(backHref);
          else location.href = backHref;
        }, 450);
      });
    }
  }

  document.addEventListener('hsf-page-leave', function onLeave() {
    if (photoStrip) {
      photoStrip.destroy();
      photoStrip = null;
    } else if (window.AppWatermark) {
      AppWatermark.closePreview();
    }
    document.removeEventListener('hsf-page-leave', onLeave);
  });
})();
