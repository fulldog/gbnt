/**
 * 问题上报 · 现场优先
 * 无框描述 + 多图横滑 + 摘要行；类型分段 + 区划滚筒；整改责任人/联系电话手输
 * 设施编号规则见 frontend/js/project-code.js
 */
(function () {
  var session = AppStorage.get('session', null);
  if (!session) {
    if (window.HSFNav) HSFNav.go('./login.html');
    else location.href = './login.html';
    return;
  }
  AppIcons.injectAll(document);
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
    naturalVillage: '',
    projectYear: '',
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
  var yearGroupEl = document.getElementById('rProjectYear');
  var codeInputEl = document.getElementById('rCode');
  var facilityKindRow = document.getElementById('rFacilityKindRow');
  var nextBtnEl = document.getElementById('btnReportNext');
  var prevBtnEl = document.getElementById('btnReportPrev');
  var reportFootEl = document.getElementById('rReportFoot');
  var wellProgressFillEl = document.getElementById('rWellProgressFill');
  var wellBlock = document.getElementById('rWellBlock');
  var roadBlock = document.getElementById('rRoadBlock');
  var bridgeFillExtra = document.getElementById('rBridgeFillExtra');
  var forestFillExtra = document.getElementById('rForestFillExtra');
  var transformerFillExtra = document.getElementById('rTransformerFillExtra');
  var bridgeKindRow = document.getElementById('rBridgeKindRow');
  var bridgeBlock = document.getElementById('rBridgeBlock');
  var forestBlock = document.getElementById('rForestBlock');
  var transformerBlock = document.getElementById('rTransformerBlock');
  var regionLabel = document.getElementById('rRegionLabel');
  var locText = document.getElementById('rLocText');
  var legacyLocText = document.getElementById('rLegacyLocText');
  var reportPageEl = document.querySelector('.m-page.m-report');
  var reportFormEl = document.getElementById('reportForm');
  var wellFillPanel = document.getElementById('rWellFillPanel');
  var wellFillExtra = document.getElementById('rWellFillExtra');
  var roadFillExtra = document.getElementById('rRoadFillExtra');
  var wizardFillTail = document.getElementById('rWizardFillTail');
  var wellQuizPanel = document.getElementById('rWellQuizPanel');
  var wellWizardHead = document.getElementById('rWellWizardHead');
  var wellSignPanel = document.getElementById('rWellSignPanel');
  var wellSignCanvas = document.getElementById('rWellSignCanvas');
  var wellSignClearBtn = document.getElementById('btnWellSignClear');
  var legacyFlow = document.getElementById('rLegacyFlow');
  var wellQuizTitleEl = document.getElementById('rWellQuizTitle');
  var wellQuizYnHost = document.getElementById('rWellQuizYnHost');
  var wellStepDescEl = document.getElementById('rWellStepDesc');
  var wellStepPhotosEl = document.getElementById('rWellStepPhotos');
  var wellFillPhotosEl = document.getElementById('rWellFillPhotos');
  var typesEl = document.querySelector('.m-report__types');

  /** 机井分页向导：填写页 → 单选题×6 → 电子签名（排查必签，与最终状态无关）→ 提交 */
  var WELL_QUIZ_FIELDS = ['waterOut', 'pipeOk', 'wiringOk', 'boxOk', 'coverOk'];
  var WELL_QUIZ_HINTS = { waterOut: '(≥1分钟)' };
  /** 道路分页向导：填写页 → 路肩 / 灰土层 / 是否有道路损坏 → 电子签名 → 提交 */
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
  /** 桥涵闸：无台账核查项，填完后单独问「是否有淤堵与损坏」 */
  var BRIDGE_QUIZ_FIELDS = ['needsRectify'];
  var BRIDGE_QUIZ_NAMES = {
    needsRectify: '是否有淤堵与损坏',
  };
  /**
   * 选项页「须描述+照片」判定（全类型统一）
   * - 正向题（是=正常）：选「否」→ 必填描述 + 至少 1 张照片
   * - 反向题（是=有问题）：选「是」→ 必填描述 + 至少 1 张照片
   *   林网：断带 / 枯死木 / 病虫害
   *   变压器：私拉乱接
   *   桥涵闸：是否有淤堵与损坏（选「是」须描述+照片）
   * 机井「出水=是」另走 AppWellWaterPhotos，不在此列
   */
  var NEGATIVE_QUIZ_FIELDS = {
    road: ['hasRoadDamage'],
    bridge: ['needsRectify'],
    forest: ['brokenBelt', 'deadTrees', 'pest'],
    transformer: ['illegalWire'],
  };
  var WIZARD_TYPE_LABELS = {
    well: '机井',
    road: '道路',
    bridge: '桥涵闸',
    forest: '林网',
    transformer: '变压器',
  };
  var WELL_SIGNATURE_STEP = 1 + WELL_QUIZ_FIELDS.length + 0; /* wellStep：填完题后进签名 */
  var WELL_TOTAL_STEPS = 1 + WELL_QUIZ_FIELDS.length + 1;
  var wellStep = 0;
  var wellQuizData = {};
  var wellSignatureData = '';
  var signaturePad = null;
  var stepPhotos = [];
  var stepPhotoProof = null;
  var stepPhotoStrip = null;
  var wellFillPhotos = [];
  var wellFillPhotoStrip = null;

  var WELL_YN_FIELDS = [
    'buildKind',
    'waterOut',
    'pipeOk',
    'wiringOk',
    'boxOk',
    'coverOk',
  ];
  var WELL_YN_NAMES = {
    buildKind: '设施类型',
    waterOut: '机井是否出水',
    pipeOk: '管道是否按要求连接',
    wiringOk: '走线是否规范',
    boxOk: '配电箱及电表等设施是否完好',
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
    if (window.HSFRegion2023 && typeof window.HSFRegion2023.buildTree === 'function') {
      return window.HSFRegion2023.buildTree();
    }
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
          children.push({
            value: child.name,
            label: child.name,
            children: [],
          });
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

  function villageNaturals(villageOpt) {
    return (villageOpt && villageOpt.children) || [];
  }

  function needsNaturalLevel(villageOpt) {
    return villageNaturals(villageOpt).length > 0;
  }

  function findVillageOption(street, village) {
    if (!street || !village) return null;
    if (!regionTree.length) regionTree = buildRegionTree();
    for (var i = 0; i < regionTree.length; i++) {
      if (regionTree[i].value !== street) continue;
      var villages = regionTree[i].children || [];
      for (var j = 0; j < villages.length; j++) {
        if (villages[j].value === village) return villages[j];
      }
    }
    return null;
  }

  function regionSelectionComplete() {
    if (!form.street || !form.village) return false;
    var villageOpt = findVillageOption(form.street, form.village);
    if (needsNaturalLevel(villageOpt)) return !!form.naturalVillage;
    return true;
  }

  function regionDisplayText() {
    var parts = [form.street, form.village];
    if (form.naturalVillage) parts.push(form.naturalVillage);
    return parts.join(' · ');
  }

  function syncMeta() {
    var hasRegion = regionSelectionComplete();
    regionLabel.textContent = hasRegion ? regionDisplayText() : '请选择';
    regionLabel.classList.toggle('is-placeholder', !hasRegion);
    var planLabel = planDateLabelEl();
    if (planLabel) {
      planLabel.textContent = form.planDate ? formatPlanDateDisplay(form.planDate) : '请选择';
      planLabel.classList.toggle('is-placeholder', !form.planDate);
    }
    syncNextBtn();
  }

  function wellProgressPercent() {
    if (wellStep <= 0) return 0;
    return Math.min(100, Math.round(((wellStep + 1) / totalWizardSteps()) * 100));
  }

  function syncWellProgress() {
    if (!wellProgressFillEl) return;
    var pct = wellProgressPercent();
    wellProgressFillEl.style.width = pct + '%';
  }

  function syncWellStepDescPlaceholder() {
    if (!wellStepDescEl) return;
    var ans = readQuizAnswer();
    var field = currentWellQuizField();
    if (!ans) {
      wellStepDescEl.placeholder = '请先选择是或否';
      return;
    }
    if (quizAnswerIndicatesIssue(ans, field)) {
      wellStepDescEl.placeholder = '请输入问题描述(必填)';
      return;
    }
    wellStepDescEl.placeholder = '请输入备注(选填)';
  }

  function canProceedQuizStep() {
    var ans = readQuizAnswer();
    if (!ans) return false;
    if (isWaterOutProofStep()) {
      if (!window.AppWellWaterPhotos) return stepPhotos.length >= 2;
      if (stepPhotos.length < AppWellWaterPhotos.MIN_PHOTOS) return false;
      if (
        stepPhotos.length === 1 &&
        stepPhotoProof &&
        !AppWellWaterPhotos.canTakeNextPhoto(stepPhotoProof.firstCapturedAt)
      ) {
        return false;
      }
      if (isLastWellQuizStep() && wizardNeedsRectify() && !form.planDate) return false;
      return true;
    }
    if (quizAnswerIndicatesIssue(ans, currentWellQuizField())) {
      if (!(wellStepDescEl && (wellStepDescEl.value || '').trim())) return false;
      if (!stepPhotos.length) return false;
    } else if (quizStepRequiresPhoto(currentWellQuizField(), ans)) {
      if (!stepPhotos.length) return false;
    }
    if (isLastWellQuizStep() && wizardNeedsRectify() && !form.planDate) return false;
    return true;
  }

  function isNegativeQuizField(field) {
    var list = NEGATIVE_QUIZ_FIELDS[form.type] || [];
    return list.indexOf(field) !== -1;
  }

  function quizStepRequiresPhoto(field, ans) {
    if (window.AppWellSubmitRules && typeof AppWellSubmitRules.quizStepRequiresPhoto === 'function') {
      return AppWellSubmitRules.quizStepRequiresPhoto(field, ans);
    }
    if (!field || !ans) return false;
    if (field === 'wiringOk') return false;
    if (field === 'waterOut' && ans === 'yes') return false;
    return true;
  }

  /** 当前答案是否表示「存在问题」，须在本页填写描述并上传照片 */
  function quizAnswerIndicatesIssue(ans, field) {
    if (window.AppWellSubmitRules && typeof AppWellSubmitRules.quizAnswerIndicatesIssue === 'function') {
      return AppWellSubmitRules.quizAnswerIndicatesIssue(ans, field, form.type);
    }
    if (!ans || !field) return false;
    if (field === 'hasShoulder' || field === 'hasAsh') return false;
    if (isNegativeQuizField(field)) return ans === 'yes';
    return ans === 'no';
  }

  function liveAnswerForField(field) {
    if (field && field === currentWellQuizField()) {
      return readQuizAnswer() || ((wellQuizData[field] && wellQuizData[field].answer) || '');
    }
    return (wellQuizData[field] && wellQuizData[field].answer) || '';
  }

  /** 任一项表明有问题 → 须在末题展示并填写整改计划日期 */
  function wizardNeedsRectify() {
    var fields = activeQuizFields();
    var i;
    for (i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (quizAnswerIndicatesIssue(liveAnswerForField(f), f)) return true;
    }
    return false;
  }

  function syncQuizPlanDateRow() {
    var planRow = document.getElementById('rWellPlanDateRow');
    if (!planRow) return;
    var show =
      isTypeWizard() &&
      wellStep >= 1 &&
      wellStep <= activeQuizFields().length &&
      isLastWellQuizStep() &&
      wizardNeedsRectify();
    if (show) {
      planRow.removeAttribute('hidden');
    } else {
      planRow.setAttribute('hidden', '');
      if (isLastWellQuizStep() && !wizardNeedsRectify()) {
        form.planDate = '';
        var planLabel = planDateLabelEl();
        if (planLabel) {
          planLabel.textContent = '请选择';
          planLabel.classList.add('is-placeholder');
        }
      }
    }
  }

  function validateQuizStepBeforeNext(showToast) {
    var ans = readQuizAnswer();
    var field = currentWellQuizField();
    if (!ans) {
      if (showToast) AppUI.toast('请选择是或否', 'warn');
      return false;
    }
    if (isWaterOutProofStep()) {
      if (!validateWaterOutProof(showToast)) return false;
    } else if (quizAnswerIndicatesIssue(ans, field)) {
      var stepDesc = wellStepDescEl ? (wellStepDescEl.value || '').trim() : '';
      if (!stepDesc) {
        if (showToast) AppUI.toast('请填写问题描述', 'warn');
        return false;
      }
      if (!stepPhotos.length) {
        if (showToast) AppUI.toast('请上传现场照片', 'warn');
        return false;
      }
    } else if (quizStepRequiresPhoto(field, ans)) {
      if (!stepPhotos.length) {
        if (showToast) AppUI.toast('请上传现场照片', 'warn');
        return false;
      }
    }
    if (isLastWellQuizStep() && wizardNeedsRectify() && !form.planDate) {
      if (showToast) AppUI.toast('请选择整改计划日期', 'error');
      return false;
    }
    if (isLastWellQuizStep() && !wizardNeedsRectify()) {
      form.planDate = '';
    }
    return true;
  }

  function validateWaterOutProof(showToast) {
    if (!window.AppWellWaterPhotos) return true;
    var slot = wellQuizData.waterOut;
    var proof = (slot && slot.photoProof) || stepPhotoProof || {};
    var photos = stepPhotos.length ? stepPhotos : slot && slot.photos ? slot.photos : [];
    var v = AppWellWaterPhotos.validateProof(photos, proof);
    if (!v.ok && showToast) AppUI.toast(v.message, 'warn');
    return v.ok;
  }

  function syncReportFoot() {
    var showPrev = isTypeWizard() && wellStep > 0;
    if (prevBtnEl) {
      if (showPrev) prevBtnEl.removeAttribute('hidden');
      else prevBtnEl.setAttribute('hidden', '');
    }
    if (reportFootEl) {
      reportFootEl.classList.toggle('m-report__foot--dual', showPrev);
    }
  }

  function isWellWizard() {
    return form.type === 'well';
  }

  function isRoadWizard() {
    return form.type === 'road';
  }

  function isBridgeWizard() {
    return form.type === 'bridge';
  }

  function isForestWizard() {
    return form.type === 'forest';
  }

  function isTransformerWizard() {
    return form.type === 'transformer';
  }

  function isTypeWizard() {
    return !!WIZARD_TYPE_LABELS[form.type];
  }

  function activeQuizFields() {
    if (isWellWizard()) return WELL_QUIZ_FIELDS;
    if (isRoadWizard()) return ROAD_QUIZ_FIELDS;
    if (isBridgeWizard()) return BRIDGE_QUIZ_FIELDS;
    if (isForestWizard()) return FOREST_QUIZ_FIELDS;
    if (isTransformerWizard()) return TRANSFORMER_QUIZ_FIELDS;
    return [];
  }

  function activeQuizNames() {
    if (isWellWizard()) return WELL_YN_NAMES;
    if (isRoadWizard()) return ROAD_QUIZ_NAMES;
    if (isBridgeWizard()) return BRIDGE_QUIZ_NAMES;
    if (isForestWizard()) return FOREST_QUIZ_NAMES;
    if (isTransformerWizard()) return TRANSFORMER_QUIZ_NAMES;
    return {};
  }

  function activeQuizHints() {
    if (isWellWizard()) return WELL_QUIZ_HINTS;
    return {};
  }

  function totalWizardSteps() {
    return 1 + activeQuizFields().length + 1;
  }

  function signatureStepIndex() {
    return activeQuizFields().length + 1;
  }

  function isWellSignatureStep() {
    return isTypeWizard() && wellStep === signatureStepIndex();
  }

  function isLastWellQuizStep() {
    return wellStep === activeQuizFields().length;
  }

  function currentWellQuizField() {
    if (wellStep <= 0 || wellStep > activeQuizFields().length) return '';
    return activeQuizFields()[wellStep - 1];
  }

  function defaultWizardDescription() {
    return (WIZARD_TYPE_LABELS[form.type] || '巡查') + '巡查上报';
  }

  function planDateLabelEl() {
    return isTypeWizard()
      ? document.getElementById('rWellPlanDateLabel')
      : document.getElementById('rLegacyPlanDateLabel');
  }

  function syncWellWizardLayout() {
    var wizard = isTypeWizard();
    var inQuiz = wizard && wellStep >= 1 && wellStep <= activeQuizFields().length;
    var inSign = wizard && isWellSignatureStep();
    if (reportPageEl) {
      reportPageEl.classList.toggle('is-well-mode', isWellWizard());
      reportPageEl.classList.toggle('is-wizard-mode', wizard);
      reportPageEl.classList.toggle('is-well-quiz', inQuiz);
      reportPageEl.classList.toggle('is-well-sign', inSign);
    }
    if (wellFillExtra) wellFillExtra.hidden = !isWellWizard();
    if (roadFillExtra) roadFillExtra.hidden = !isRoadWizard();
    if (bridgeFillExtra) bridgeFillExtra.hidden = !isBridgeWizard();
    if (forestFillExtra) forestFillExtra.hidden = !isForestWizard();
    if (transformerFillExtra) transformerFillExtra.hidden = !isTransformerWizard();
    if (wizardFillTail) wizardFillTail.hidden = !wizard;
    if (legacyFlow) {
      if (wizard) legacyFlow.setAttribute('hidden', '');
      else legacyFlow.removeAttribute('hidden');
    }
    if (wellWizardHead) {
      if (wizard && wellStep > 0) wellWizardHead.removeAttribute('hidden');
      else wellWizardHead.setAttribute('hidden', '');
    }
    if (wellQuizPanel) {
      if (inQuiz) wellQuizPanel.removeAttribute('hidden');
      else wellQuizPanel.setAttribute('hidden', '');
    }
    if (wellSignPanel) {
      if (inSign) wellSignPanel.removeAttribute('hidden');
      else wellSignPanel.setAttribute('hidden', '');
    }
    if (wellFillPanel) {
      if (wizard && wellStep > 0) wellFillPanel.setAttribute('hidden', '');
      else wellFillPanel.removeAttribute('hidden');
    }
    if (typesEl) {
      if (wizard && wellStep > 0) typesEl.setAttribute('hidden', '');
      else typesEl.removeAttribute('hidden');
    }
    syncNextBtn();
    syncReportFoot();
    syncWellProgress();
    if (isWellWizard() && wellStep === 0) {
      attachWellFillPhotos();
    } else {
      destroyWellFillPhotos();
    }
  }

  function destroyWellFillPhotos() {
    if (wellFillPhotoStrip) {
      wellFillPhotoStrip.destroy();
      wellFillPhotoStrip = null;
    }
  }

  function attachWellFillPhotos() {
    destroyWellFillPhotos();
    if (!wellFillPhotosEl || !window.AppMpPhotos || !isWellWizard()) return;
    wellFillPhotoStrip = AppMpPhotos.attach({
      el: wellFillPhotosEl,
      photos: wellFillPhotos,
      max: MAX_PHOTOS,
      logScope: 'm-report',
      previewMeta: previewMeta,
      onChange: syncNextBtn,
    });
  }

  function destroySignaturePad() {
    if (signaturePad) {
      signaturePad.destroy();
      signaturePad = null;
    }
  }

  function initWellSignatureStep() {
    destroySignaturePad();
    if (!wellSignCanvas || !window.AppMpSignature) {
      if (window.AppLog) AppLog.warn('m-report', 'AppMpSignature 未加载');
      return;
    }
    signaturePad = AppMpSignature.attach({
      canvas: wellSignCanvas,
      onChange: function () {
        syncNextBtn();
      },
    });
    if (wellSignatureData && signaturePad.load) {
      signaturePad.load(wellSignatureData);
    }
    if (wellSignClearBtn && !wellSignClearBtn._hsfBound) {
      wellSignClearBtn._hsfBound = true;
      wellSignClearBtn.addEventListener('click', function () {
        if (signaturePad) signaturePad.clear();
        wellSignatureData = '';
        syncNextBtn();
      });
    }
    syncNextBtn();
  }

  function validateWellFillNums() {
    var total = parseInt(document.getElementById('rWellOutletTotal').value, 10);
    var outletDamaged = parseInt(document.getElementById('rWellOutletDamaged').value, 10);
    var casing = parseInt(document.getElementById('rWellCasingTotal').value, 10);
    var casingDamaged = parseInt(document.getElementById('rWellCasingDamaged').value, 10);
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
    return true;
  }

  function canProceedWellFill() {
    if (!canProceedStep1()) return false;
    if (!wellFillPhotos.length) return false;
    return true;
  }

  function validateWellFillStep() {
    if (!regionSelectionComplete()) {
      AppUI.toast('请选择行政区划', 'error');
      return false;
    }
    if (!form.projectYear) {
      AppUI.toast('请选择项目年度', 'error');
      return false;
    }
    if (!facilityKindSelected()) {
      AppUI.toast('请选择设施类型', 'error');
      return false;
    }
    var code = codeInputEl ? (codeInputEl.value || '').trim() : '';
    if (!code) {
      AppUI.toast('请填写设施编号', 'error');
      return false;
    }
    if (!validateWellFillNums()) return false;
    if (!wellFillPhotos.length) {
      AppUI.toast('请上传全景照片', 'warn');
      return false;
    }
    return true;
  }

  function isWaterOutProofStep() {
    return isWellWizard() && currentWellQuizField() === 'waterOut' && readQuizAnswer() === 'yes';
  }

  function destroyStepPhotos() {
    if (stepPhotoStrip) {
      stepPhotoStrip.destroy();
      stepPhotoStrip = null;
    }
  }

  function attachStepPhotos() {
    destroyStepPhotos();
    if (!wellStepPhotosEl || !window.AppMpPhotos) return;
    var field = currentWellQuizField();

    if (isWaterOutProofStep()) {
      if (!window.AppWellWaterPhotos) {
        if (window.AppLog) {
          AppLog.warn('m-report', 'AppWellWaterPhotos 未加载，出水取证不可用');
        }
        AppUI.toast('出水取证组件未加载，请刷新页面', 'warn');
      } else {
        if (!wellQuizData.waterOut) {
          wellQuizData.waterOut = {
            answer: 'yes',
            desc: '',
            photos: [],
            photoProof: { firstCapturedAt: null },
          };
        }
        if (!wellQuizData.waterOut.photoProof) {
          wellQuizData.waterOut.photoProof = { firstCapturedAt: null };
        }
        stepPhotoProof = wellQuizData.waterOut.photoProof;
        stepPhotoStrip = AppWellWaterPhotos.attach({
          el: wellStepPhotosEl,
          photos: stepPhotos,
          photoProof: stepPhotoProof,
          max: MAX_PHOTOS,
          previewMeta: previewMeta,
          onChange: syncNextBtn,
        });
        return;
      }
    }

    stepPhotoProof = null;
    stepPhotoStrip = AppMpPhotos.attach({
      el: wellStepPhotosEl,
      photos: stepPhotos,
      max: MAX_PHOTOS,
      logScope: 'm-report',
      previewMeta: previewMeta,
      onChange: syncNextBtn,
    });
  }

  function readQuizAnswer() {
    if (!wellQuizYnHost) return '';
    var checked = wellQuizYnHost.querySelector('input[type="radio"]:checked');
    return checked ? checked.value : '';
  }

  function saveWellQuizStep() {
    var field = currentWellQuizField();
    if (!field) return;
    var slot = {
      answer: readQuizAnswer(),
      desc: wellStepDescEl ? (wellStepDescEl.value || '').trim() : '',
      photos: stepPhotos.slice(),
    };
    if (field === 'waterOut' && slot.answer === 'yes' && stepPhotoProof) {
      slot.photoProof = {
        firstCapturedAt: stepPhotoProof.firstCapturedAt || null,
        lastCapturedAt: stepPhotoProof.lastCapturedAt || null,
      };
    }
    wellQuizData[field] = slot;
  }

  function renderWellQuizYn(field, answer) {
    if (!wellQuizYnHost) return;
    var name = 'rWellQuiz_' + field;
    wellQuizYnHost.innerHTML =
      '<div class="m-yn-group m-yn-group--quiz" data-field="' +
      field +
      '">' +
      '<label class="m-yn-item m-yn-item--quiz">' +
      '<input type="radio" name="' +
      name +
      '" value="yes"' +
      (answer === 'yes' ? ' checked' : '') +
      ' />' +
      '<span class="m-yn-box m-yn-box--yes" aria-hidden="true"></span>' +
      '<span class="m-yn-text">是</span>' +
      '</label>' +
      '<label class="m-yn-item m-yn-item--quiz">' +
      '<input type="radio" name="' +
      name +
      '" value="no"' +
      (answer === 'no' ? ' checked' : '') +
      ' />' +
      '<span class="m-yn-box m-yn-box--no" aria-hidden="true"></span>' +
      '<span class="m-yn-text">否</span>' +
      '</label>' +
      '</div>';
    wellQuizYnHost.querySelectorAll('input[type="radio"]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        syncWellStepDescPlaceholder();
        if (field === 'waterOut') attachStepPhotos();
        syncQuizPlanDateRow();
        syncNextBtn();
      });
    });
    wellQuizYnHost.querySelectorAll('.m-yn-item--quiz').forEach(function (item) {
      item.addEventListener('click', function () {
        var inp = item.querySelector('input[type="radio"]');
        if (!inp || inp.checked) return;
        inp.checked = true;
        syncWellStepDescPlaceholder();
        if (field === 'waterOut') attachStepPhotos();
        syncQuizPlanDateRow();
        syncNextBtn();
      });
    });
    syncWellStepDescPlaceholder();
  }

  function renderWellQuizStep() {
    var field = currentWellQuizField();
    if (!field || !wellQuizTitleEl) return;
    var names = activeQuizNames();
    var hints = activeQuizHints();
    var hint = hints[field] || '';
    var title = names[field] || field;
    wellQuizTitleEl.innerHTML =
      title + (hint ? '<span class="m-report__yn-hint">' + hint + '</span>' : '');
    var saved = wellQuizData[field] || { answer: '', desc: '', photos: [] };
    renderWellQuizYn(field, saved.answer);
    if (wellStepDescEl) wellStepDescEl.value = saved.desc || '';
    stepPhotos = saved.photos ? saved.photos.slice() : [];
    stepPhotoProof =
      field === 'waterOut' && saved.answer === 'yes' && saved.photoProof
        ? saved.photoProof
        : null;
    attachStepPhotos();
    syncWellProgress();
    syncWellStepDescPlaceholder();
    syncQuizPlanDateRow();
    syncNextBtn();
  }

  function mergeWellPhotos() {
    var all = wellFillPhotos.slice();
    activeQuizFields().forEach(function (key) {
      var slot = wellQuizData[key];
      if (slot && slot.photos && slot.photos.length) {
        all = all.concat(slot.photos);
      }
    });
    return all;
  }

  function mergeWellDescription() {
    var parts = [];
    var names = activeQuizNames();
    activeQuizFields().forEach(function (key) {
      var slot = wellQuizData[key];
      if (slot && slot.desc) {
        parts.push((names[key] || key) + '：' + slot.desc);
      }
    });
    return parts.length ? parts.join('\n') : defaultWizardDescription();
  }

  function collectWellFieldsFromWizard() {
    var total = parseInt(document.getElementById('rWellOutletTotal').value, 10);
    var casing = parseInt(document.getElementById('rWellCasingTotal').value, 10);
    var outletDamaged = parseInt(document.getElementById('rWellOutletDamaged').value, 10);
    var casingDamaged = parseInt(document.getElementById('rWellCasingDamaged').value, 10);
    var data = {
      buildKind: readRadio('buildKind'),
      outletTotal: isNaN(total) ? null : total,
      outletDamaged: isNaN(outletDamaged) ? null : outletDamaged,
      casingTotal: isNaN(casing) ? null : casing,
      casingDamaged: isNaN(casingDamaged) ? null : casingDamaged,
      fillPhotos: wellFillPhotos.slice(),
      wellPlanDate: form.planDate || '',
      quizSteps: wellQuizData,
    };
    WELL_QUIZ_FIELDS.forEach(function (key) {
      data[key] = wellQuizData[key] ? wellQuizData[key].answer : '';
    });
    return data;
  }

  function facilityKindSelected() {
    if (form.type !== 'well') return true;
    return !!readRadio('buildKind');
  }

  function canProceedStep1() {
    if (!regionSelectionComplete()) return false;
    if (!form.projectYear) return false;
    var code = codeInputEl ? (codeInputEl.value || '').trim() : '';
    if (!code) return false;
    if (!facilityKindSelected()) return false;
    return true;
  }

  function canProceedRoadFill() {
    if (!canProceedStep1()) return false;
    if (parseNum('rRoadLength') == null) return false;
    if (parseNum('rRoadWidth') == null) return false;
    if (parseNum('rRoadThickness') == null) return false;
    return true;
  }

  function validateRoadFillStep() {
    if (!regionSelectionComplete()) {
      AppUI.toast('请选择行政区划', 'error');
      return false;
    }
    if (!form.projectYear) {
      AppUI.toast('请选择项目年度', 'error');
      return false;
    }
    var code = codeInputEl ? (codeInputEl.value || '').trim() : '';
    if (!code) {
      AppUI.toast('请填写设施编号', 'error');
      return false;
    }
    if (parseNum('rRoadLength') == null) {
      AppUI.toast('请填写道路长度', 'warn');
      return false;
    }
    if (parseNum('rRoadWidth') == null) {
      AppUI.toast('请填写道路宽度', 'warn');
      return false;
    }
    if (parseNum('rRoadThickness') == null) {
      AppUI.toast('请填写道路厚度', 'warn');
      return false;
    }
    return true;
  }

  function collectRoadFieldsFromWizard() {
    var data = {
      length: parseNum('rRoadLength'),
      width: parseNum('rRoadWidth'),
      thickness: parseNum('rRoadThickness'),
      planDate: form.planDate || '',
      quizSteps: wellQuizData,
    };
    ROAD_QUIZ_FIELDS.forEach(function (key) {
      data[key] = wellQuizData[key] ? wellQuizData[key].answer : '';
    });
    return data;
  }

  function canProceedBridgeFill() {
    if (!canProceedStep1()) return false;
    if (!readRadioIn(bridgeFillExtra, 'kind')) return false;
    if (parseNum('rBridgeLength') == null) return false;
    if (parseNum('rBridgeWidth') == null) return false;
    return true;
  }

  function validateBridgeFillStep() {
    if (!regionSelectionComplete()) {
      AppUI.toast('请选择行政区划', 'error');
      return false;
    }
    if (!form.projectYear) {
      AppUI.toast('请选择项目年度', 'error');
      return false;
    }
    var code = codeInputEl ? (codeInputEl.value || '').trim() : '';
    if (!code) {
      AppUI.toast('请填写设施编号', 'error');
      return false;
    }
    if (!readRadioIn(bridgeFillExtra, 'kind')) {
      AppUI.toast('请选择设施类型（桥/涵/闸）', 'warn');
      return false;
    }
    if (parseNum('rBridgeLength') == null) {
      AppUI.toast('请填写长度', 'warn');
      return false;
    }
    if (parseNum('rBridgeWidth') == null) {
      AppUI.toast('请填写宽度', 'warn');
      return false;
    }
    return true;
  }

  function collectBridgeFieldsFromWizard() {
    var data = {
      kind: readRadioIn(bridgeFillExtra, 'kind'),
      length: parseNum('rBridgeLength'),
      width: parseNum('rBridgeWidth'),
      planDate: form.planDate || '',
      quizSteps: wellQuizData,
      needsRectify: wellQuizData.needsRectify ? wellQuizData.needsRectify.answer : '',
    };
    return data;
  }

  function canProceedForestFill() {
    if (!canProceedStep1()) return false;
    if (parseNum('rForestHandover') == null) return false;
    if (parseNum('rForestExisting') == null) return false;
    if (parseNum('rForestSurviveRate') == null) return false;
    return true;
  }

  function validateForestFillStep() {
    if (!regionSelectionComplete()) {
      AppUI.toast('请选择行政区划', 'error');
      return false;
    }
    if (!form.projectYear) {
      AppUI.toast('请选择项目年度', 'error');
      return false;
    }
    var code = codeInputEl ? (codeInputEl.value || '').trim() : '';
    if (!code) {
      AppUI.toast('请填写设施编号', 'error');
      return false;
    }
    if (parseNum('rForestHandover') == null) {
      AppUI.toast('请填写移交株数', 'warn');
      return false;
    }
    if (parseNum('rForestExisting') == null) {
      AppUI.toast('请填写现有株数', 'warn');
      return false;
    }
    var rate = parseNum('rForestSurviveRate');
    if (rate == null) {
      AppUI.toast('请填写存活率', 'warn');
      return false;
    }
    if (rate < 0 || rate > 100) {
      AppUI.toast('存活率应在 0–100 之间', 'warn');
      return false;
    }
    return true;
  }

  function collectForestFieldsFromWizard() {
    var data = {
      handoverCount: parseNum('rForestHandover'),
      existingCount: parseNum('rForestExisting'),
      surviveRate: parseNum('rForestSurviveRate'),
      planDate: form.planDate || '',
      quizSteps: wellQuizData,
    };
    FOREST_QUIZ_FIELDS.forEach(function (key) {
      data[key] = wellQuizData[key] ? wellQuizData[key].answer : '';
    });
    return data;
  }

  function canProceedTransformerFill() {
    if (!canProceedStep1()) return false;
    if (parseNum('rTfCapacity') == null) return false;
    if (!(document.getElementById('rTfModel').value || '').trim()) return false;
    if (!readRadioIn(transformerFillExtra, 'voltage')) return false;
    return true;
  }

  function validateTransformerFillStep() {
    if (!regionSelectionComplete()) {
      AppUI.toast('请选择行政区划', 'error');
      return false;
    }
    if (!form.projectYear) {
      AppUI.toast('请选择项目年度', 'error');
      return false;
    }
    var code = codeInputEl ? (codeInputEl.value || '').trim() : '';
    if (!code) {
      AppUI.toast('请填写设施编号', 'error');
      return false;
    }
    if (parseNum('rTfCapacity') == null) {
      AppUI.toast('请填写容量', 'warn');
      return false;
    }
    if (!(document.getElementById('rTfModel').value || '').trim()) {
      AppUI.toast('请填写型号', 'warn');
      return false;
    }
    if (!readRadioIn(transformerFillExtra, 'voltage')) {
      AppUI.toast('请选择电压等级', 'warn');
      return false;
    }
    return true;
  }

  function collectTransformerFieldsFromWizard() {
    var data = {
      capacity: parseNum('rTfCapacity'),
      model: (document.getElementById('rTfModel').value || '').trim(),
      voltage: readRadioIn(transformerFillExtra, 'voltage'),
      planDate: form.planDate || '',
      quizSteps: wellQuizData,
    };
    TRANSFORMER_QUIZ_FIELDS.forEach(function (key) {
      data[key] = wellQuizData[key] ? wellQuizData[key].answer : '';
    });
    return data;
  }

  function canProceedWizardFill() {
    if (isWellWizard()) return canProceedWellFill();
    if (isRoadWizard()) return canProceedRoadFill();
    if (isBridgeWizard()) return canProceedBridgeFill();
    if (isForestWizard()) return canProceedForestFill();
    if (isTransformerWizard()) return canProceedTransformerFill();
    return false;
  }

  function validateWizardFillStep() {
    if (isWellWizard()) return validateWellFillStep();
    if (isRoadWizard()) return validateRoadFillStep();
    if (isBridgeWizard()) return validateBridgeFillStep();
    if (isForestWizard()) return validateForestFillStep();
    if (isTransformerWizard()) return validateTransformerFillStep();
    return false;
  }

  function goToWizardAfterFill() {
    if (activeQuizFields().length) {
      wellStep = 1;
      syncWellWizardLayout();
      renderWellQuizStep();
    } else {
      wellStep = signatureStepIndex();
      destroyStepPhotos();
      syncWellWizardLayout();
      initWellSignatureStep();
    }
    if (reportFormEl) reportFormEl.scrollTop = 0;
  }

  function syncNextBtn() {
    if (!nextBtnEl) return;
    if (isTypeWizard()) {
      if (wellStep === 0) {
        nextBtnEl.disabled = !canProceedWizardFill();
        nextBtnEl.textContent = '下一步';
      } else if (isWellSignatureStep()) {
        nextBtnEl.disabled = !signaturePad || signaturePad.isEmpty();
        nextBtnEl.textContent = '提交巡查';
      } else {
        nextBtnEl.disabled = !canProceedQuizStep();
        nextBtnEl.textContent = '下一步';
      }
      syncReportFoot();
      return;
    }
    if (prevBtnEl) prevBtnEl.setAttribute('hidden', '');
    if (reportFootEl) reportFootEl.classList.remove('m-report__foot--dual');
    nextBtnEl.disabled = false;
    nextBtnEl.textContent = '提交巡查';
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

  function autoGrowMeasure() {
    var el = document.getElementById('rWellMeasure');
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.max(56, el.scrollHeight) + 'px';
  }

  function syncTypeBlocks() {
    if (wellBlock) wellBlock.hidden = true;
    if (roadBlock) roadBlock.hidden = true;
    if (bridgeBlock) bridgeBlock.hidden = true;
    if (forestBlock) forestBlock.hidden = true;
    if (transformerBlock) transformerBlock.hidden = true;
    if (facilityKindRow) facilityKindRow.hidden = form.type !== 'well';
    if (!isTypeWizard()) {
      wellStep = 0;
      wellQuizData = {};
      wellSignatureData = '';
      destroySignaturePad();
    }
    syncWellWizardLayout();
  }

  function readRadioIn(block, field) {
    if (!block) return '';
    var group = block.querySelector('.m-yn-group[data-field="' + field + '"]');
    if (!group) return '';
    var checked = group.querySelector('input[type="radio"]:checked');
    return checked ? checked.value : '';
  }

  function readRadio(field) {
    if (field === 'buildKind') {
      return readRadioIn(facilityKindRow, field);
    }
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
    if (isWellWizard()) {
      return collectWellFieldsFromWizard();
    }
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
      wellPlanDate: form.planDate || '',
    };
  }

  function validateWellFields() {
    if (isWellWizard()) {
      return collectWellFieldsFromWizard();
    }
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
    return collectRoadFieldsFromWizard();
  }

  function validateRoadFields() {
    return collectRoadFieldsFromWizard();
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

  function ensureDefaultBuildKind() {
    if (!facilityKindRow || form.type !== 'well') return;
    if (!readRadio('buildKind')) {
      var inp = facilityKindRow.querySelector('input[value="new"]');
      if (inp) inp.checked = true;
    }
  }

  function applySuggestedCode() {
    if (!codeInputEl || !window.AppProjectCode) return;
    codeInputEl.value = AppProjectCode.suggest(form.type);
    syncNextBtn();
  }

  function syncYearBtns() {
    if (!yearGroupEl) return;
    var btns = yearGroupEl.querySelectorAll('.m-year-btn');
    btns.forEach(function (btn) {
      var on = btn.getAttribute('data-year') === form.projectYear;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
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
    var text = loc.address || '—';
    if (locText) locText.textContent = text;
    if (legacyLocText) legacyLocText.textContent = text;
  }

  function relocate() {
    if (locText) locText.textContent = '定位中…';
    if (legacyLocText) legacyLocText.textContent = '定位中…';
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
        var hint =
          meta.error === 'insecure'
            ? '请用 localhost 或 HTTPS 访问以启用定位'
            : window.AppWatermark && typeof AppWatermark.locateErrorHint === 'function'
              ? AppWatermark.locateErrorHint(meta.error)
              : '无法获取当前位置，已使用默认地址';
        AppUI.toast(hint, 'warn');
        if (window.AppLog) AppLog.warn('m-report', 'locate fallback', meta);
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
        var naturals = villageNaturals(villageOpt);
        var naturalOpt = naturals.length ? naturals[cascade.naturalIndex] || naturals[0] : null;
        form.street = streetOpt.value;
        form.village = villageOpt ? villageOpt.value : '';
        form.naturalVillage = naturalOpt ? naturalOpt.value : '';
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
    var villageOpt = villages[villageIndex] || villages[0];
    var naturals = villageNaturals(villageOpt);
    var naturalIndex = indexOf(naturals, form.naturalVillage);
    cascade = {
      streetIndex: streetIndex,
      villageIndex: villageIndex,
      naturalIndex: naturalIndex,
    };

    var host = mountHost();
    var mask = document.createElement('div');
    mask.className = 'm-picker m-picker--region3';
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
      '<div class="m-picker__col" id="mReportPickerVillage" aria-label="社区或新村">' +
      colHtml(villages) +
      '</div>' +
      '<div class="m-picker__col" id="mReportPickerNatural" aria-label="自然村">' +
      colHtml(naturals) +
      '</div>' +
      '</div>' +
      '</div>' +
      '</div>';

    host.appendChild(mask);
    pickerRoot = mask;

    var streetCol = mask.querySelector('#mReportPickerStreet');
    var villageCol = mask.querySelector('#mReportPickerVillage');
    var naturalCol = mask.querySelector('#mReportPickerNatural');
    streetCol.scrollTop = streetIndex * ITEM_H;
    villageCol.scrollTop = villageIndex * ITEM_H;
    markActiveItem(streetCol, streetIndex);
    markActiveItem(villageCol, villageIndex);

    function syncNaturalCol() {
      var streetOpt = regionTree[cascade.streetIndex] || regionTree[0];
      var villagesList = streetOpt.children || [];
      var currentVillage = villagesList[cascade.villageIndex] || villagesList[0];
      var list = villageNaturals(currentVillage);
      if (!list.length) {
        cascade.naturalIndex = 0;
        naturalCol.innerHTML = colHtml([]);
        naturalCol.scrollTop = 0;
        return;
      }
      if (cascade.naturalIndex >= list.length) cascade.naturalIndex = 0;
      naturalCol.innerHTML = colHtml(list);
      naturalCol.scrollTop = cascade.naturalIndex * ITEM_H;
      markActiveItem(naturalCol, cascade.naturalIndex);
    }

    syncNaturalCol();

    function refreshVillages() {
      var streetOpt = regionTree[cascade.streetIndex] || regionTree[0];
      var next = streetOpt.children || [];
      cascade.villageIndex = 0;
      cascade.naturalIndex = 0;
      villageCol.innerHTML = colHtml(next);
      villageCol.scrollTop = 0;
      markActiveItem(villageCol, 0);
      refreshNaturals();
    }

    function refreshNaturals() {
      syncNaturalCol();
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
      var next = snapCol(villageCol, list.length - 1);
      if (next !== cascade.villageIndex) {
        cascade.villageIndex = next;
        cascade.naturalIndex = 0;
        refreshNaturals();
      } else {
        cascade.villageIndex = next;
      }
      markActiveItem(villageCol, cascade.villageIndex);
    });

    bindColScroll(naturalCol, function () {
      var streetOpt = regionTree[cascade.streetIndex] || regionTree[0];
      var villagesList = streetOpt.children || [];
      var villageOpt = villagesList[cascade.villageIndex] || villagesList[0];
      var list = villageNaturals(villageOpt);
      if (!list.length) {
        cascade.naturalIndex = 0;
        return;
      }
      cascade.naturalIndex = snapCol(naturalCol, list.length - 1);
      markActiveItem(naturalCol, cascade.naturalIndex);
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
    var Loop = window.HSFPickerDateLoop;
    if (!Loop) {
      AppUI.toast('日期组件未加载', 'error');
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
  ensureDefaultBuildKind();
  applySuggestedCode();
  relocate();
  syncWellWizardLayout();
  if (photosEl && window.AppMpPhotos && !isTypeWizard()) {
    photoStrip = AppMpPhotos.attach({
      el: photosEl,
      photos: photos,
      max: MAX_PHOTOS,
      logScope: 'm-report',
      previewMeta: previewMeta,
    });
  }

  typeCtrlEl.addEventListener('click', function (e) {
    var item = e.target.closest('.seg-item');
    if (!item || !typeCtrlEl.contains(item)) return;
    var next = item.getAttribute('data-type');
    if (!next || next === form.type) return;
    form.type = next;
    wellStep = 0;
    wellQuizData = {};
    wellSignatureData = '';
    wellFillPhotos = [];
    destroyWellFillPhotos();
    destroySignaturePad();
    destroyStepPhotos();
    if (isTypeWizard() && photoStrip) {
      photoStrip.destroy();
      photoStrip = null;
    }
    if (!isTypeWizard() && photosEl && !photoStrip && window.AppMpPhotos) {
      photoStrip = AppMpPhotos.attach({
        el: photosEl,
        photos: photos,
        max: MAX_PHOTOS,
        logScope: 'm-report',
        previewMeta: previewMeta,
      });
    }
    renderTypeSeg();
    syncTypeBlocks();
    ensureDefaultBuildKind();
    applySuggestedCode();
    if (window.AppLog) AppLog.info('m-report', 'type change', { type: form.type });
  });

  if (yearGroupEl) {
    yearGroupEl.addEventListener('click', function (e) {
      var btn = e.target.closest('.m-year-btn');
      if (!btn || !yearGroupEl.contains(btn)) return;
      var next = btn.getAttribute('data-year');
      if (!next || next === form.projectYear) return;
      form.projectYear = next;
      syncYearBtns();
      syncNextBtn();
      if (window.AppLog) AppLog.info('m-report', 'project year', { projectYear: form.projectYear });
    });
    syncYearBtns();
  }

  if (codeInputEl) {
    codeInputEl.addEventListener('input', syncNextBtn);
  }

  ['rWellOutletTotal', 'rWellOutletDamaged', 'rWellCasingTotal', 'rWellCasingDamaged'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', syncNextBtn);
  });

  ['rRoadLength', 'rRoadWidth', 'rRoadThickness'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', syncNextBtn);
  });

  ['rBridgeLength', 'rBridgeWidth', 'rForestHandover', 'rForestExisting', 'rForestSurviveRate', 'rTfCapacity', 'rTfModel'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', syncNextBtn);
  });

  if (bridgeKindRow) {
    bridgeKindRow.addEventListener('click', function (e) {
      var item = e.target.closest('.m-yn-item');
      if (!item || !bridgeKindRow.contains(item)) return;
      var inp = item.querySelector('input[type="radio"]');
      if (!inp) return;
      inp.checked = true;
      syncNextBtn();
    });
    bridgeKindRow.addEventListener('change', syncNextBtn);
  }

  if (transformerFillExtra) {
    transformerFillExtra.addEventListener('click', function (e) {
      var item = e.target.closest('.m-yn-item');
      if (!item || !transformerFillExtra.contains(item)) return;
      var inp = item.querySelector('input[type="radio"]');
      if (!inp) return;
      inp.checked = true;
      syncNextBtn();
    });
    transformerFillExtra.addEventListener('change', syncNextBtn);
  }

  if (facilityKindRow) {
    facilityKindRow.addEventListener('click', function (e) {
      var item = e.target.closest('.m-yn-item');
      if (!item || !facilityKindRow.contains(item)) return;
      var inp = item.querySelector('input[type="radio"]');
      if (!inp) return;
      inp.checked = true;
      syncNextBtn();
    });
    facilityKindRow.addEventListener('change', syncNextBtn);
  }

  document.getElementById('btnRelocate').addEventListener('click', function (e) {
    e.stopPropagation();
    relocate();
  });

  var btnRelocateLegacy = document.getElementById('btnRelocateLegacy');
  if (btnRelocateLegacy) {
    btnRelocateLegacy.addEventListener('click', function (e) {
      e.stopPropagation();
      relocate();
    });
  }

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
  var legacyPlanDateRow = document.getElementById('rLegacyPlanDateRow');
  if (legacyPlanDateRow) {
    legacyPlanDateRow.addEventListener('click', function () {
      openPicker('planDate');
    });
  }

  function submitTypeWizard() {
    submitWizard();
  }

  function submitWizard() {
    if (signaturePad && !signaturePad.isEmpty()) {
      wellSignatureData = signaturePad.toDataURL();
    }
    if (!wellSignatureData) {
      AppUI.toast('请完成电子签名', 'warn');
      return;
    }
    saveWellQuizStep();
    var code = (codeInputEl.value || '').trim();
    if (window.AppProjectCode && AppProjectCode.isTaken(code)) {
      AppUI.toast('设施编号已存在，请更换', 'error');
      return;
    }
    if (
      isWellWizard() &&
      wellQuizData.waterOut &&
      wellQuizData.waterOut.answer === 'yes' &&
      window.AppWellWaterPhotos &&
      !AppWellWaterPhotos.validateProof(
        wellQuizData.waterOut.photos || [],
        wellQuizData.waterOut.photoProof || {}
      ).ok
    ) {
      AppUI.toast('出水题须完成两张现场拍照取证', 'warn');
      return;
    }
    var mergedPhotos = mergeWellPhotos();
    var projectName = form.projectYear + ' 高标农田建设项目';
    var photoAt = new Date().toISOString();
    var region = {
      street: form.street,
      village: form.village,
      naturalVillage: form.naturalVillage,
    };
    var payload = {
      type: form.type,
      street: form.street,
      village: form.village,
      naturalVillage: form.naturalVillage,
      projectYear: form.projectYear,
      projectName: projectName,
      code: code,
      description: mergeWellDescription(),
      locationText: loc.address,
      address: loc.address,
      lat: loc.lat,
      lng: loc.lng,
      photoSrc: mergedPhotos[0] || '',
      photos: mergedPhotos.slice(),
      photoAt: photoAt,
      inspectionDate: AppData.toDateKey(photoAt),
      reporterId: session.staffId,
      reporterName: session.name,
      reporterPhone: session.phone,
      reporterSignature: wellSignatureData,
      assigneeId: '',
      assigneeName: '',
      assigneePhone: '',
      measures: '',
      planDate: form.planDate,
    };
    if (isWellWizard()) {
      payload.well = collectWellFieldsFromWizard();
    } else if (isRoadWizard()) {
      var roadExtra = collectRoadFieldsFromWizard();
      payload.road = roadExtra;
      payload.length = String(roadExtra.length);
      payload.width = String(roadExtra.width);
      payload.thickness = String(roadExtra.thickness);
      payload.hasShoulder = roadExtra.hasShoulder === 'yes' ? '是' : '否';
      payload.hasAsh = roadExtra.hasAsh === 'yes' ? '是' : '否';
      payload.hasRoadDamage = roadExtra.hasRoadDamage === 'yes' ? '是' : '否';
    } else if (isBridgeWizard()) {
      var bridgeExtra = collectBridgeFieldsFromWizard();
      payload.bridge = bridgeExtra;
      payload.bridgeKind = bridgeExtra.kind;
      payload.bridgeKindLabel = BRIDGE_KIND_LABEL[bridgeExtra.kind] || '';
      payload.length = String(bridgeExtra.length);
      payload.width = String(bridgeExtra.width);
    } else if (isForestWizard()) {
      payload.forest = collectForestFieldsFromWizard();
    } else if (isTransformerWizard()) {
      payload.transformer = collectTransformerFieldsFromWizard();
    }
    if (window.AppWellSubmitRules && typeof AppWellSubmitRules.applyWizardSubmit === 'function') {
      AppWellSubmitRules.applyWizardSubmit(payload, wellQuizData, region, form.type);
    } else if (window.AppWellSubmitRules) {
      if (isWellWizard()) AppWellSubmitRules.applyWellSubmit(payload, wellQuizData, region);
      else if (isRoadWizard()) AppWellSubmitRules.applyRoadSubmit(payload, wellQuizData, region);
      else payload.status = 'pending';
    } else {
      payload.status = 'pending';
    }

    if (nextBtnEl) nextBtnEl.disabled = true;

    function finishSave(p) {
      if (!AppData.addIssue(p)) {
        AppUI.toast('本地记录空间不足，请清理浏览器缓存后重试', 'error');
        if (nextBtnEl) nextBtnEl.disabled = false;
        return;
      }
      AppUI.toast('提交成功', 'success');
      if (window.AppLog) AppLog.info('m-report', 'submitted wizard', { type: form.type, code: code });
      setTimeout(function () {
        if (window.HSFNav) HSFNav.go('./todo.html');
        else location.href = './todo.html';
      }, 500);
    }

    if (window.AppImageCompress && typeof AppImageCompress.compressIssuePayload === 'function') {
      AppImageCompress.compressIssuePayload(payload)
        .then(finishSave)
        .catch(function (err) {
          if (window.AppLog) AppLog.error('m-report', 'compress before save', err);
          AppUI.toast('图片处理失败，请重试', 'error');
          if (nextBtnEl) nextBtnEl.disabled = false;
        });
      return;
    }

    finishSave(payload);
  }

  function submitLegacyForm() {
    if (!photos.length) {
      AppUI.toast('请至少上传 1 张图片', 'error');
      return;
    }
    if (!regionSelectionComplete()) {
      AppUI.toast('请选择行政区划', 'error');
      return;
    }
    if (!form.projectYear) {
      AppUI.toast('请选择项目年度', 'error');
      return;
    }
    if (form.type === 'well' && !facilityKindSelected()) {
      AppUI.toast('请选择设施类型', 'error');
      return;
    }
    if (!form.planDate) {
      AppUI.toast('请选择计划整改完成时间', 'error');
      return;
    }
    var desc = (document.getElementById('rDesc').value || '').trim();
    if (!desc) {
      AppUI.toast('请填写问题描述', 'error');
      return;
    }
    var code = (codeInputEl.value || '').trim();
    if (!code) {
      AppUI.toast('请填写设施编号', 'error');
      return;
    }
    if (window.AppProjectCode && AppProjectCode.isTaken(code)) {
      AppUI.toast('设施编号已存在，请更换', 'error');
      return;
    }
    var projectName = form.projectYear + ' 高标农田建设项目';
    var planDate = form.planDate;
    var wellExtra = null;
    var bridgeExtra = null;
    var forestExtra = null;
    var transformerExtra = null;
    if (form.type === 'well') {
      wellExtra = validateWellFields();
      if (!wellExtra) return;
      wellExtra.wellPlanDate = planDate;
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
      naturalVillage: form.naturalVillage,
      projectYear: form.projectYear,
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
      inspectionDate: AppData.toDateKey(photoAt),
      reporterId: session.staffId,
      reporterName: session.name,
      reporterPhone: session.phone,
      assigneeId: '',
      assigneeName: '',
      assigneePhone: '',
      measures: '',
      planDate: planDate,
      status: 'pending',
    };
    if (wellExtra) payload.well = wellExtra;
    if (bridgeExtra) {
      payload.bridge = bridgeExtra;
      payload.bridgeKind = bridgeExtra.kind;
      payload.bridgeKindLabel = BRIDGE_KIND_LABEL[bridgeExtra.kind] || '';
      payload.length = String(bridgeExtra.length);
      payload.width = String(bridgeExtra.width);
    }
    if (forestExtra) payload.forest = forestExtra;
    if (transformerExtra) payload.transformer = transformerExtra;
    if (!AppData.addIssue(payload)) {
      AppUI.toast('本地记录空间不足，请清理浏览器缓存后重试', 'error');
      return;
    }
    AppUI.toast('提交成功', 'success');
    if (window.AppLog) AppLog.info('m-report', 'submitted', { type: form.type, code: code });
    setTimeout(function () {
      if (window.HSFNav) HSFNav.go('./todo.html');
      else location.href = './todo.html';
    }, 500);
  }

  if (wellStepDescEl) {
    wellStepDescEl.addEventListener('input', syncNextBtn);
  }

  function handleReportPrev() {
    if (!isTypeWizard() || wellStep <= 0) return;
    if (isWellSignatureStep()) {
      if (signaturePad && !signaturePad.isEmpty()) {
        wellSignatureData = signaturePad.toDataURL();
      }
      destroySignaturePad();
    } else if (wellStep <= activeQuizFields().length) {
      saveWellQuizStep();
    }
    wellStep -= 1;
    syncWellWizardLayout();
    if (wellStep >= 1 && wellStep <= activeQuizFields().length) {
      renderWellQuizStep();
    } else {
      destroyStepPhotos();
    }
    if (reportFormEl) reportFormEl.scrollTop = 0;
  }

  function handleReportNext() {
    if (isTypeWizard()) {
      if (wellStep === 0) {
        if (!validateWizardFillStep()) return;
        goToWizardAfterFill();
        return;
      }
      if (isWellSignatureStep()) {
        submitTypeWizard();
        return;
      }
      if (!validateQuizStepBeforeNext(true)) {
        return;
      }
      saveWellQuizStep();
      if (isLastWellQuizStep()) {
        wellStep = signatureStepIndex();
        destroyStepPhotos();
        syncWellWizardLayout();
        initWellSignatureStep();
        if (reportFormEl) reportFormEl.scrollTop = 0;
        return;
      }
      wellStep += 1;
      renderWellQuizStep();
      if (reportFormEl) reportFormEl.scrollTop = 0;
      return;
    }
    submitLegacyForm();
  }

  if (nextBtnEl) {
    nextBtnEl.addEventListener('click', handleReportNext);
  }
  if (prevBtnEl) {
    prevBtnEl.addEventListener('click', handleReportPrev);
  }

  document.getElementById('reportForm').addEventListener('submit', function (e) {
    e.preventDefault();
  });

  function onLeave() {
    closePicker(false);
    destroyStepPhotos();
    destroyWellFillPhotos();
    destroySignaturePad();
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
