/**
 * 管理端巡查表单引擎（对齐 miniapp/report 字段与提交规则；单页无向导）
 * 电子签名：排查上报必填（右栏）；整改闭环不在此表单。
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
    var MAX_PHOTOS = 6;
    var TYPE_OPTS = [
      { value: 'well', label: '机井' },
      { value: 'road', label: '道路' },
      { value: 'bridge', label: '桥涵闸' },
      { value: 'forest', label: '林网' },
      { value: 'transformer', label: '变压器' },
    ];
    var TYPE_LABELS = {
      well: '机井',
      road: '道路',
      bridge: '桥涵闸',
      forest: '林网',
      transformer: '变压器',
    };
    var BRIDGE_KIND_LABEL = { bridge: '桥', culvert: '涵', gate: '闸' };

    var WELL_QUIZ_FIELDS = ['waterOut', 'pipeOk', 'wiringOk', 'boxOk', 'coverOk'];
    var WELL_QUIZ_NAMES = {
      waterOut: '机井是否出水',
      pipeOk: '管道是否按要求连接',
      wiringOk: '走线是否规范',
      boxOk: '配电箱及电表等设施是否完好',
      coverOk: '井台、井盖是否完整',
    };
    var ROAD_QUIZ_FIELDS = ['hasShoulder', 'hasAsh', 'hasRoadDamage'];
    var ROAD_QUIZ_NAMES = {
      hasShoulder: '是否有路肩',
      hasAsh: '是否有灰土层',
      hasRoadDamage: '是否有道路损坏',
    };
    var FOREST_QUIZ_FIELDS = ['brokenBelt', 'deadTrees', 'pest'];
    var FOREST_QUIZ_NAMES = {
      brokenBelt: '林带是否断带',
      deadTrees: '是否有枯死木',
      pest: '是否发现病虫害',
    };
    var TRANSFORMER_QUIZ_FIELDS = ['powered', 'deviceOk', 'cabinetOk', 'illegalWire'];
    var TRANSFORMER_QUIZ_NAMES = {
      powered: '是否通电',
      deviceOk: '设备是否完好',
      cabinetOk: '配电设施是否完好',
      illegalWire: '是否私拉乱接',
    };
    var BRIDGE_QUIZ_FIELDS = ['needsRectify'];
    var BRIDGE_QUIZ_NAMES = { needsRectify: '是否有淤堵与损坏' };
    var NEGATIVE_QUIZ_FIELDS = {
      road: ['hasRoadDamage'],
      bridge: ['needsRectify'],
      forest: ['brokenBelt', 'deadTrees', 'pest'],
      transformer: ['illegalWire'],
    };

    var QUIZ_BLOCK_IDS = {
      well: 'rWellQuiz',
      road: 'rRoadQuiz',
      bridge: 'rBridgeQuiz',
      forest: 'rForestQuiz',
      transformer: 'rTransformerQuiz',
    };
    var FILL_BLOCK_IDS = {
      well: 'rWellBlock',
      road: 'rRoadBlock',
      bridge: 'rBridgeBlock',
      forest: 'rForestBlock',
      transformer: 'rTransformerBlock',
    };

    var form = {
      type: 'well',
      street: '',
      village: '',
      naturalVillage: '',
      planDate: '',
      projectYear: '',
    };

    var editingId = null;
    var quizData = {};
    var quizStrips = {};
    var wellFillPhotos = [];
    var wellFillPhotoStrip = null;
    var signaturePad = null;
    var signatureData = '';

    var pickerRoot = null;
    var pickerKey = '';
    var cascade = null;
    var scrollTimer = null;
    var datePicker = null;

    var typeCtrlEl = null;
    var yearGroupEl = null;
    var fillBlocks = {};
    var quizBlocks = {};
    var bound = false;

    function indexOf(opts, value) {
      for (var i = 0; i < opts.length; i++) {
        if (opts[i].value === value) return i;
      }
      return 0;
    }

    function formatPlanDateDisplay(iso) {
      if (!iso) return '';
      var m = String(iso).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (!m) return String(iso);
      return (
        m[1] +
        '年' +
        String(m[2]).padStart(2, '0') +
        '月' +
        String(m[3]).padStart(2, '0') +
        '日'
      );
    }

    function daysInMonth(year, month) {
      return new Date(year, month, 0).getDate();
    }

    function activeQuizFields() {
      if (form.type === 'well') return WELL_QUIZ_FIELDS;
      if (form.type === 'road') return ROAD_QUIZ_FIELDS;
      if (form.type === 'bridge') return BRIDGE_QUIZ_FIELDS;
      if (form.type === 'forest') return FOREST_QUIZ_FIELDS;
      if (form.type === 'transformer') return TRANSFORMER_QUIZ_FIELDS;
      return [];
    }

    function activeQuizNames() {
      if (form.type === 'well') return WELL_QUIZ_NAMES;
      if (form.type === 'road') return ROAD_QUIZ_NAMES;
      if (form.type === 'bridge') return BRIDGE_QUIZ_NAMES;
      if (form.type === 'forest') return FOREST_QUIZ_NAMES;
      if (form.type === 'transformer') return TRANSFORMER_QUIZ_NAMES;
      return {};
    }

    function isNegativeQuizField(field) {
      var list = NEGATIVE_QUIZ_FIELDS[form.type] || [];
      return list.indexOf(field) !== -1;
    }

    function quizStepRequiresPhoto(field, ans) {
      if (global.AppWellSubmitRules && typeof AppWellSubmitRules.quizStepRequiresPhoto === 'function') {
        return AppWellSubmitRules.quizStepRequiresPhoto(field, ans);
      }
      if (!field || !ans) return false;
      if (field === 'wiringOk') return false;
      if (field === 'waterOut' && ans === 'yes') return false;
      return true;
    }

    function quizAnswerIndicatesIssue(ans, field) {
      if (global.AppWellSubmitRules && typeof AppWellSubmitRules.quizAnswerIndicatesIssue === 'function') {
        return AppWellSubmitRules.quizAnswerIndicatesIssue(ans, field, form.type);
      }
      if (!ans || !field) return false;
      if (field === 'hasShoulder' || field === 'hasAsh') return false;
      if (isNegativeQuizField(field)) return ans === 'yes';
      return ans === 'no';
    }

    /** 任一项表明有问题 → 须在末题下展示并填写整改计划日期（对齐 miniapp/report） */
    function wizardNeedsRectify() {
      var block = quizBlocks[form.type];
      if (!block) return false;
      var fields = activeQuizFields();
      var i;
      for (i = 0; i < fields.length; i++) {
        var field = fields[i];
        var ans = readRadioIn(block, field);
        if (quizAnswerIndicatesIssue(ans, field)) return true;
      }
      return false;
    }

    function syncQuizPlanDateRow() {
      var row = document.getElementById('rf-quiz-plan-date-row');
      if (!row) return;
      var show = wizardNeedsRectify();
      if (show) {
        row.removeAttribute('hidden');
      } else {
        row.setAttribute('hidden', '');
        form.planDate = '';
        if (datePicker && typeof datePicker.setValue === 'function') {
          datePicker.setValue('');
        }
        syncMeta();
      }
    }

    function quizItemEl(field) {
      var block = quizBlocks[form.type];
      if (!block) return null;
      return block.querySelector('.rf-quiz-item[data-quiz-field="' + field + '"]');
    }

    function readRadioIn(block, field) {
      if (!block) return '';
      var group = block.querySelector('.m-yn-group[data-field="' + field + '"]');
      if (!group) return '';
      var checked = group.querySelector('input[type="radio"]:checked');
      return checked ? checked.value : '';
    }

    function setRadioIn(block, field, value) {
      if (!block || !value) return;
      var group = block.querySelector('.m-yn-group[data-field="' + field + '"]');
      if (!group) return;
      var input = group.querySelector('input[value="' + value + '"]');
      if (input) input.checked = true;
    }

    function parseNum(id) {
      var el = document.getElementById(id);
      if (!el) return null;
      var raw = (el.value || '').trim();
      if (raw === '') return null;
      var n = parseFloat(raw);
      return isNaN(n) ? null : n;
    }

    function syncMeta() {
      if (datePicker && typeof datePicker.setValue === 'function') {
        datePicker.setValue(form.planDate || '');
        return;
      }
      var planLabel = $g('rWellPlanDateLabel');
      if (planLabel) {
        planLabel.textContent = form.planDate ? formatPlanDateDisplay(form.planDate) : '请选择';
        planLabel.classList.toggle('is-placeholder', !form.planDate);
      }
    }

    function ensureDatePicker() {
      if (datePicker) return datePicker;
      var mount = $g('rPlanDate');
      if (!mount || !global.HSFDatePicker || typeof HSFDatePicker.create !== 'function') {
        return null;
      }
      datePicker = HSFDatePicker.create(mount.id, {
        value: form.planDate || '',
        formatDisplay: formatPlanDateDisplay,
        onChange: function (ymd) {
          form.planDate = ymd || '';
        },
      });
      return datePicker;
    }

    function syncYearButtons() {
      if (!yearGroupEl) return;
      var btns = yearGroupEl.querySelectorAll('.m-year-btn');
      btns.forEach(function (btn) {
        var y = btn.getAttribute('data-year');
        var on = y === form.projectYear;
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }

    function fillReporterFromSession() {
      var session = (global.AppStorage && global.AppStorage.get('session', null)) || {};
      if ($g('rReporterName')) $g('rReporterName').value = session.name || '';
      if ($g('rReporterPhone')) $g('rReporterPhone').value = session.phone || '';
    }

    function suggestCodeIfNeeded() {
      if (editingId) return;
      if (!global.AppProjectCode || typeof AppProjectCode.suggest !== 'function') return;
      if ($g('rCode')) $g('rCode').value = AppProjectCode.suggest(form.type);
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

    function syncTypeBlocks() {
      Object.keys(FILL_BLOCK_IDS).forEach(function (key) {
        var fill = fillBlocks[key];
        var quiz = quizBlocks[key];
        var active = form.type === key;
        [fill, quiz].forEach(function (el) {
          if (!el) return;
          el.hidden = !active;
          el.classList.toggle('is-active', active);
        });
      });
      syncAllQuizExtras();
      attachWellFillPhotos();
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

    function ensureQuizSlot(field) {
      if (!quizData[field]) {
        quizData[field] = { answer: '', desc: '', photos: [] };
      }
      if (field === 'waterOut' && !quizData[field].photoProof) {
        quizData[field].photoProof = { firstCapturedAt: null };
      }
      return quizData[field];
    }

    function destroyWellFillPhotos() {
      if (wellFillPhotoStrip) {
        wellFillPhotoStrip.destroy();
        wellFillPhotoStrip = null;
      }
    }

    function attachWellFillPhotos() {
      destroyWellFillPhotos();
      if (form.type !== 'well') return;
      var photosEl = $g('rWellFillPhotos');
      if (!photosEl || !global.AppMpPhotos) return;
      wellFillPhotoStrip = global.AppMpPhotos.attach({
        el: photosEl,
        photos: wellFillPhotos,
        max: MAX_PHOTOS,
        logScope: logScope + '.fill',
        previewMeta: previewMeta,
      });
    }

    function resolveWellFillPhotos(item) {
      var w = (item && item.well) || {};
      if (w.fillPhotos && w.fillPhotos.length) return w.fillPhotos.slice();
      var quizSet = {};
      WELL_QUIZ_FIELDS.forEach(function (field) {
        var slot = (w.quizSteps && w.quizSteps[field]) || null;
        if (slot && slot.photos && slot.photos.length) {
          slot.photos.forEach(function (p) {
            if (p) quizSet[p] = true;
          });
        }
      });
      var fill = [];
      (item.photos || []).forEach(function (p) {
        if (p && !quizSet[p]) fill.push(p);
      });
      return fill;
    }

    function destroyQuizStrip(field) {
      if (quizStrips[field]) {
        quizStrips[field].destroy();
        delete quizStrips[field];
      }
    }

    function destroyAllQuizStrips() {
      Object.keys(quizStrips).forEach(destroyQuizStrip);
    }

    function attachQuizPhotos(field) {
      destroyQuizStrip(field);
      var item = quizItemEl(field);
      if (!item) return;
      var photosEl = item.querySelector('.rf-quiz-photos');
      if (!photosEl || !global.AppMpPhotos) return;
      var slot = ensureQuizSlot(field);
      if (!Array.isArray(slot.photos)) slot.photos = [];

      if (field === 'waterOut' && slot.answer === 'yes' && global.AppWellWaterPhotos) {
        if (!slot.photoProof) slot.photoProof = { firstCapturedAt: null };
        quizStrips[field] = AppWellWaterPhotos.attach({
          el: photosEl,
          photos: slot.photos,
          photoProof: slot.photoProof,
          max: MAX_PHOTOS,
          enforceInterval: false,
          cameraOnly: false,
          previewMeta: previewMeta,
          onChange: function () {
            /* strip mutates slot.photos in place */
          },
        });
        return;
      }

      quizStrips[field] = AppMpPhotos.attach({
        el: photosEl,
        photos: slot.photos,
        max: MAX_PHOTOS,
        logScope: logScope + '.' + field,
        previewMeta: previewMeta,
      });
    }

    function syncQuizExtra(field) {
      var item = quizItemEl(field);
      if (!item) return;
      var ans = readRadioIn(quizBlocks[form.type], field);
      var slot = ensureQuizSlot(field);
      slot.answer = ans || '';
      var extra = item.querySelector('.rf-quiz-extra');
      /* 未选题不展示；选是/否后展示，占位区分必填/选填 */
      var show = !!ans;
      if (extra) {
        if (show) extra.removeAttribute('hidden');
        else extra.setAttribute('hidden', '');
      }
      var isIssue = quizAnswerIndicatesIssue(ans, field);
      item.classList.toggle('is-issue', !!isIssue);

      var descEl = item.querySelector('.rf-quiz-desc');
      if (descEl) {
        if (!ans) {
          descEl.placeholder = '请先选择是或否';
        } else if (isIssue) {
          descEl.placeholder = '请输入问题描述(必填)';
        } else {
          descEl.placeholder = '请输入备注(选填)';
        }
        if (show) descEl.value = slot.desc || '';
      }
      if (show) {
        attachQuizPhotos(field);
      } else {
        destroyQuizStrip(field);
      }
      syncQuizPlanDateRow();
    }

    function photosElClear(item) {
      var el = item.querySelector('.rf-quiz-photos');
      if (el) el.innerHTML = '';
      return !!el;
    }

    function syncAllQuizExtras() {
      activeQuizFields().forEach(syncQuizExtra);
      syncQuizPlanDateRow();
    }

    function harvestQuizDesc(field) {
      var item = quizItemEl(field);
      if (!item) return;
      var descEl = item.querySelector('.rf-quiz-desc');
      var slot = ensureQuizSlot(field);
      slot.desc = descEl ? (descEl.value || '').trim() : '';
      slot.answer = readRadioIn(quizBlocks[form.type], field) || '';
    }

    function harvestAllQuiz() {
      activeQuizFields().forEach(harvestQuizDesc);
    }

    function clearQuizUiAnswers() {
      Object.keys(quizBlocks).forEach(function (key) {
        var block = quizBlocks[key];
        if (!block) return;
        block.querySelectorAll('input[type="radio"]').forEach(function (inp) {
          inp.checked = false;
        });
        block.querySelectorAll('.rf-quiz-desc').forEach(function (ta) {
          ta.value = '';
          ta.placeholder = '请先选择是或否';
        });
        block.querySelectorAll('.rf-quiz-extra').forEach(function (ex) {
          ex.setAttribute('hidden', '');
        });
        block.querySelectorAll('.rf-quiz-item').forEach(function (it) {
          it.classList.remove('is-issue');
        });
      });
    }

    function resetQuizState() {
      destroyAllQuizStrips();
      quizData = {};
      clearQuizUiAnswers();
    }

    function defaultWizardDescription() {
      return (TYPE_LABELS[form.type] || '巡查') + '巡查上报';
    }

    function mergeQuizPhotos() {
      var all = [];
      activeQuizFields().forEach(function (key) {
        var slot = quizData[key];
        if (slot && slot.photos && slot.photos.length) {
          all = all.concat(slot.photos);
        }
      });
      return all;
    }

    function mergeAllPhotos() {
      var all = [];
      if (form.type === 'well' && wellFillPhotos.length) {
        all = wellFillPhotos.slice();
      }
      return all.concat(mergeQuizPhotos());
    }

    function mergeQuizDescription() {
      var parts = [];
      var names = activeQuizNames();
      activeQuizFields().forEach(function (key) {
        var slot = quizData[key];
        if (slot && slot.desc) {
          parts.push((names[key] || key) + '：' + slot.desc);
        }
      });
      return parts.length ? parts.join('\n') : defaultWizardDescription();
    }

    function validateFillFields() {
      if (form.type === 'well') {
        if (!readRadioIn(fillBlocks.well, 'buildKind')) {
          AppUI.toast('请选择设施类型', 'error');
          return false;
        }
        var total = parseInt(($g('rWellOutletTotal') && $g('rWellOutletTotal').value) || '', 10);
        var outletDamaged = parseInt(($g('rWellOutletDamaged') && $g('rWellOutletDamaged').value) || '', 10);
        var casing = parseInt(($g('rWellCasingTotal') && $g('rWellCasingTotal').value) || '', 10);
        var casingDamaged = parseInt(($g('rWellCasingDamaged') && $g('rWellCasingDamaged').value) || '', 10);
        if (isNaN(total)) {
          AppUI.toast('请填写出水口总数', 'warn');
          return false;
        }
        if (isNaN(outletDamaged)) {
          AppUI.toast('请填写出水口损坏数量', 'warn');
          return false;
        }
        if (outletDamaged > total) {
          AppUI.toast('出水口损坏数量不能大于总数', 'warn');
          return false;
        }
        if (isNaN(casing)) {
          AppUI.toast('请填写护筒总数', 'warn');
          return false;
        }
        if (isNaN(casingDamaged)) {
          AppUI.toast('请填写护筒损坏数量', 'warn');
          return false;
        }
        if (casingDamaged > casing) {
          AppUI.toast('护筒损坏数量不能大于总数', 'warn');
          return false;
        }
        if (!wellFillPhotos.length) {
          AppUI.toast('请上传全景照片', 'warn');
          return false;
        }
        return true;
      }
      if (form.type === 'road') {
        if (parseNum(gid('rRoadLength')) == null) {
          AppUI.toast('请填写道路长度', 'warn');
          return false;
        }
        if (parseNum(gid('rRoadWidth')) == null) {
          AppUI.toast('请填写道路宽度', 'warn');
          return false;
        }
        if (parseNum(gid('rRoadThickness')) == null) {
          AppUI.toast('请填写道路厚度', 'warn');
          return false;
        }
        return true;
      }
      if (form.type === 'bridge') {
        if (!readRadioIn(fillBlocks.bridge, 'kind')) {
          AppUI.toast('请选择设施类型（桥/涵/闸）', 'warn');
          return false;
        }
        if (parseNum(gid('rBridgeLength')) == null) {
          AppUI.toast('请填写长度', 'warn');
          return false;
        }
        if (parseNum(gid('rBridgeWidth')) == null) {
          AppUI.toast('请填写宽度', 'warn');
          return false;
        }
        return true;
      }
      if (form.type === 'forest') {
        if (parseNum(gid('rForestHandover')) == null) {
          AppUI.toast('请填写移交株数', 'warn');
          return false;
        }
        if (parseNum(gid('rForestExisting')) == null) {
          AppUI.toast('请填写现有株数', 'warn');
          return false;
        }
        return true;
      }
      if (form.type === 'transformer') {
        if (parseNum(gid('rTfCapacity')) == null) {
          AppUI.toast('请填写容量', 'warn');
          return false;
        }
        if (!(($g('rTfModel') && $g('rTfModel').value) || '').trim()) {
          AppUI.toast('请填写型号', 'warn');
          return false;
        }
        if (!readRadioIn(fillBlocks.transformer, 'voltage')) {
          AppUI.toast('请选择电压等级', 'warn');
          return false;
        }
        return true;
      }
      return true;
    }

    function validateQuizFields() {
      var fields = activeQuizFields();
      var names = activeQuizNames();
      var i;
      for (i = 0; i < fields.length; i++) {
        var field = fields[i];
        var ans = readRadioIn(quizBlocks[form.type], field);
        if (!ans) {
          AppUI.toast('请选择' + (names[field] || '核查项'), 'warn');
          return false;
        }
        harvestQuizDesc(field);
        var slot = ensureQuizSlot(field);
        slot.answer = ans;

        if (field === 'waterOut' && ans === 'yes') {
          if (
            global.AppWellWaterPhotos &&
            !AppWellWaterPhotos.validateProof(slot.photos || [], slot.photoProof || {}).ok
          ) {
            AppUI.toast('出水题须至少上传 2 张取证照片', 'warn');
            return false;
          }
          if (!global.AppWellWaterPhotos && (!slot.photos || slot.photos.length < 2)) {
            AppUI.toast('出水题须至少上传 2 张取证照片', 'warn');
            return false;
          }
          continue;
        }

        if (quizAnswerIndicatesIssue(ans, field)) {
          if (!(slot.desc || '').trim()) {
            AppUI.toast('请填写问题描述', 'warn');
            return false;
          }
          if (!slot.photos || !slot.photos.length) {
            AppUI.toast('请上传现场照片', 'warn');
            return false;
          }
        } else if (quizStepRequiresPhoto(field, ans)) {
          if (!slot.photos || !slot.photos.length) {
            AppUI.toast('请上传现场照片', 'warn');
            return false;
          }
        }
      }
      return true;
    }

    function collectWellFields() {
      var total = parseInt(($g('rWellOutletTotal') && $g('rWellOutletTotal').value) || '', 10);
      var casing = parseInt(($g('rWellCasingTotal') && $g('rWellCasingTotal').value) || '', 10);
      var outletDamaged = parseInt(($g('rWellOutletDamaged') && $g('rWellOutletDamaged').value) || '', 10);
      var casingDamaged = parseInt(($g('rWellCasingDamaged') && $g('rWellCasingDamaged').value) || '', 10);
      var data = {
        buildKind: readRadioIn(fillBlocks.well, 'buildKind'),
        outletTotal: isNaN(total) ? null : total,
        outletDamaged: isNaN(outletDamaged) ? null : outletDamaged,
        casingTotal: isNaN(casing) ? null : casing,
        casingDamaged: isNaN(casingDamaged) ? null : casingDamaged,
        fillPhotos: wellFillPhotos.slice(),
        wellPlanDate: form.planDate || '',
        quizSteps: quizData,
      };
      WELL_QUIZ_FIELDS.forEach(function (key) {
        data[key] = quizData[key] ? quizData[key].answer : '';
      });
      return data;
    }

    function collectRoadFields() {
      var data = {
        length: parseNum(gid('rRoadLength')),
        width: parseNum(gid('rRoadWidth')),
        thickness: parseNum(gid('rRoadThickness')),
        planDate: form.planDate || '',
        quizSteps: quizData,
      };
      ROAD_QUIZ_FIELDS.forEach(function (key) {
        data[key] = quizData[key] ? quizData[key].answer : '';
      });
      return data;
    }

    function collectBridgeFields() {
      return {
        kind: readRadioIn(fillBlocks.bridge, 'kind'),
        length: parseNum(gid('rBridgeLength')),
        width: parseNum(gid('rBridgeWidth')),
        planDate: form.planDate || '',
        quizSteps: quizData,
        needsRectify: quizData.needsRectify ? quizData.needsRectify.answer : '',
      };
    }

    function collectForestFields() {
      var data = {
        handoverCount: parseNum(gid('rForestHandover')),
        existingCount: parseNum(gid('rForestExisting')),
        planDate: form.planDate || '',
        quizSteps: quizData,
      };
      FOREST_QUIZ_FIELDS.forEach(function (key) {
        data[key] = quizData[key] ? quizData[key].answer : '';
      });
      return data;
    }

    function collectTransformerFields() {
      var data = {
        capacity: parseNum(gid('rTfCapacity')),
        model: (($g('rTfModel') && $g('rTfModel').value) || '').trim(),
        voltage: readRadioIn(fillBlocks.transformer, 'voltage'),
        planDate: form.planDate || '',
        quizSteps: quizData,
      };
      TRANSFORMER_QUIZ_FIELDS.forEach(function (key) {
        data[key] = quizData[key] ? quizData[key].answer : '';
      });
      return data;
    }

    function destroySignaturePad() {
      if (signaturePad) {
        signaturePad.destroy();
        signaturePad = null;
      }
    }

    function initSignaturePad() {
      destroySignaturePad();
      var canvas = $g('rSignCanvas');
      if (!canvas || !global.AppMpSignature) {
        if (global.AppLog) AppLog.warn(logScope, 'AppMpSignature 未加载');
        return;
      }
      signaturePad = AppMpSignature.attach({ canvas: canvas });
      if (signatureData && signaturePad.load) {
        signaturePad.load(signatureData);
      }
    }

    function syncRegionFromPicker() {
      var r = getRegionFn() || {};
      form.street = r.street || '';
      form.village = r.village || '';
      form.naturalVillage = r.naturalVillage || '';
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
      var Loop = global.HSFPickerDateLoop;
      if (!Loop) {
        if (global.AppUI) AppUI.toast('日期组件未加载', 'error');
        return;
      }
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
        Loop.colHtmlLoop(months) +
        '</div>' +
        '<div class="m-picker__col" id="mReportPickerDay" aria-label="日">' +
        Loop.colHtmlLoop(days) +
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
      Loop.scrollLoopCol(monthCol, monthIndex, 12, ITEM_H);
      Loop.scrollLoopCol(dayCol, dayIndex, days.length, ITEM_H);
      markActiveItem(yearCol, yearIndex);
      Loop.markActiveLoop(monthCol, monthIndex, 12);
      Loop.markActiveLoop(dayCol, dayIndex, days.length);

      function syncYearCol() {
        yearCol.scrollTop = cascade.yearIndex * ITEM_H;
        markActiveItem(yearCol, cascade.yearIndex);
      }

      function bumpYear(delta) {
        var next = cascade.yearIndex + delta;
        if (next < 0 || next >= cascade.years.length) return false;
        cascade.yearIndex = next;
        syncYearCol();
        return true;
      }

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
        dayCol.innerHTML = Loop.colHtmlLoop(nextDays);
        Loop.scrollLoopCol(dayCol, cascade.dayIndex, max, ITEM_H);
        Loop.markActiveLoop(dayCol, cascade.dayIndex, max);
      }

      function advanceMonth(delta) {
        var prevM = cascade.monthIndex;
        var newM = (prevM + delta + 12) % 12;
        if (delta > 0 && prevM === 11) bumpYear(1);
        else if (delta < 0 && prevM === 0) bumpYear(-1);
        cascade.monthIndex = newM;
        Loop.scrollLoopCol(monthCol, cascade.monthIndex, 12, ITEM_H);
        Loop.markActiveLoop(monthCol, cascade.monthIndex, 12);
        refreshDays();
      }

      bindColScroll(yearCol, function () {
        cascade.yearIndex = snapCol(yearCol, cascade.years.length - 1);
        markActiveItem(yearCol, cascade.yearIndex);
        refreshDays();
      });
      bindColScroll(monthCol, function () {
        var prevM = cascade.monthIndex;
        cascade.monthIndex = Loop.snapLoopCol(monthCol, 12, ITEM_H);
        if (prevM === 11 && cascade.monthIndex === 0) bumpYear(1);
        else if (prevM === 0 && cascade.monthIndex === 11) bumpYear(-1);
        Loop.markActiveLoop(monthCol, cascade.monthIndex, 12);
        refreshDays();
      });
      bindColScroll(dayCol, function () {
        var max = cascade.days.length;
        if (max < 1) return;
        var prevD = cascade.dayIndex;
        cascade.dayIndex = Loop.snapLoopCol(dayCol, max, ITEM_H);
        if (max > 1 && prevD === max - 1 && cascade.dayIndex === 0) {
          advanceMonth(1);
          cascade.dayIndex = 0;
          Loop.scrollLoopCol(dayCol, 0, cascade.days.length, ITEM_H);
        } else if (max > 1 && prevD === 0 && cascade.dayIndex === max - 1) {
          advanceMonth(-1);
          cascade.dayIndex = cascade.days.length - 1;
          Loop.scrollLoopCol(dayCol, cascade.dayIndex, cascade.days.length, ITEM_H);
        }
        Loop.markActiveLoop(dayCol, cascade.dayIndex, cascade.days.length);
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
      if (key === 'planDate') openDateCascade();
    }

    function applyQuizStepsToUi(steps) {
      steps = steps || {};
      quizData = {};
      Object.keys(steps).forEach(function (key) {
        var src = steps[key] || {};
        quizData[key] = {
          answer: src.answer || '',
          desc: src.desc || '',
          photos: src.photos ? src.photos.slice() : [],
        };
        if (src.photoProof) {
          quizData[key].photoProof = {
            firstCapturedAt: src.photoProof.firstCapturedAt || null,
            lastCapturedAt: src.photoProof.lastCapturedAt || null,
          };
        }
      });
      var block = quizBlocks[form.type];
      if (!block) return;
      activeQuizFields().forEach(function (field) {
        var slot = quizData[field];
        if (slot && slot.answer) setRadioIn(block, field, slot.answer);
      });
      syncAllQuizExtras();
      activeQuizFields().forEach(function (field) {
        var item = quizItemEl(field);
        var slot = quizData[field];
        if (!item || !slot) return;
        var descEl = item.querySelector('.rf-quiz-desc');
        if (descEl) descEl.value = slot.desc || '';
      });
    }

    function reconstructQuizFromFlat(bag, fields) {
      var steps = {};
      (fields || []).forEach(function (key) {
        if (bag[key]) {
          steps[key] = { answer: bag[key], desc: '', photos: [] };
        }
      });
      return steps;
    }

    function validateAndCollect(session) {
      session = session || {};
      syncRegionFromPicker();
      harvestAllQuiz();

      if (!form.street || !form.village) {
        global.AppUI.toast('请选择行政区划', 'error');
        return null;
      }
      if (!form.projectYear) {
        global.AppUI.toast('请选择项目年度', 'error');
        return null;
      }
      var code = ($g('rCode') && $g('rCode').value || '').trim();
      if (!code) {
        global.AppUI.toast('请填写设施编号', 'error');
        return null;
      }
      if (
        global.AppProjectCode &&
        typeof AppProjectCode.isTaken === 'function' &&
        AppProjectCode.isTaken(code, editingId)
      ) {
        global.AppUI.toast('设施编号已存在，请更换', 'error');
        return null;
      }
      if (!wizardNeedsRectify()) {
        form.planDate = '';
      } else if (!form.planDate) {
        global.AppUI.toast('请选择整改计划日期', 'error');
        return null;
      }
      var address = ($g('rAddress') && $g('rAddress').value || '').trim();
      if (!address) {
        global.AppUI.toast('请填写现场地址', 'error');
        return null;
      }
      if (!validateFillFields()) return null;
      if (!validateQuizFields()) return null;

      if (signaturePad && !signaturePad.isEmpty()) {
        signatureData = signaturePad.toDataURL();
      }
      if (!signatureData) {
        global.AppUI.toast('请完成电子签名', 'warn');
        return null;
      }

      var mergedPhotos = mergeAllPhotos();
      var projectName = form.projectYear + ' 高标农田建设项目';
      var photoAt = new Date().toISOString();
      var reporterName = ($g('rReporterName') && $g('rReporterName').value || '').trim();
      var reporterPhone = ($g('rReporterPhone') && $g('rReporterPhone').value || '').trim();
      var sessionName = (session.name || '').trim();
      var region = {
        street: form.street,
        village: form.village,
        naturalVillage: form.naturalVillage || '',
      };

      var payload = {
        type: form.type,
        street: form.street,
        village: form.village,
        naturalVillage: form.naturalVillage || '',
        projectYear: form.projectYear,
        projectName: projectName,
        code: code,
        description: mergeQuizDescription(),
        locationText: address,
        address: address,
        lat: 0,
        lng: 0,
        photoSrc: mergedPhotos[0] || '',
        photos: mergedPhotos.slice(),
        photoAt: photoAt,
        inspectionDate:
          global.AppData && typeof AppData.toDateKey === 'function'
            ? AppData.toDateKey(photoAt)
            : photoAt.slice(0, 10),
        reporterId: reporterName && reporterName === sessionName ? session.staffId || '' : '',
        reporterName: reporterName,
        reporterPhone: reporterPhone,
        reporterSignature: signatureData,
        assigneeId: '',
        assigneeName: '',
        assigneePhone: '',
        measures: '',
        planDate: form.planDate,
      };

      if (form.type === 'well') {
        payload.well = collectWellFields();
      } else if (form.type === 'road') {
        var roadExtra = collectRoadFields();
        payload.road = roadExtra;
        payload.length = String(roadExtra.length);
        payload.width = String(roadExtra.width);
        payload.thickness = String(roadExtra.thickness);
        payload.hasShoulder = roadExtra.hasShoulder === 'yes' ? '是' : '否';
        payload.hasAsh = roadExtra.hasAsh === 'yes' ? '是' : '否';
        payload.hasRoadDamage = roadExtra.hasRoadDamage === 'yes' ? '是' : '否';
      } else if (form.type === 'bridge') {
        var bridgeExtra = collectBridgeFields();
        payload.bridge = bridgeExtra;
        payload.bridgeKind = bridgeExtra.kind;
        payload.bridgeKindLabel = BRIDGE_KIND_LABEL[bridgeExtra.kind] || '';
        payload.length = String(bridgeExtra.length);
        payload.width = String(bridgeExtra.width);
      } else if (form.type === 'forest') {
        payload.forest = collectForestFields();
      } else if (form.type === 'transformer') {
        payload.transformer = collectTransformerFields();
      }

      if (global.AppWellSubmitRules && typeof AppWellSubmitRules.applyWizardSubmit === 'function') {
        AppWellSubmitRules.applyWizardSubmit(payload, quizData, region, form.type);
      } else {
        payload.status = 'pending';
      }

      return payload;
    }

    function reset() {
      closePicker(false);
      editingId = null;
      form.type = 'well';
      form.street = '';
      form.village = '';
      form.naturalVillage = '';
      form.planDate = '';
      form.projectYear = '';
      signatureData = '';
      wellFillPhotos = [];
      destroyWellFillPhotos();
      resetQuizState();
      var f = $g('form');
      if (f) f.reset();
      fillReporterFromSession();
      suggestCodeIfNeeded();
      renderTypeSeg();
      syncYearButtons();
      syncTypeBlocks();
      syncMeta();
      initSignaturePad();
    }

    function fill(item) {
      item = item || {};
      closePicker(false);
      editingId = item.id || null;
      form.type = item.type || 'well';
      form.street = item.street || '';
      form.village = item.village || '';
      form.naturalVillage = item.naturalVillage || '';
      form.planDate = item.planDate || '';
      form.projectYear = item.projectYear ? String(item.projectYear) : '';
      if (!form.projectYear && item.projectName) {
        var ym = String(item.projectName).match(/^(\d{4})\s/);
        if (ym) form.projectYear = ym[1];
      }
      signatureData = item.reporterSignature || '';

      var f = $g('form');
      if (f) f.reset();

      if ($g('rCode')) $g('rCode').value = item.code || '';
      if ($g('rReporterName')) $g('rReporterName').value = item.reporterName || '';
      if ($g('rReporterPhone')) $g('rReporterPhone').value = item.reporterPhone || '';
      if ($g('rAddress')) $g('rAddress').value = item.address || item.locationText || '';

      renderTypeSeg();
      syncYearButtons();
      syncTypeBlocks();
      syncMeta();

      var w = item.well;
      if (w && fillBlocks.well) {
        setRadioIn(fillBlocks.well, 'buildKind', w.buildKind);
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
        wellFillPhotos = resolveWellFillPhotos(item);
      }
      var rd = item.road;
      if (rd && fillBlocks.road) {
        if ($g('rRoadLength')) $g('rRoadLength').value = rd.length != null ? rd.length : item.length || '';
        if ($g('rRoadWidth')) $g('rRoadWidth').value = rd.width != null ? rd.width : item.width || '';
        if ($g('rRoadThickness')) {
          $g('rRoadThickness').value = rd.thickness != null ? rd.thickness : item.thickness || '';
        }
      }
      var br = item.bridge;
      if (br && fillBlocks.bridge) {
        setRadioIn(fillBlocks.bridge, 'kind', br.kind || item.bridgeKind);
        if ($g('rBridgeLength')) $g('rBridgeLength').value = br.length != null ? br.length : item.length || '';
        if ($g('rBridgeWidth')) $g('rBridgeWidth').value = br.width != null ? br.width : item.width || '';
      }
      var fo = item.forest;
      if (fo && fillBlocks.forest) {
        if ($g('rForestHandover')) $g('rForestHandover').value = fo.handoverCount != null ? fo.handoverCount : '';
        if ($g('rForestExisting')) $g('rForestExisting').value = fo.existingCount != null ? fo.existingCount : '';
      }
      var tf = item.transformer;
      if (tf && fillBlocks.transformer) {
        if ($g('rTfCapacity')) $g('rTfCapacity').value = tf.capacity != null ? tf.capacity : '';
        if ($g('rTfModel')) $g('rTfModel').value = tf.model || '';
        setRadioIn(fillBlocks.transformer, 'voltage', tf.voltage);
      }

      var bag =
        form.type === 'well'
          ? w
          : form.type === 'road'
            ? rd
            : form.type === 'bridge'
              ? br
              : form.type === 'forest'
                ? fo
                : tf;
      var steps = (bag && bag.quizSteps) || null;
      if (!steps && bag) {
        steps = reconstructQuizFromFlat(bag, activeQuizFields());
      }
      applyQuizStepsToUi(steps || {});
      attachWellFillPhotos();
      syncQuizPlanDateRow();
      syncMeta();
      initSignaturePad();
    }

    function destroy() {
      closePicker(false);
      destroyAllQuizStrips();
      destroyWellFillPhotos();
      destroySignaturePad();
      if (datePicker && typeof datePicker.destroy === 'function') {
        datePicker.destroy();
      }
      datePicker = null;
    }

    function init() {
      typeCtrlEl = $g('v86-controller');
      yearGroupEl = $g('rProjectYear');
      Object.keys(FILL_BLOCK_IDS).forEach(function (key) {
        fillBlocks[key] = $g(FILL_BLOCK_IDS[key]);
        quizBlocks[key] = $g(QUIZ_BLOCK_IDS[key]);
      });
      ensureDatePicker();
      syncMeta();
      renderTypeSeg();
      syncYearButtons();
      syncTypeBlocks();
      initSignaturePad();

      if (bound) return;
      bound = true;

      if (typeCtrlEl) {
        typeCtrlEl.addEventListener('click', function (e) {
          var item = e.target.closest('.seg-item');
          if (!item || !typeCtrlEl.contains(item)) return;
          var next = item.getAttribute('data-type');
          if (!next || next === form.type) return;
          form.type = next;
          wellFillPhotos = [];
          destroyWellFillPhotos();
          resetQuizState();
          renderTypeSeg();
          syncTypeBlocks();
          suggestCodeIfNeeded();
        });
      }

      if (yearGroupEl) {
        yearGroupEl.addEventListener('click', function (e) {
          var btn = e.target.closest('.m-year-btn');
          if (!btn || !yearGroupEl.contains(btn)) return;
          var y = btn.getAttribute('data-year');
          if (!y || y === form.projectYear) return;
          form.projectYear = y;
          syncYearButtons();
        });
      }

      var clearBtn = $g('btnSignClear');
      if (clearBtn) {
        clearBtn.addEventListener('click', function () {
          if (signaturePad) signaturePad.clear();
          signatureData = '';
        });
      }

      var quizHost = document.getElementById('rf-quiz-fields');
      if (quizHost) {
        quizHost.addEventListener('change', function (e) {
          var input = e.target;
          if (!input || input.type !== 'radio') return;
          var item = input.closest('.rf-quiz-item');
          if (!item) return;
          var field = item.getAttribute('data-quiz-field');
          if (!field) return;
          harvestQuizDesc(field);
          syncQuizExtra(field);
        });
        quizHost.addEventListener('input', function (e) {
          var ta = e.target;
          if (!ta || !ta.classList.contains('rf-quiz-desc')) return;
          var item = ta.closest('.rf-quiz-item');
          if (!item) return;
          var field = item.getAttribute('data-quiz-field');
          if (!field) return;
          ensureQuizSlot(field).desc = (ta.value || '').trim();
        });
      }

      if (global.AppIcons) {
        global.AppIcons.injectAll(document.getElementById('rf-form-overlay') || document);
      }
    }

    return {
      init: init,
      reset: reset,
      fill: fill,
      validateAndCollect: validateAndCollect,
      destroy: destroy,
      syncTypeBlocks: syncTypeBlocks,
    };
  }

  global.HSFReportFormEngine = { create: create };
})(window);
