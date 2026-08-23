/**
 * 问题详情
 * - 需我处理（待整改且整改人手机号/账号匹配）：字段 + 整改说明 + 附件 + 底栏提交
 * - 仅查看：字段展示（含已整改结果）
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
  if (vp) vp.setAttribute('data-mp-back', backHref);

  if (window.AppLog) AppLog.info('m-issue-detail', 'page ready', { id: id });

  if (!item) {
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;

  var rectifyPhotos = [];
  var slideIndex = 0;
  var autoTimer = null;
  var photoStrip = null;

  var YN = {
    yes: '是',
    no: '否',
    new: '新建',
    match: '配套',
    build: '新建配套',
  };
  var BRIDGE_KIND = { bridge: '桥', culvert: '涵', gate: '闸' };

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

  function issuePhotos(i) {
    var list = [];
    if (i.photos && i.photos.length) {
      i.photos.forEach(function (p) {
        if (p) list.push(p);
      });
    } else {
      if (i.photoSrc) list.push(i.photoSrc);
      if (i.damagePhotoSrc) list.push(i.damagePhotoSrc);
    }
    return list;
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

  function orgNameByStaffId(staffId) {
    if (!staffId) return '';
    var staff = (AppData.getStaff() || []).find(function (s) {
      return s.id === staffId;
    });
    if (!staff || !staff.orgId) return '';
    var org = (AppData.getOrgs() || []).find(function (o) {
      return o.id === staff.orgId;
    });
    return org ? org.name : '';
  }

  function regionLine(i) {
    return [(i.street || ''), (i.village || '')].filter(Boolean).join('') || '';
  }

  function personCard(name, role, phone, sub) {
    var tel = String(phone || '').trim();
    if (!name && !tel) return '';
    return (
      '<article class="m-issue-detail__person' +
      (tel ? ' is-call"' : '"') +
      (tel ? ' data-call="' + esc(tel) + '"' : '') +
      ' role="button" tabindex="0">' +
      '<div class="m-issue-detail__person-top">' +
      '<div class="m-issue-detail__person-who">' +
      '<span class="m-issue-detail__person-name">' +
      esc(name || '—') +
      '</span>' +
      (role
        ? '<span class="m-issue-detail__person-tag">' + esc(role) + '</span>'
        : '') +
      '</div>' +
      (tel
        ? '<div class="m-issue-detail__person-phone">' +
          '<span class="m-issue-detail__person-num">' +
          esc(tel) +
          '</span>' +
          '<span class="m-issue-detail__person-call">立即呼叫</span></div>'
        : '') +
      '</div>' +
      (sub
        ? '<div class="m-issue-detail__person-sub">' + esc(sub) + '</div>'
        : '') +
      '</article>'
    );
  }

  function buildContacts(i) {
    var cards = '';
    cards += personCard(
      i.reporterName,
      '上报人',
      i.reporterPhone,
      orgNameByStaffId(i.reporterId) || regionLine(i)
    );
    cards += personCard(
      i.assigneeName,
      '整改责任人',
      i.assigneePhone,
      orgNameByStaffId(i.assigneeId) || regionLine(i)
    );
    var keeperRole = '相关负责人';
    var keeperName = '';
    var keeperPhone = '';
    if (i.type === 'well' && i.well) {
      keeperRole = '井长及分管负责人';
      keeperName = i.well.keeperName;
      keeperPhone = i.well.keeperPhone;
    } else if (i.type === 'road' && i.road) {
      keeperRole = '道路负责人';
      keeperName = i.road.keeperName;
      keeperPhone = i.road.keeperPhone;
    } else if (i.type === 'bridge' && i.bridge) {
      keeperRole = '设施负责人';
      keeperName = i.bridge.keeperName;
      keeperPhone = i.bridge.keeperPhone;
    } else if (i.type === 'forest' && i.forest) {
      keeperRole = '林网负责人';
      keeperName = i.forest.keeperName;
      keeperPhone = i.forest.keeperPhone;
    } else if (i.type === 'transformer' && i.transformer) {
      keeperRole = '配电负责人';
      keeperName = i.transformer.keeperName;
      keeperPhone = i.transformer.keeperPhone;
    }
    cards += personCard(keeperName, keeperRole, keeperPhone, regionLine(i));
    if (!cards) return '';
    return (
      '<div class="m-issue-detail__rule" role="presentation"></div>' +
      '<section class="m-issue-detail__contacts" aria-label="联系人">' +
      cards +
      '</section>' +
      '<div class="m-issue-detail__rule" role="presentation"></div>'
    );
  }

  function formatPlanDateZh(ymd) {
    var s = String(ymd || '').trim();
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (!m) return s || '暂无';
    function pad(n) {
      return String(n).padStart(2, '0');
    }
    return m[1] + '年' + pad(m[2]) + '月' + pad(m[3]) + '日';
  }

  function buildNarrative(i) {
    var desc = (i.description || '').trim() || '暂无';
    var measure =
      (i.measures || (i.well && i.well.rectifyMeasure) || '').trim() || '暂无';
    var planDate = formatPlanDateZh(i.planDate);
    var icon =
      '<span class="m-issue-detail__block-icon" data-icon="brush" aria-hidden="true"></span>';
    return (
      '<section class="m-issue-detail__story" aria-label="问题与措施">' +
      '<div class="m-issue-detail__block">' +
      '<h2 class="m-issue-detail__block-title">' +
      icon +
      '问题描述</h2>' +
      '<p class="m-issue-detail__block-body">' +
      esc(desc) +
      '</p></div>' +
      '<div class="m-issue-detail__block">' +
      '<h2 class="m-issue-detail__block-title">' +
      icon +
      '整改措施</h2>' +
      '<p class="m-issue-detail__block-body">' +
      esc(measure) +
      '</p></div>' +
      '<p class="m-issue-detail__block-plan"><span class="k">计划完成时间：</span>' +
      esc(planDate) +
      '</p></section>'
    );
  }

  function buildFields(i) {
    var html = '';
    html += row('行政区划', regionLine(i) || '—');
    html += row('项目名称', i.projectName || '—');
    html += row('编号', i.code || '—');

    if (i.type === 'well' && i.well) {
      var w = i.well;
      html += row('建设类型', yn(w.buildKind));
      html += row('出水口', yn(w.waterOut));
      html += row('管道连接', yn(w.pipeOk));
      html += row('线路规范', yn(w.wiringOk));
      html += row('配电箱', yn(w.boxOk));
      html += row('井盖完好', yn(w.coverOk));
      html += row('出水口总数', w.outletTotal != null ? w.outletTotal + ' 个' : '—');
      html += row('出水口损坏', w.outletDamaged != null ? w.outletDamaged + ' 个' : '—');
      html += row('护筒总数', w.casingTotal != null ? w.casingTotal + ' 个' : '—');
      html += row('护筒损坏', w.casingDamaged != null ? w.casingDamaged + ' 个' : '—');
    } else if (i.type === 'road') {
      var r = i.road || {};
      var len = r.length != null ? r.length : i.length;
      var wid = r.width != null ? r.width : i.width;
      var thk = r.thickness != null ? r.thickness : i.thickness;
      var trees = r.treeSurvive != null ? r.treeSurvive : i.treeSurvive;
      html += row('长度', len != null && len !== '' ? len + ' 千米' : '—');
      html += row('宽度', wid != null && wid !== '' ? wid + ' 米' : '—');
      html += row('厚度', thk != null && thk !== '' ? thk + ' 米' : '—');
      html += row(
        '路肩',
        r.hasShoulder ? yn(r.hasShoulder) : i.hasShoulder || '—'
      );
      html += row('灰土层', r.hasAsh ? yn(r.hasAsh) : i.hasAsh || '—');
      html += row('林网存活', trees != null && trees !== '' ? trees + ' 棵' : '—');
    } else if (i.type === 'bridge') {
      var b = i.bridge || {};
      var bl = b.length != null ? b.length : i.length;
      var bw = b.width != null ? b.width : i.width;
      html += row('设施类型', BRIDGE_KIND[b.kind] || i.bridgeKindLabel || '—');
      html += row('长度', bl != null && bl !== '' ? bl + ' 米' : '—');
      html += row('宽度', bw != null && bw !== '' ? bw + ' 米' : '—');
    } else if (i.type === 'forest' && i.forest) {
      var f = i.forest;
      html += row('移交株数', f.handoverCount != null ? f.handoverCount + ' 株' : '—');
      html += row('现有株数', f.existingCount != null ? f.existingCount + ' 株' : '—');
      html += row('存活率', f.surviveRate != null ? f.surviveRate + '%' : '—');
      html += row('林带断带', yn(f.brokenBelt));
      html += row('枯死木', yn(f.deadTrees));
      html += row('病虫害', yn(f.pest));
    } else if (i.type === 'transformer' && i.transformer) {
      var t = i.transformer;
      html += row('容量', t.capacity != null ? t.capacity + ' kVA' : '—');
      html += row('型号', t.model || '—');
      html += row('电压', t.voltage || '—');
      html += row('通电', yn(t.powered));
      html += row('设备完好', yn(t.deviceOk));
      html += row('配电完好', yn(t.cabinetOk));
      html += row('私拉乱接', yn(t.illegalWire));
    }

    return html;
  }

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
            return (
              '<img src="' +
              esc(src) +
              '" alt="" data-rectify-preview="' +
              idx +
              '" />'
            );
          })
          .join('') +
        '</div>';
    }
    return (
      '<section class="m-issue-detail__result" aria-label="整改结果">' +
      '<div class="m-issue-detail__result-hd">' +
      '<span class="m-issue-detail__result-icon" data-icon="check" aria-hidden="true"></span>' +
      '<h2 class="m-issue-detail__result-title">整改结果</h2>' +
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

  function bindCarousel(photos) {
    var track = document.getElementById('mDetailTrack');
    var dots = document.getElementById('mDetailDots');
    var countEl = document.getElementById('mDetailCount');
    if (!track || photos.length < 1) return;

    function go(i) {
      slideIndex = (i + photos.length) % photos.length;
      track.style.transform = 'translateX(-' + slideIndex * 100 + '%)';
      if (dots) {
        Array.prototype.forEach.call(dots.children, function (d, idx) {
          d.classList.toggle('is-on', idx === slideIndex);
        });
      }
      if (countEl) countEl.textContent = slideIndex + 1 + '/' + photos.length;
    }

    function stopAuto() {
      if (autoTimer) {
        clearInterval(autoTimer);
        autoTimer = null;
      }
    }

    function startAuto() {
      stopAuto();
      if (photos.length < 2) return;
      autoTimer = setInterval(function () {
        go(slideIndex + 1);
      }, 3000);
    }

    track.querySelectorAll('.m-issue-detail__slide').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = Number(btn.getAttribute('data-index'));
        if (!isNaN(idx) && photos[idx]) openPreview(photos[idx]);
      });
    });

    if (photos.length < 2) return;

    var startX = 0;
    var deltaX = 0;
    var dragging = false;
    track.addEventListener(
      'touchstart',
      function (e) {
        if (!e.touches || !e.touches[0]) return;
        dragging = true;
        stopAuto();
        startX = e.touches[0].clientX;
        deltaX = 0;
        track.style.transition = 'none';
      },
      { passive: true }
    );
    track.addEventListener(
      'touchmove',
      function (e) {
        if (!dragging || !e.touches || !e.touches[0]) return;
        deltaX = e.touches[0].clientX - startX;
        track.style.transform =
          'translateX(calc(-' + slideIndex * 100 + '% + ' + deltaX + 'px))';
      },
      { passive: true }
    );
    track.addEventListener('touchend', function () {
      if (!dragging) return;
      dragging = false;
      track.style.transition = '';
      if (deltaX < -40) go(slideIndex + 1);
      else if (deltaX > 40) go(slideIndex - 1);
      else go(slideIndex);
      startAuto();
    });

    startAuto();
  }

  var canAct = needsMyAction(item);
  var photos = issuePhotos(item);
  var typeLabel = AppData.TYPE_LABEL[item.type] || item.type || '';
  var plan = AppData.formatPlanStatus(item);
  var locText = item.locationText || item.address || '查看位置';
  var mapHref =
    './issue-map.html?id=' +
    encodeURIComponent(item.id) +
    '&back=' +
    encodeURIComponent(
      './issue-detail.html?id=' +
        encodeURIComponent(item.id) +
        (params.get('back') ? '&back=' + encodeURIComponent(params.get('back')) : '')
    );

  var carouselHtml = '';
  if (!photos.length) {
    carouselHtml =
      '<div class="m-issue-detail__carousel m-issue-detail__carousel--empty">暂无照片</div>';
  } else {
    carouselHtml =
      '<div class="m-issue-detail__carousel">' +
      '<div class="m-issue-detail__track" id="mDetailTrack">' +
      photos
        .map(function (src, i) {
          return (
            '<button type="button" class="m-issue-detail__slide" data-index="' +
            i +
            '"><img src="' +
            esc(src) +
            '" alt="" /></button>'
          );
        })
        .join('') +
      '</div>' +
      (photos.length >= 2
        ? '<div class="m-issue-detail__dots" id="mDetailDots">' +
          photos
            .map(function (_, i) {
              return (
                '<span class="m-issue-detail__dot' +
                (i === 0 ? ' is-on' : '') +
                '"></span>'
              );
            })
            .join('') +
          '</div><span class="m-issue-detail__count" id="mDetailCount">1/' +
          photos.length +
          '</span>'
        : '') +
      '</div>';
  }

  var headHtml =
    '<div class="m-issue-detail__head">' +
    '<button type="button" class="m-issue-detail__loc" id="mDetailLoc">' +
    '<span class="m-issue-detail__loc-icon" data-icon="mapPin" aria-hidden="true"></span>' +
    '<span class="m-issue-detail__loc-text">' +
    esc(locText) +
    '</span></button>' +
    '<div class="m-issue-detail__meta">' +
    '<span class="m-issue-detail__meta-type">' +
    esc(typeLabel) +
    '</span>' +
    '<span class="m-issue-detail__meta-time is-' +
    esc(plan.level || 'pending') +
    '">' +
    esc(plan.text || '—') +
    '</span></div></div>' +
    '<div class="m-issue-detail__rule" role="presentation"></div>';

  root.className = 'm-page m-issue-detail' + (canAct ? ' is-action' : '');
  root.innerHTML =
    '<div class="m-issue-detail__scroll">' +
    carouselHtml +
    headHtml +
    buildNarrative(item) +
    '<div class="m-issue-detail__rule" role="presentation"></div>' +
    '<div class="m-issue-detail__panel"><div class="m-issue-detail__dl">' +
    buildFields(item) +
    '</div></div>' +
    buildResult(item) +
    buildContacts(item) +
    (canAct
      ? '<section class="m-issue-detail__action" aria-label="提交整改">' +
        '<div class="m-issue-detail__action-title">整改反馈</div>' +
        '<div class="m-issue-detail__note" id="mDetailNote">' +
        '<textarea class="m-issue-detail__note-input" id="mDetailNoteInput" placeholder="填写整改说明" rows="4"></textarea>' +
        '<div class="m-report__photos" id="rPhotos" aria-label="整改后照片"></div>' +
        '</div></section>'
      : '') +
    '</div>' +
    (canAct
      ? '<div class="m-issue-detail__foot">' +
        '<button type="button" class="m-issue-detail__submit" id="mDetailSubmit">提交整改</button>' +
        '</div>'
      : '');

  AppIcons.injectAll(root);
  bindCarousel(photos);

  var locBtn = document.getElementById('mDetailLoc');
  if (locBtn) {
    locBtn.addEventListener('click', function () {
      if (window.HSFNav) HSFNav.go(mapHref);
      else location.href = mapHref;
    });
  }

  function dial(phone) {
    var tel = String(phone || '').trim();
    if (!tel) return;
    location.href = 'tel:' + tel;
  }

  root.querySelectorAll('[data-call]').forEach(function (el) {
    el.addEventListener('click', function () {
      dial(el.getAttribute('data-call'));
    });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        dial(el.getAttribute('data-call'));
      }
    });
  });

  root.querySelectorAll('[data-rectify-preview]').forEach(function (img) {
    img.addEventListener('click', function () {
      openPreview(img.getAttribute('src') || img.src);
    });
  });

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
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
    if (photoStrip) {
      photoStrip.destroy();
      photoStrip = null;
    } else if (window.AppWatermark) {
      AppWatermark.closePreview();
    }
    document.removeEventListener('hsf-page-leave', onLeave);
  });
})();
