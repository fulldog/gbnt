/**
 * 上报表单引擎（管理端新增弹窗 / 可复用）
 */
(function (global) {
  'use strict';

  function create(cfg) {
    cfg = cfg || {};
    var P = cfg.idPrefix || 'rf-';
    var logScope = cfg.logScope || 'rf-form';
    var mountHostFn = cfg.mountHost || function () { return document.body; };
    var getRegionFn = cfg.getRegion || function () { return { street: '', village: '' }; };

    function gid(name) { return P + name; }
    function $g(name) { return document.getElementById(gid(name)); }

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

  var photos = [];
  var MAX_PHOTOS = 6;

  var pickerRoot = null;
  var pickerKey = '';
  var cascade = null;
  var scrollTimer = null;
  var photoStrip = null;

  var photosEl = null;
  var typeCtrlEl = null;
  var wellBlock = null;
  var roadBlock = null;
  var bridgeBlock = null;
  var forestBlock = null;
  var transformerBlock = null;

  var WELL_YN_FIELDS = ['buildKind', 'waterOut', 'pipeOk', 'wiringOk', 'boxOk', 'coverOk'];
  var WELL_YN_NAMES = {
    buildKind: '新建/配套',
    waterOut: '机井是否出水',
    pipeOk: '管道是否按要求连接',
    wiringOk: '走线是否规范',
    boxOk: '配电箱是否完好',
    coverOk: '井台、井盖是否完整',
  };

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

  function syncMeta() {
    var planLabel = $g('rWellPlanDateLabel');
    if (planLabel) {
      planLabel.textContent = form.planDate ? form.planDate : '请选择';
      planLabel.classList.toggle('is-placeholder', !form.planDate);
    }
  }

  function autoGrowMeasure() {
    var el = $g('rWellMeasure');
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.max(64, el.scrollHeight) + 'px';
  }

  function fillReporterFromSession() {
    var session = (global.AppStorage && global.AppStorage.get('session', null)) || {};
    if ($g('rReporterName')) $g('rReporterName').value = session.name || '';
    if ($g('rReporterPhone')) $g('rReporterPhone').value = session.phone || '';
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

  function syncTypeBlocks() {
    var blocks = {
      well: wellBlock,
      road: roadBlock,
      bridge: bridgeBlock,
      forest: forestBlock,
      transformer: transformerBlock,
    };
    Object.keys(blocks).forEach(function (key) {
      var el = blocks[key];
      if (!el) return;
      var active = form.type === key;
      el.hidden = !active;
      el.classList.toggle('is-active', active);
    });
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
    var total = parseInt($g('rWellOutletTotal').value, 10);
    var casing = parseInt($g('rWellCasingTotal').value, 10);
    var outletDamaged = parseInt($g('rWellOutletDamaged').value, 10);
    var casingDamaged = parseInt($g('rWellCasingDamaged').value, 10);
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
      keeperName: ($g('rWellKeeper').value || '').trim(),
      keeperPhone: ($g('rWellKeeperPhone').value || '').trim(),
      rectifyMeasure: ($g('rWellMeasure').value || '').trim(),
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
      keeperName: ($g('rRoadKeeper').value || '').trim(),
      keeperPhone: ($g('rRoadKeeperPhone').value || '').trim(),
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
      keeperName: ($g('rBridgeKeeper').value || '').trim(),
      keeperPhone: ($g('rBridgeKeeperPhone').value || '').trim(),
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
      keeperName: ($g('rForestKeeper').value || '').trim(),
      keeperPhone: ($g('rForestKeeperPhone').value || '').trim(),
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
      model: ($g('rTfModel').value || '').trim(),
      voltage: readRadioIn(transformerBlock, 'voltage'),
      powered: readRadioIn(transformerBlock, 'powered'),
      deviceOk: readRadioIn(transformerBlock, 'deviceOk'),
      cabinetOk: readRadioIn(transformerBlock, 'cabinetOk'),
      illegalWire: readRadioIn(transformerBlock, 'illegalWire'),
      keeperName: ($g('rTfKeeper').value || '').trim(),
      keeperPhone: ($g('rTfKeeperPhone').value || '').trim(),
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
    if (!typeCtrlEl) return;
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

  function previewMeta() {
    var addrEl = $g('rAddress');
    var address = addrEl ? (addrEl.value || '').trim() : '';
    return {
      address: address,
      lat: 0,
      lng: 0,
      time: global.AppWatermark ? AppWatermark.formatDateZh() : '',
    };
  }

  function closePicker(commit) {
    if (!pickerRoot) return;
    if (commit) {
      if (pickerKey === 'planDate' && cascade) {
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

    var host = mountHostFn();
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
    if (key === 'planDate') {
      openDateCascade();
    }
  }

    function validateAndCollect(session) {
      session = session || {};
      syncRegionFromPicker();
      if (!photos.length) {
        global.AppUI.toast('请至少上传 1 张图片', 'error');
        return null;
      }
      if (!form.street || !form.village) {
        global.AppUI.toast('请选择行政区划', 'error');
        return null;
      }
      if (!form.planDate) {
        global.AppUI.toast('请选择计划整改完成时间', 'error');
        return null;
      }
      var measure = ($g('rWellMeasure').value || '').trim();
      if (!measure) {
        global.AppUI.toast('请填写整改措施', 'error');
        return null;
      }
      var assigneeName = ($g('rAssigneeName').value || '').trim();
      if (!assigneeName) {
        global.AppUI.toast('请填写整改责任人', 'error');
        return null;
      }
      var assigneePhone = ($g('rAssigneePhone').value || '').trim();
      if (!assigneePhone) {
        global.AppUI.toast('请填写整改联系电话', 'error');
        return null;
      }
      var desc = ($g('rDesc').value || '').trim();
      if (!desc) {
        global.AppUI.toast('请填写问题描述', 'error');
        return null;
      }
      var address = ($g('rAddress').value || '').trim();
      if (!address) {
        global.AppUI.toast('请填写现场地址', 'error');
        return null;
      }
      var code = ($g('rCode').value || '').trim();
      var projectName = ($g('rProjectName').value || '').trim();
      if (!projectName) {
        global.AppUI.toast('请填写项目名称', 'error');
        return null;
      }
      var planDate = form.planDate;
      var reporterName = ($g('rReporterName').value || '').trim();
      var reporterPhone = ($g('rReporterPhone').value || '').trim();
      var sessionName = (session.name || '').trim();
      var wellExtra = null;
      var roadExtra = null;
      var bridgeExtra = null;
      var forestExtra = null;
      var transformerExtra = null;
      if (form.type === 'well') {
        wellExtra = validateWellFields();
        if (!wellExtra) return null;
        wellExtra.rectifyMeasure = measure;
        wellExtra.wellPlanDate = planDate;
      } else if (form.type === 'road') {
        roadExtra = validateRoadFields();
        if (!roadExtra) return null;
      } else if (form.type === 'bridge') {
        bridgeExtra = validateBridgeFields();
        if (!bridgeExtra) return null;
      } else if (form.type === 'forest') {
        forestExtra = validateForestFields();
        if (!forestExtra) return null;
      } else if (form.type === 'transformer') {
        transformerExtra = validateTransformerFields();
        if (!transformerExtra) return null;
      }
      var photoAt = new Date().toISOString();
      var payload = {
        type: form.type,
        street: form.street,
        village: form.village,
        projectName: projectName,
        code: code,
        description: desc,
        locationText: address,
        address: address,
        lat: 0,
        lng: 0,
        photoSrc: photos[0],
        photos: photos.slice(),
        photoAt: photoAt,
        reporterId: reporterName && reporterName === sessionName ? (session.staffId || '') : '',
        reporterName: reporterName,
        reporterPhone: reporterPhone,
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
      return payload;
    }

    function syncRegionFromPicker() {
      var r = getRegionFn() || {};
      form.street = r.street || '';
      form.village = r.village || '';
    }

    function setRadioIn(block, field, value) {
      if (!block || !value) return;
      var group = block.querySelector('.m-yn-group[data-field="' + field + '"]');
      if (!group) return;
      var input = group.querySelector('input[value="' + value + '"]');
      if (input) input.checked = true;
    }

    function reset() {
      closePicker(false);
      form.type = 'well';
      form.street = '';
      form.village = '';
      form.planDate = '';
      photos.length = 0;
      if (photoStrip) photoStrip.render();
      var f = $g('form');
      if (f) f.reset();
      fillReporterFromSession();
      if ($g('rProjectName') && !$g('rProjectName').value.trim()) {
        $g('rProjectName').value = '高标农田建设项目';
      }
      renderTypeSeg();
      syncTypeBlocks();
      syncMeta();
    }

    function fill(item) {
      item = item || {};
      closePicker(false);
      form.type = item.type || 'well';
      form.street = item.street || '';
      form.village = item.village || '';
      form.planDate = item.planDate || '';
      if ($g('rDesc')) $g('rDesc').value = item.description || '';
      if ($g('rCode')) $g('rCode').value = item.code || '';
      if ($g('rProjectName')) $g('rProjectName').value = item.projectName || '';
      if ($g('rReporterName')) $g('rReporterName').value = item.reporterName || '';
      if ($g('rReporterPhone')) $g('rReporterPhone').value = item.reporterPhone || '';
      if ($g('rAddress')) $g('rAddress').value = item.address || item.locationText || '';
      if ($g('rWellMeasure')) $g('rWellMeasure').value = item.measures || item.rectifyPlan || '';
      if ($g('rAssigneeName')) $g('rAssigneeName').value = item.assigneeName || '';
      if ($g('rAssigneePhone')) $g('rAssigneePhone').value = item.assigneePhone || '';
      photos.length = 0;
      (item.photos || (item.photoSrc ? [item.photoSrc] : [])).forEach(function (p) { photos.push(p); });
      if (photoStrip) photoStrip.render();
      renderTypeSeg();
      syncTypeBlocks();
      syncMeta();
      autoGrowMeasure();
      var w = item.well;
      if (w && wellBlock) {
        WELL_YN_FIELDS.forEach(function (k) { setRadioIn(wellBlock, k, w[k]); });
        if ($g('rWellOutletTotal')) $g('rWellOutletTotal').value = w.outletTotal != null ? w.outletTotal : '';
        if ($g('rWellOutletDamaged')) {
          $g('rWellOutletDamaged').value =
            w.outletDamaged != null ? w.outletDamaged : w.outletTotal != null ? 0 : '';
        }
        if ($g('rWellCasingTotal')) $g('rWellCasingTotal').value = w.casingTotal != null ? w.casingTotal : '';
        if ($g('rWellCasingDamaged')) {
          $g('rWellCasingDamaged').value =
            w.casingDamaged != null ? w.casingDamaged : w.casingTotal != null ? 0 : '';
        }
        if ($g('rWellKeeper')) $g('rWellKeeper').value = w.keeperName || '';
        if ($g('rWellKeeperPhone')) $g('rWellKeeperPhone').value = w.keeperPhone || '';
      }
      var rd = item.road;
      if (rd && roadBlock) {
        if ($g('rRoadLength')) $g('rRoadLength').value = rd.length != null ? rd.length : item.length || '';
        if ($g('rRoadWidth')) $g('rRoadWidth').value = rd.width != null ? rd.width : item.width || '';
        if ($g('rRoadThickness')) $g('rRoadThickness').value = rd.thickness != null ? rd.thickness : item.thickness || '';
        setRadioIn(roadBlock, 'hasShoulder', rd.hasShoulder);
        setRadioIn(roadBlock, 'hasAsh', rd.hasAsh);
        if ($g('rRoadTreeSurvive')) $g('rRoadTreeSurvive').value = rd.treeSurvive != null ? rd.treeSurvive : item.treeSurvive || '';
        if ($g('rRoadKeeper')) $g('rRoadKeeper').value = rd.keeperName || '';
        if ($g('rRoadKeeperPhone')) $g('rRoadKeeperPhone').value = rd.keeperPhone || '';
      }
      var br = item.bridge;
      if (br && bridgeBlock) {
        setRadioIn(bridgeBlock, 'kind', br.kind || item.bridgeKind);
        if ($g('rBridgeLength')) $g('rBridgeLength').value = br.length != null ? br.length : item.length || '';
        if ($g('rBridgeWidth')) $g('rBridgeWidth').value = br.width != null ? br.width : item.width || '';
        if ($g('rBridgeKeeper')) $g('rBridgeKeeper').value = br.keeperName || '';
        if ($g('rBridgeKeeperPhone')) $g('rBridgeKeeperPhone').value = br.keeperPhone || '';
      }
      var fo = item.forest;
      if (fo && forestBlock) {
        if ($g('rForestHandover')) $g('rForestHandover').value = fo.handoverCount != null ? fo.handoverCount : '';
        if ($g('rForestExisting')) $g('rForestExisting').value = fo.existingCount != null ? fo.existingCount : '';
        if ($g('rForestSurviveRate')) $g('rForestSurviveRate').value = fo.surviveRate != null ? fo.surviveRate : '';
        setRadioIn(forestBlock, 'brokenBelt', fo.brokenBelt);
        setRadioIn(forestBlock, 'deadTrees', fo.deadTrees);
        setRadioIn(forestBlock, 'pest', fo.pest);
        if ($g('rForestKeeper')) $g('rForestKeeper').value = fo.keeperName || '';
        if ($g('rForestKeeperPhone')) $g('rForestKeeperPhone').value = fo.keeperPhone || '';
      }
      var tf = item.transformer;
      if (tf && transformerBlock) {
        if ($g('rTfCapacity')) $g('rTfCapacity').value = tf.capacity != null ? tf.capacity : '';
        if ($g('rTfModel')) $g('rTfModel').value = tf.model || '';
        setRadioIn(transformerBlock, 'voltage', tf.voltage);
        setRadioIn(transformerBlock, 'powered', tf.powered);
        setRadioIn(transformerBlock, 'deviceOk', tf.deviceOk);
        setRadioIn(transformerBlock, 'cabinetOk', tf.cabinetOk);
        setRadioIn(transformerBlock, 'illegalWire', tf.illegalWire);
        if ($g('rTfKeeper')) $g('rTfKeeper').value = tf.keeperName || '';
        if ($g('rTfKeeperPhone')) $g('rTfKeeperPhone').value = tf.keeperPhone || '';
      }
    }

    function destroy() {
      closePicker(false);
      if (photoStrip) {
        photoStrip.destroy();
        photoStrip = null;
      }
    }

    var bound = false;

    function init() {
      photosEl = $g('rPhotos');
      typeCtrlEl = $g('v86-controller');
      wellBlock = $g('rWellBlock');
      roadBlock = $g('rRoadBlock');
      bridgeBlock = $g('rBridgeBlock');
      forestBlock = $g('rForestBlock');
      transformerBlock = $g('rTransformerBlock');
      syncMeta();
      renderTypeSeg();
      syncTypeBlocks();
      if (!photoStrip && photosEl && global.AppMpPhotos) {
        photoStrip = AppMpPhotos.attach({
          el: photosEl,
          photos: photos,
          max: MAX_PHOTOS,
          logScope: logScope,
          previewMeta: previewMeta,
        });
      } else if (photoStrip) {
        photoStrip.render();
      }
      autoGrowMeasure();
      if (bound) return;
      bound = true;
      var measureEl = $g('rWellMeasure');
      if (measureEl) measureEl.addEventListener('input', autoGrowMeasure);
      if (typeCtrlEl) {
        typeCtrlEl.addEventListener('click', function (e) {
          var item = e.target.closest('.seg-item');
          if (!item || !typeCtrlEl.contains(item)) return;
          var next = item.getAttribute('data-type');
          if (!next || next === form.type) return;
          form.type = next;
          renderTypeSeg();
          syncTypeBlocks();
        });
      }
      var planDateRow = $g('rWellPlanDateRow');
      if (planDateRow) {
        planDateRow.addEventListener('click', function () { openPicker('planDate'); });
      }
      if (global.AppIcons) global.AppIcons.injectAll(document.getElementById('rf-form-overlay') || document);
    }

    return { init: init, reset: reset, fill: fill, validateAndCollect: validateAndCollect, destroy: destroy, syncTypeBlocks: syncTypeBlocks };
  }

  global.HSFReportFormEngine = { create: create };
})(window);
