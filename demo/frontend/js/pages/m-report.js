/**
 * 问题上报 · 现场优先
 * 无框描述 + 多图横滑 + 摘要行；类型分段 + 区划滚筒；整改责任人/联系电话手输
 */
(function () {
  var session = AppStorage.get('session', null);
  if (!session) {
    if (window.HSFNav) HSFNav.go('./login.html');
    else location.href = './login.html';
    return;
  }
  AppIcons.injectAll(document);
  var projectInput = document.getElementById('rProjectName');
  if (projectInput && !projectInput.value.trim()) {
    projectInput.value = '高标农田建设项目';
  }
  if (window.AppLog) AppLog.info('m-report', 'page ready', { user: session.username });

  var ITEM_H = 44;
  var TYPE_OPTS = [
    { value: 'well', label: '机井' },
    { value: 'road', label: '道路' },
    { value: 'bridge', label: '桥涵闸' },
    { value: 'forest', label: '林网' },
    { value: 'transformer', label: '变压器' },
  ];

  var form = {
    type: 'well',
    street: '',
    village: '',
    planDate: '',
  };

  var loc = {
    lat: 36.4567,
    lng: 115.9876,
    address: '山东省聊城市经济技术开发区蒋官屯街道李官屯新村',
  };
  var photos = [];
  var MAX_PHOTOS = 6;
  var regionTree = [];

  var pickerRoot = null;
  var pickerKey = '';
  var cascade = null;
  var scrollTimer = null;
  var photoStrip = null;

  var photosEl = document.getElementById('rPhotos');
  var typeCtrlEl = document.getElementById('v86-controller');
  var wellBlock = document.getElementById('rWellBlock');
  var roadBlock = document.getElementById('rRoadBlock');
  var bridgeBlock = document.getElementById('rBridgeBlock');
  var forestBlock = document.getElementById('rForestBlock');
  var transformerBlock = document.getElementById('rTransformerBlock');
  var regionLabel = document.getElementById('rRegionLabel');
  var locText = document.getElementById('rLocText');

  var WELL_YN_FIELDS = ['buildKind', 'waterOut', 'pipeOk', 'wiringOk', 'boxOk', 'coverOk'];
  var WELL_YN_NAMES = {
    buildKind: '新建/配套',
    waterOut: '机井是否出水',
    pipeOk: '管道是否按要求连接',
    wiringOk: '走线是否规范',
    boxOk: '配电箱是否完好',
    coverOk: '井台、井盖是否完整',
  };

  function mountHost() {
    return document.querySelector('.app-device__screen') || document.body;
  }

  function labelOf(opts, value) {
    for (var i = 0; i < opts.length; i++) {
      if (opts[i].value === value) return opts[i].label;
    }
    return opts[0] ? opts[0].label : '—';
  }

  function indexOf(opts, value) {
    for (var i = 0; i < opts.length; i++) {
      if (opts[i].value === value) return i;
    }
    return 0;
  }

  function buildRegionTree() {
    var orgs = AppStorage.get('orgs', []) || [];
    var streets = [];
    orgs.forEach(function (street) {
      if (street.type !== 'street') return;
      var children = [];
      orgs.forEach(function (child) {
        if (
          child.parentId === street.id &&
          (child.type === 'village' || child.type === 'community')
        ) {
          children.push({ value: child.name, label: child.name });
        }
      });
      if (!children.length) return;
      streets.push({
        value: street.name,
        label: street.name,
        children: children,
      });
    });
    return streets;
  }

  function syncMeta() {
    var hasRegion = !!(form.street && form.village);
    regionLabel.textContent = hasRegion ? form.street + form.village : '请选择';
    regionLabel.classList.toggle('is-placeholder', !hasRegion);
    var planLabel = document.getElementById('rWellPlanDateLabel');
    if (planLabel) {
      planLabel.textContent = form.planDate ? form.planDate : '请选择';
      planLabel.classList.toggle('is-placeholder', !form.planDate);
    }
  }

  function formatDate(d) {
    return (
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0')
    );
  }

  function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  function autoGrowMeasure() {
    var el = document.getElementById('rWellMeasure');
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.max(56, el.scrollHeight) + 'px';
  }

  function syncTypeBlocks() {
    if (wellBlock) wellBlock.hidden = form.type !== 'well';
    if (roadBlock) roadBlock.hidden = form.type !== 'road';
    if (bridgeBlock) bridgeBlock.hidden = form.type !== 'bridge';
    if (forestBlock) forestBlock.hidden = form.type !== 'forest';
    if (transformerBlock) transformerBlock.hidden = form.type !== 'transformer';
  }

  function readRadioIn(block, field) {
    if (!block) return '';
    var group = block.querySelector('.m-yn-group[data-field="' + field + '"]');
    if (!group) return '';
    var checked = group.querySelector('input[type="radio"]:checked');
    return checked ? checked.value : '';
  }

  function readRadio(field) {
    return readRadioIn(wellBlock, field);
  }

  function parseNum(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    var raw = (el.value || '').trim();
    if (raw === '') return null;
    var n = parseFloat(raw);
    return isNaN(n) ? null : n;
  }

  function collectWellFields() {
    var total = parseInt(document.getElementById('rWellOutletTotal').value, 10);
    var casing = parseInt(document.getElementById('rWellCasingTotal').value, 10);
    var outletDamaged = parseInt(document.getElementById('rWellOutletDamaged').value, 10);
    var casingDamaged = parseInt(document.getElementById('rWellCasingDamaged').value, 10);
    return {
      buildKind: readRadio('buildKind'),
      waterOut: readRadio('waterOut'),
      pipeOk: readRadio('pipeOk'),
      wiringOk: readRadio('wiringOk'),
      boxOk: readRadio('boxOk'),
      coverOk: readRadio('coverOk'),
      outletTotal: isNaN(total) ? null : total,
      outletDamaged: isNaN(outletDamaged) ? null : outletDamaged,
      casingTotal: isNaN(casing) ? null : casing,
      casingDamaged: isNaN(casingDamaged) ? null : casingDamaged,
      keeperName: (document.getElementById('rWellKeeper').value || '').trim(),
      keeperPhone: (document.getElementById('rWellKeeperPhone').value || '').trim(),
      rectifyMeasure: (document.getElementById('rWellMeasure').value || '').trim(),
      wellPlanDate: form.planDate || '',
    };
  }

  function validateWellFields() {
    var i;
    for (i = 0; i < WELL_YN_FIELDS.length; i++) {
      var key = WELL_YN_FIELDS[i];
      if (!readRadio(key)) {
        AppUI.toast('请选择' + (WELL_YN_NAMES[key] || '核查项'), 'warn');
        return null;
      }
    }
    var data = collectWellFields();
    if (data.outletTotal == null) {
      AppUI.toast('请填写出水口总数', 'warn');
      return null;
    }
    if (data.outletDamaged == null) {
      AppUI.toast('请填写出水口损坏数量', 'warn');
      return null;
    }
    if (data.outletDamaged > data.outletTotal) {
      AppUI.toast('出水口损坏数量不能大于总数', 'warn');
      return null;
    }
    if (data.casingTotal == null) {
      AppUI.toast('请填写护筒总数', 'warn');
      return null;
    }
    if (data.casingDamaged == null) {
      AppUI.toast('请填写护筒损坏数量', 'warn');
      return null;
    }
    if (data.casingDamaged > data.casingTotal) {
      AppUI.toast('护筒损坏数量不能大于总数', 'warn');
      return null;
    }
    return data;
  }

  function collectRoadFields() {
    return {
      length: parseNum('rRoadLength'),
      width: parseNum('rRoadWidth'),
      thickness: parseNum('rRoadThickness'),
      hasShoulder: readRadioIn(roadBlock, 'hasShoulder'),
      hasAsh: readRadioIn(roadBlock, 'hasAsh'),
      treeSurvive: parseNum('rRoadTreeSurvive'),
      keeperName: (document.getElementById('rRoadKeeper').value || '').trim(),
      keeperPhone: (document.getElementById('rRoadKeeperPhone').value || '').trim(),
    };
  }

  function validateRoadFields() {
    var data = collectRoadFields();
    if (data.length == null) {
      AppUI.toast('请填写道路长度', 'warn');
      return null;
    }
    if (data.width == null) {
      AppUI.toast('请填写道路宽度', 'warn');
      return null;
    }
    if (data.thickness == null) {
      AppUI.toast('请填写道路厚度', 'warn');
      return null;
    }
    if (!data.hasShoulder) {
      AppUI.toast('请选择是否有路肩', 'warn');
      return null;
    }
    if (!data.hasAsh) {
      AppUI.toast('请选择是否有灰土层', 'warn');
      return null;
    }
    if (data.treeSurvive == null) {
      AppUI.toast('请填写林网树木存活数量', 'warn');
      return null;
    }
    return data;
  }

  var BRIDGE_KIND_LABEL = { bridge: '桥', culvert: '涵', gate: '闸' };

  function collectBridgeFields() {
    return {
      kind: readRadioIn(bridgeBlock, 'kind'),
      length: parseNum('rBridgeLength'),
      width: parseNum('rBridgeWidth'),
      keeperName: (document.getElementById('rBridgeKeeper').value || '').trim(),
      keeperPhone: (document.getElementById('rBridgeKeeperPhone').value || '').trim(),
    };
  }

  function validateBridgeFields() {
    var data = collectBridgeFields();
    if (!data.kind) {
      AppUI.toast('请选择设施类型（桥/涵/闸）', 'warn');
      return null;
    }
    if (data.length == null) {
      AppUI.toast('请填写长度', 'warn');
      return null;
    }
    if (data.width == null) {
      AppUI.toast('请填写宽度', 'warn');
      return null;
    }
    return data;
  }

  function collectForestFields() {
    return {
      handoverCount: parseNum('rForestHandover'),
      existingCount: parseNum('rForestExisting'),
      surviveRate: parseNum('rForestSurviveRate'),
      brokenBelt: readRadioIn(forestBlock, 'brokenBelt'),
      deadTrees: readRadioIn(forestBlock, 'deadTrees'),
      pest: readRadioIn(forestBlock, 'pest'),
      keeperName: (document.getElementById('rForestKeeper').value || '').trim(),
      keeperPhone: (document.getElementById('rForestKeeperPhone').value || '').trim(),
    };
  }

  function validateForestFields() {
    var data = collectForestFields();
    if (data.handoverCount == null) {
      AppUI.toast('请填写移交株数', 'warn');
      return null;
    }
    if (data.existingCount == null) {
      AppUI.toast('请填写现有株数', 'warn');
      return null;
    }
    if (data.surviveRate == null) {
      AppUI.toast('请填写存活率', 'warn');
      return null;
    }
    if (data.surviveRate < 0 || data.surviveRate > 100) {
      AppUI.toast('存活率应在 0–100 之间', 'warn');
      return null;
    }
    if (!data.brokenBelt) {
      AppUI.toast('请选择林带是否断带', 'warn');
      return null;
    }
    if (!data.deadTrees) {
      AppUI.toast('请选择是否有枯死木', 'warn');
      return null;
    }
    if (!data.pest) {
      AppUI.toast('请选择是否发现病虫害', 'warn');
      return null;
    }
    return data;
  }

  function collectTransformerFields() {
    return {
      capacity: parseNum('rTfCapacity'),
      model: (document.getElementById('rTfModel').value || '').trim(),
      voltage: readRadioIn(transformerBlock, 'voltage'),
      powered: readRadioIn(transformerBlock, 'powered'),
      deviceOk: readRadioIn(transformerBlock, 'deviceOk'),
      cabinetOk: readRadioIn(transformerBlock, 'cabinetOk'),
      illegalWire: readRadioIn(transformerBlock, 'illegalWire'),
      keeperName: (document.getElementById('rTfKeeper').value || '').trim(),
      keeperPhone: (document.getElementById('rTfKeeperPhone').value || '').trim(),
    };
  }

  function validateTransformerFields() {
    var data = collectTransformerFields();
    if (data.capacity == null) {
      AppUI.toast('请填写变压器容量', 'warn');
      return null;
    }
    if (!data.voltage) {
      AppUI.toast('请选择电压等级', 'warn');
      return null;
    }
    if (!data.powered) {
      AppUI.toast('请选择是否通电', 'warn');
      return null;
    }
    if (!data.deviceOk) {
      AppUI.toast('请选择设备是否完好', 'warn');
      return null;
    }
    if (!data.cabinetOk) {
      AppUI.toast('请选择配电设施是否完好', 'warn');
      return null;
    }
    if (!data.illegalWire) {
      AppUI.toast('请选择是否私拉乱接', 'warn');
      return null;
    }
    return data;
  }

  function renderTypeSeg() {
    typeCtrlEl.innerHTML = TYPE_OPTS.map(function (o) {
      var active = o.value === form.type ? ' active' : '';
      return (
        '<div class="seg-item' +
        active +
        '" role="option" aria-selected="' +
        (o.value === form.type ? 'true' : 'false') +
        '" data-type="' +
        o.value +
        '">' +
        o.label +
        '</div>'
      );
    }).join('');
  }

  function showLoc() {
    locText.textContent = loc.address || '—';
  }

  function relocate() {
    locText.textContent = '定位中…';
    if (!window.AppWatermark || typeof AppWatermark.locate !== 'function') {
      if (window.AppLog) AppLog.error('m-report', 'AppWatermark 未加载');
      showLoc();
      return;
    }
    AppWatermark.locate(function (pos, meta) {
      loc = pos;
      showLoc();
      meta = meta || {};
      if (!meta.fromGps) {
        AppUI.toast('无法获取当前位置，已使用默认地址', 'warn');
        if (window.AppLog) AppLog.warn('m-report', 'locate fallback');
      } else if (window.AppLog) {
        AppLog.info('m-report', 'locate ok', {
          geocodeOk: !!meta.geocodeOk,
          address: pos.address,
        });
      }
    });
  }

  function previewMeta() {
    return {
      address: loc.address || '',
      lat: loc.lat,
      lng: loc.lng,
      time: window.AppWatermark ? AppWatermark.formatDateZh() : '',
    };
  }

  function closePicker(commit) {
    if (!pickerRoot) return;
    if (commit) {
      if (pickerKey === 'region' && cascade) {
        var streetOpt = regionTree[cascade.streetIndex] || regionTree[0];
        var villages = streetOpt.children || [];
        var villageOpt = villages[cascade.villageIndex] || villages[0];
        form.street = streetOpt.value;
        form.village = villageOpt ? villageOpt.value : '';
        syncMeta();
      } else if (pickerKey === 'planDate' && cascade) {
        var yOpt = cascade.years[cascade.yearIndex] || cascade.years[0];
        var mOpt = cascade.months[cascade.monthIndex] || cascade.months[0];
        var dOpt = cascade.days[cascade.dayIndex] || cascade.days[0];
        if (yOpt && mOpt && dOpt) {
          form.planDate =
            yOpt.value +
            '-' +
            String(mOpt.value).padStart(2, '0') +
            '-' +
            String(dOpt.value).padStart(2, '0');
          syncMeta();
        }
      }
    }
    pickerRoot.classList.remove('is-open');
    var root = pickerRoot;
    pickerRoot = null;
    cascade = null;
    setTimeout(function () {
      if (root.parentNode) root.parentNode.removeChild(root);
    }, 220);
  }

  function snapCol(el, maxIndex) {
    if (!el) return 0;
    var idx = Math.round(el.scrollTop / ITEM_H);
    if (idx < 0) idx = 0;
    if (idx > maxIndex) idx = maxIndex;
    el.scrollTop = idx * ITEM_H;
    markActiveItem(el, idx);
    return idx;
  }

  function markActiveItem(el, idx) {
    if (!el) return;
    var items = el.querySelectorAll('.m-picker__item');
    items.forEach(function (node, i) {
      node.classList.toggle('is-active', i === idx);
    });
  }

  function colHtml(opts) {
    return (
      '<div class="m-picker__pad"></div>' +
      opts
        .map(function (o) {
          return '<div class="m-picker__item">' + o.label + '</div>';
        })
        .join('') +
      '<div class="m-picker__pad"></div>'
    );
  }

  function bindColScroll(el, onSnap) {
    el.addEventListener('scroll', function () {
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(onSnap, 80);
    });
  }

  function openRegionCascade() {
    regionTree = buildRegionTree();
    if (!regionTree.length) {
      AppUI.toast('暂无区划数据', 'warn');
      return;
    }
    var streetIndex = indexOf(regionTree, form.street);
    var villages = regionTree[streetIndex].children || [];
    var villageIndex = indexOf(villages, form.village);
    cascade = { streetIndex: streetIndex, villageIndex: villageIndex };

    var host = mountHost();
    var mask = document.createElement('div');
    mask.className = 'm-picker';
    mask.setAttribute('role', 'dialog');
    mask.setAttribute('aria-modal', 'true');
    mask.setAttribute('aria-label', '行政区划');

    mask.innerHTML =
      '<div class="m-picker__mask" data-act="cancel"></div>' +
      '<div class="m-picker__panel">' +
      '<div class="m-picker__hd">' +
      '<button type="button" class="m-picker__btn" data-act="cancel">取消</button>' +
      '<span class="m-picker__title">行政区划</span>' +
      '<button type="button" class="m-picker__btn m-picker__btn--ok" data-act="ok">确定</button>' +
      '</div>' +
      '<div class="m-picker__bd m-picker__bd--cascade">' +
      '<div class="m-picker__indicator" aria-hidden="true"></div>' +
      '<div class="m-picker__cascade">' +
      '<div class="m-picker__col" id="mReportPickerStreet" aria-label="街道">' +
      colHtml(regionTree) +
      '</div>' +
      '<div class="m-picker__col" id="mReportPickerVillage" aria-label="村社区">' +
      colHtml(villages) +
      '</div>' +
      '</div>' +
      '</div>' +
      '</div>';

    host.appendChild(mask);
    pickerRoot = mask;

    var streetCol = mask.querySelector('#mReportPickerStreet');
    var villageCol = mask.querySelector('#mReportPickerVillage');
    streetCol.scrollTop = streetIndex * ITEM_H;
    villageCol.scrollTop = villageIndex * ITEM_H;
    markActiveItem(streetCol, streetIndex);
    markActiveItem(villageCol, villageIndex);

    function refreshVillages() {
      var streetOpt = regionTree[cascade.streetIndex] || regionTree[0];
      var next = streetOpt.children || [];
      cascade.villageIndex = 0;
      villageCol.innerHTML = colHtml(next);
      villageCol.scrollTop = 0;
      markActiveItem(villageCol, 0);
    }

    bindColScroll(streetCol, function () {
      var next = snapCol(streetCol, regionTree.length - 1);
      if (next !== cascade.streetIndex) {
        cascade.streetIndex = next;
        refreshVillages();
      } else {
        cascade.streetIndex = next;
      }
      markActiveItem(streetCol, cascade.streetIndex);
    });

    bindColScroll(villageCol, function () {
      var streetOpt = regionTree[cascade.streetIndex] || regionTree[0];
      var list = streetOpt.children || [];
      cascade.villageIndex = snapCol(villageCol, list.length - 1);
    });

    requestAnimationFrame(function () {
      mask.classList.add('is-open');
    });

    mask.addEventListener('click', function (e) {
      var act = e.target.getAttribute('data-act');
      if (act === 'cancel') closePicker(false);
      if (act === 'ok') closePicker(true);
    });
  }

  function openDateCascade() {
    var now = new Date();
    var base = form.planDate ? new Date(form.planDate.replace(/-/g, '/') + ' 00:00:00') : null;
    if (!base || isNaN(base.getTime())) {
      base = new Date(now.getTime() + 7 * 86400000);
    }
    var startY = now.getFullYear();
    var endY = startY + 5;
    var years = [];
    var yi;
    for (yi = startY; yi <= endY; yi++) {
      years.push({ value: yi, label: yi + '年' });
    }
    var months = [];
    var mi;
    for (mi = 1; mi <= 12; mi++) {
      months.push({ value: mi, label: mi + '月' });
    }
    var yearIndex = indexOf(years, base.getFullYear());
    var monthIndex = indexOf(months, base.getMonth() + 1);
    var maxDay = daysInMonth(years[yearIndex].value, months[monthIndex].value);
    var dayVal = Math.min(base.getDate(), maxDay);
    var days = [];
    var di;
    for (di = 1; di <= maxDay; di++) {
      days.push({ value: di, label: di + '日' });
    }
    var dayIndex = indexOf(days, dayVal);
    cascade = {
      years: years,
      months: months,
      days: days,
      yearIndex: yearIndex,
      monthIndex: monthIndex,
      dayIndex: dayIndex,
    };

    var host = mountHost();
    var mask = document.createElement('div');
    mask.className = 'm-picker';
    mask.setAttribute('role', 'dialog');
    mask.setAttribute('aria-modal', 'true');
    mask.setAttribute('aria-label', '计划整改完成时间');

    mask.innerHTML =
      '<div class="m-picker__mask" data-act="cancel"></div>' +
      '<div class="m-picker__panel">' +
      '<div class="m-picker__hd">' +
      '<button type="button" class="m-picker__btn" data-act="cancel">取消</button>' +
      '<span class="m-picker__title">计划整改完成时间</span>' +
      '<button type="button" class="m-picker__btn m-picker__btn--ok" data-act="ok">确定</button>' +
      '</div>' +
      '<div class="m-picker__bd m-picker__bd--cascade">' +
      '<div class="m-picker__indicator" aria-hidden="true"></div>' +
      '<div class="m-picker__cascade">' +
      '<div class="m-picker__col" id="mReportPickerYear" aria-label="年">' +
      colHtml(years) +
      '</div>' +
      '<div class="m-picker__col" id="mReportPickerMonth" aria-label="月">' +
      colHtml(months) +
      '</div>' +
      '<div class="m-picker__col" id="mReportPickerDay" aria-label="日">' +
      colHtml(days) +
      '</div>' +
      '</div>' +
      '</div>' +
      '</div>';

    host.appendChild(mask);
    pickerRoot = mask;

    var yearCol = mask.querySelector('#mReportPickerYear');
    var monthCol = mask.querySelector('#mReportPickerMonth');
    var dayCol = mask.querySelector('#mReportPickerDay');
    yearCol.scrollTop = yearIndex * ITEM_H;
    monthCol.scrollTop = monthIndex * ITEM_H;
    dayCol.scrollTop = dayIndex * ITEM_H;
    markActiveItem(yearCol, yearIndex);
    markActiveItem(monthCol, monthIndex);
    markActiveItem(dayCol, dayIndex);

    function refreshDays() {
      var y = cascade.years[cascade.yearIndex] || cascade.years[0];
      var m = cascade.months[cascade.monthIndex] || cascade.months[0];
      var max = daysInMonth(y.value, m.value);
      var nextDays = [];
      var i;
      for (i = 1; i <= max; i++) {
        nextDays.push({ value: i, label: i + '日' });
      }
      if (cascade.dayIndex > max - 1) cascade.dayIndex = max - 1;
      cascade.days = nextDays;
      dayCol.innerHTML = colHtml(nextDays);
      dayCol.scrollTop = cascade.dayIndex * ITEM_H;
      markActiveItem(dayCol, cascade.dayIndex);
    }

    bindColScroll(yearCol, function () {
      cascade.yearIndex = snapCol(yearCol, cascade.years.length - 1);
      markActiveItem(yearCol, cascade.yearIndex);
      refreshDays();
    });
    bindColScroll(monthCol, function () {
      cascade.monthIndex = snapCol(monthCol, cascade.months.length - 1);
      markActiveItem(monthCol, cascade.monthIndex);
      refreshDays();
    });
    bindColScroll(dayCol, function () {
      cascade.dayIndex = snapCol(dayCol, cascade.days.length - 1);
      markActiveItem(dayCol, cascade.dayIndex);
    });

    requestAnimationFrame(function () {
      mask.classList.add('is-open');
    });

    mask.addEventListener('click', function (e) {
      var act = e.target.getAttribute('data-act');
      if (act === 'cancel') closePicker(false);
      if (act === 'ok') closePicker(true);
    });
  }

  function openPicker(key) {
    closePicker(false);
    pickerKey = key;
    if (key === 'region') {
      openRegionCascade();
      return;
    }
    if (key === 'planDate') {
      openDateCascade();
    }
  }

  regionTree = buildRegionTree();
  syncMeta();
  renderTypeSeg();
  syncTypeBlocks();
  relocate();
  if (photosEl && window.AppMpPhotos) {
    photoStrip = AppMpPhotos.attach({
      el: photosEl,
      photos: photos,
      max: MAX_PHOTOS,
      logScope: 'm-report',
      previewMeta: previewMeta,
    });
  }
  autoGrowMeasure();

  var measureEl = document.getElementById('rWellMeasure');
  if (measureEl) {
    measureEl.addEventListener('input', autoGrowMeasure);
  }

  typeCtrlEl.addEventListener('click', function (e) {
    var item = e.target.closest('.seg-item');
    if (!item || !typeCtrlEl.contains(item)) return;
    var next = item.getAttribute('data-type');
    if (!next || next === form.type) return;
    form.type = next;
    renderTypeSeg();
    syncTypeBlocks();
    if (window.AppLog) AppLog.info('m-report', 'type change', { type: form.type });
  });

  document.getElementById('btnRelocate').addEventListener('click', function (e) {
    e.stopPropagation();
    relocate();
  });

  document.querySelector('.m-report__meta').addEventListener('click', function (e) {
    var row = e.target.closest('[data-meta]');
    if (!row) return;
    openPicker(row.getAttribute('data-meta'));
  });

  var planDateRow = document.getElementById('rWellPlanDateRow');
  if (planDateRow) {
    planDateRow.addEventListener('click', function () {
      openPicker('planDate');
    });
  }

  document.getElementById('reportForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!photos.length) {
      AppUI.toast('请至少上传 1 张图片', 'error');
      return;
    }
    if (!form.street || !form.village) {
      AppUI.toast('请选择行政区划', 'error');
      return;
    }
    if (!form.planDate) {
      AppUI.toast('请选择计划整改完成时间', 'error');
      return;
    }
    var measure = (document.getElementById('rWellMeasure').value || '').trim();
    if (!measure) {
      AppUI.toast('请填写整改措施', 'error');
      return;
    }
    var assigneeName = (document.getElementById('rAssigneeName').value || '').trim();
    if (!assigneeName) {
      AppUI.toast('请填写整改责任人', 'error');
      return;
    }
    var assigneePhone = (document.getElementById('rAssigneePhone').value || '').trim();
    if (!assigneePhone) {
      AppUI.toast('请填写整改联系电话', 'error');
      return;
    }

    var desc = (document.getElementById('rDesc').value || '').trim();
    if (!desc) {
      AppUI.toast('请填写问题描述', 'error');
      return;
    }
    var code = (document.getElementById('rCode').value || '').trim();
    var projectName = (document.getElementById('rProjectName').value || '').trim();
    if (!projectName) {
      AppUI.toast('请填写项目名称', 'error');
      return;
    }

    var planDate = form.planDate;
    var wellExtra = null;
    var roadExtra = null;
    var bridgeExtra = null;
    var forestExtra = null;
    var transformerExtra = null;
    if (form.type === 'well') {
      wellExtra = validateWellFields();
      if (!wellExtra) return;
      wellExtra.rectifyMeasure = measure;
      wellExtra.wellPlanDate = planDate;
    } else if (form.type === 'road') {
      roadExtra = validateRoadFields();
      if (!roadExtra) return;
    } else if (form.type === 'bridge') {
      bridgeExtra = validateBridgeFields();
      if (!bridgeExtra) return;
    } else if (form.type === 'forest') {
      forestExtra = validateForestFields();
      if (!forestExtra) return;
    } else if (form.type === 'transformer') {
      transformerExtra = validateTransformerFields();
      if (!transformerExtra) return;
    }

    var photoAt = new Date().toISOString();
    var payload = {
      type: form.type,
      street: form.street,
      village: form.village,
      projectName: projectName,
      code: code,
      description: desc,
      locationText: loc.address,
      address: loc.address,
      lat: loc.lat,
      lng: loc.lng,
      photoSrc: photos[0],
      photos: photos.slice(),
      photoAt: photoAt,
      reporterId: session.staffId,
      reporterName: session.name,
      reporterPhone: session.phone,
      assigneeId: '',
      assigneeName: assigneeName,
      assigneePhone: assigneePhone,
      measures: measure,
      planDate: planDate,
      status: 'pending',
    };
    if (wellExtra) payload.well = wellExtra;
    if (roadExtra) {
      payload.road = roadExtra;
      payload.length = String(roadExtra.length);
      payload.width = String(roadExtra.width);
      payload.thickness = String(roadExtra.thickness);
      payload.hasShoulder = roadExtra.hasShoulder === 'yes' ? '是' : '否';
      payload.hasAsh = roadExtra.hasAsh === 'yes' ? '是' : '否';
      payload.treeSurvive = String(roadExtra.treeSurvive);
    }
    if (bridgeExtra) {
      payload.bridge = bridgeExtra;
      payload.bridgeKind = bridgeExtra.kind;
      payload.bridgeKindLabel = BRIDGE_KIND_LABEL[bridgeExtra.kind] || '';
      payload.length = String(bridgeExtra.length);
      payload.width = String(bridgeExtra.width);
    }
    if (forestExtra) payload.forest = forestExtra;
    if (transformerExtra) payload.transformer = transformerExtra;

    AppData.addIssue(payload);
    AppUI.toast('已提交，已进入待整改清单');
    if (window.AppLog) AppLog.info('m-report', 'submitted', { type: form.type, code: code });
    setTimeout(function () {
      if (window.HSFNav) HSFNav.go('./todo.html');
      else location.href = './todo.html';
    }, 500);
  });

  function onLeave() {
    closePicker(false);
    if (photoStrip) {
      photoStrip.destroy();
      photoStrip = null;
    }
    var bodyEl = document.getElementById('reportForm');
    if (bodyEl && bodyEl._hsfTopFade) {
      bodyEl.removeEventListener('scroll', bodyEl._hsfTopFade);
      bodyEl._hsfTopFade = null;
    }
    document.removeEventListener('hsf-page-leave', onLeave);
  }
  document.addEventListener('hsf-page-leave', onLeave);

  (function bindTopFade() {
    var bodyEl = document.getElementById('reportForm');
    var fadeEl = document.getElementById('rTopFade');
    if (!bodyEl || !fadeEl) return;
    function syncTopFade() {
      fadeEl.classList.toggle('is-on', bodyEl.scrollTop > 16);
    }
    bodyEl._hsfTopFade = syncTopFade;
    bodyEl.addEventListener('scroll', syncTopFade, { passive: true });
    syncTopFade();
  })();
})();
