/**
 * 机井/各类型巡查提交规则（栈 B · 演示）
 *
 * 状态三态：
 *   pending   待整改 — 排查有问题，推送给最下级区划整改责任人
 *   done      已整改 — 责任人提交整改反馈（说明+照片，无签名）后
 *   inspected 已排查 — 排查无问题，无需整改
 *
 * 电子签名（与状态分流无关）：
 *   排查上报末步固定须签（reporterSignature）；整改闭环不签。
 *   正向题全「是」、反向题全「否」→ inspected；否则 pending。
 *
 * 整改责任人：后台按组织配置；匹配最下级区划（有自然村→自然村，否则→村/社区），
 * 取该单位工作人员（优先 rectifyAssignee）；推送按 assigneePhone（演示写日志）。
 *
 * 选项页校验：正向题选「否」、反向题选「是」（枯死木/断带/病虫害/私拉乱接/桥涵闸需整改）须描述+照片
 */
(function (global) {
  'use strict';

  var QUIZ_FIELDS = ['waterOut', 'pipeOk', 'wiringOk', 'boxOk', 'coverOk'];
  /** 道路选项页全部题目（含不参与状态判定的路肩/灰土层） */
  var ROAD_QUIZ_FIELDS = ['hasShoulder', 'hasAsh', 'hasRoadDamage'];
  /** 道路状态仅看「是否有道路损坏」：是→待整改，否→已排查 */
  var ROAD_STATUS_FIELDS = ['hasRoadDamage'];
  var ROAD_STATUS_NEGATIVE = ['hasRoadDamage'];
  var FOREST_QUIZ_FIELDS = ['brokenBelt', 'deadTrees', 'pest'];
  var TRANSFORMER_QUIZ_FIELDS = ['powered', 'deviceOk', 'cabinetOk', 'illegalWire'];

  var TYPE_QUIZ_CONFIG = {
    well: { fields: QUIZ_FIELDS, negative: [] },
    road: { fields: ROAD_STATUS_FIELDS, negative: ROAD_STATUS_NEGATIVE },
    bridge: { fields: ['needsRectify'], negative: ['needsRectify'] },
    forest: { fields: FOREST_QUIZ_FIELDS, negative: FOREST_QUIZ_FIELDS.slice() },
    transformer: { fields: TRANSFORMER_QUIZ_FIELDS, negative: ['illegalWire'] },
  };

  /** 选项页选定是/否后仍可不传照片的字段 */
  var QUIZ_PHOTO_OPTIONAL_FIELDS = ['wiringOk', 'hasShoulder', 'hasAsh'];

  /**
   * 选项页是否须至少 1 张照片（出水=是走 AppWellWaterPhotos，不在此列）
   * @param {string} field
   * @param {string} ans yes|no
   */
  function quizStepRequiresPhoto(field, ans) {
    if (!field || !ans) return false;
    if (QUIZ_PHOTO_OPTIONAL_FIELDS.indexOf(field) !== -1) return false;
    if (field === 'waterOut' && ans === 'yes') return false;
    return true;
  }

  /** 路肩/灰土层：是/否均不强制描述（不视为「存在问题」） */
  function quizAnswerIndicatesIssue(ans, field, type) {
    if (!ans || !field) return false;
    if (field === 'hasShoulder' || field === 'hasAsh') return false;
    var cfg = TYPE_QUIZ_CONFIG[type] || { negative: [] };
    var neg = cfg.negative || [];
    /* 道路 UI 含 hasRoadDamage，须按反向题判断（即使 status fields 单独配置） */
    if (field === 'hasRoadDamage') return ans === 'yes';
    if (neg.indexOf(field) !== -1) return ans === 'yes';
    return ans === 'no';
  }

  var STATUS = {
    pending: 'pending',
    done: 'done',
    inspected: 'inspected',
  };

  var STATUS_LABEL = {
    pending: '待整改',
    done: '已整改',
    inspected: '已排查',
  };

  function evaluateQuiz(quizData, fields, negativeFields) {
    quizData = quizData || {};
    fields = fields || [];
    negativeFields = negativeFields || [];
    var hasIssue = false;
    var i;
    for (i = 0; i < fields.length; i++) {
      var key = fields[i];
      var slot = quizData[key];
      var answer = slot && slot.answer;
      if (!answer) {
        hasIssue = true;
        break;
      }
      var negative = negativeFields.indexOf(key) !== -1;
      if (negative ? answer === 'yes' : answer !== 'yes') {
        hasIssue = true;
        break;
      }
    }
    return {
      allYes: !hasIssue,
      status: hasIssue ? STATUS.pending : STATUS.inspected,
      needsAssignee: hasIssue,
    };
  }

  function evaluateWellQuiz(quizData) {
    return evaluateQuiz(quizData, QUIZ_FIELDS, []);
  }

  function evaluateRoadQuiz(quizData) {
    return evaluateQuiz(quizData, ROAD_STATUS_FIELDS, ROAD_STATUS_NEGATIVE);
  }

  function evaluateWizardQuiz(quizData, type) {
    var cfg = TYPE_QUIZ_CONFIG[type] || { fields: [], negative: [] };
    return evaluateQuiz(quizData, cfg.fields, cfg.negative);
  }

  function orgMap(orgs) {
    var map = {};
    orgs.forEach(function (o) {
      map[o.id] = o;
    });
    return map;
  }

  function orgBelongsToStreet(org, streetName, byId) {
    if (!org || !streetName) return true;
    var cur = org;
    var guard = 0;
    while (cur && guard < 12) {
      if (cur.type === 'street' && cur.name === streetName) return true;
      if (!cur.parentId) break;
      cur = byId[cur.parentId];
      guard += 1;
    }
    return false;
  }

  function matchOrgName(org, name) {
    if (!org || !name) return false;
    return org.name === name || org.name.indexOf(name) === 0 || name.indexOf(org.name) === 0;
  }

  /**
   * 最下级区划 orgId：有自然村名则先匹配自然村，否则匹配村/社区
   */
  function resolveRegionOrgId(region) {
    region = region || {};
    var street = (region.street || '').trim();
    var village = (region.village || '').trim();
    var naturalVillage = (region.naturalVillage || '').trim();
    var orgs =
      (global.AppStorage && global.AppStorage.get('orgs', [])) || [];
    var byId = orgMap(orgs);
    var names = [];
    if (naturalVillage) names.push(naturalVillage);
    if (village) names.push(village);

    var ni;
    for (ni = 0; ni < names.length; ni++) {
      var target = names[ni];
      var i;
      for (i = 0; i < orgs.length; i++) {
        var o = orgs[i];
        if (!matchOrgName(o, target)) continue;
        if (street && !orgBelongsToStreet(o, street, byId)) continue;
        if (
          o.type === 'village' ||
          o.type === 'community' ||
          o.type === 'natural' ||
          o.type === 'c' ||
          o.type === 'v'
        ) {
          return o.id;
        }
      }
    }
    return '';
  }

  function getStaffList() {
    if (global.AppData && typeof AppData.getStaff === 'function') {
      return AppData.getStaff() || [];
    }
    return (global.AppStorage && global.AppStorage.get('staff', [])) || [];
  }

  /**
   * @returns {{ assigneeId, assigneeName, assigneePhone }}
   */
  function resolveAssignee(region) {
    var orgId = resolveRegionOrgId(region);
    var staff = getStaffList().filter(function (s) {
      if (s.enabled === false) return false;
      return orgId ? s.orgId === orgId : false;
    });
    var pick =
      staff.find(function (s) {
        return s.rectifyAssignee === true;
      }) || staff[0];
    if (!pick) {
      return { assigneeId: '', assigneeName: '', assigneePhone: '' };
    }
    return {
      assigneeId: pick.id,
      assigneeName: pick.name || '',
      assigneePhone: pick.phone || '',
    };
  }

  function isAssigneeMatch(issue, session) {
    if (!issue || !session) return false;
    var phone = String(session.phone || '').trim();
    var staffId = String(session.staffId || '').trim();
    var name = String(session.name || '').trim();
    if (phone && String(issue.assigneePhone || '').trim() === phone) return true;
    if (staffId && String(issue.assigneeId || '').trim() === staffId) return true;
    if (name && String(issue.assigneeName || '').trim() === name) return true;
    return false;
  }

  function notifyAssignee(issue) {
    if (!issue || issue.status !== STATUS.pending) return;
    if (!issue.assigneePhone) return;
    if (global.AppData && typeof AppData.pushLog === 'function') {
      AppData.pushLog(
        '推送整改待办',
        (issue.code || issue.id) +
          ' → ' +
          (issue.assigneeName || '责任人') +
          ' ' +
          issue.assigneePhone
      );
    }
    if (global.AppLog) {
      AppLog.info('well-submit', 'notify assignee', {
        code: issue.code,
        phone: issue.assigneePhone,
      });
    }
  }

  function applyTypeSubmit(payload, quizData, region, fields, negativeFields) {
    var outcome = evaluateQuiz(quizData, fields, negativeFields);
    payload.status = outcome.status;
    if (outcome.needsAssignee) {
      var assignee = resolveAssignee(region);
      payload.assigneeId = assignee.assigneeId;
      payload.assigneeName = assignee.assigneeName;
      payload.assigneePhone = assignee.assigneePhone;
      if (!assignee.assigneePhone && global.AppLog) {
        AppLog.warn('well-submit', 'no assignee for region', region);
      }
    } else {
      payload.assigneeId = '';
      payload.assigneeName = '';
      payload.assigneePhone = '';
      payload.planDate = '';
      if (payload.well) payload.well.wellPlanDate = '';
    }
    payload.inspectionAllYes = outcome.allYes;
    return payload;
  }

  /**
   * 机井向导提交：写入 status / assignee，并模拟推送
   */
  function applyWellSubmit(payload, quizData, region) {
    return applyTypeSubmit(payload, quizData, region, QUIZ_FIELDS, []);
  }

  /**
   * 道路向导提交：写入 status / assignee，并模拟推送
   */
  function applyRoadSubmit(payload, quizData, region) {
    return applyTypeSubmit(payload, quizData, region, ROAD_STATUS_FIELDS, ROAD_STATUS_NEGATIVE);
  }

  /**
   * 各类型分页向导统一提交规则
   */
  function applyWizardSubmit(payload, quizData, region, type) {
    var cfg = TYPE_QUIZ_CONFIG[type] || { fields: [], negative: [] };
    return applyTypeSubmit(payload, quizData, region, cfg.fields, cfg.negative);
  }

  global.AppWellSubmitRules = {
    QUIZ_FIELDS: QUIZ_FIELDS,
    ROAD_QUIZ_FIELDS: ROAD_QUIZ_FIELDS,
    ROAD_STATUS_FIELDS: ROAD_STATUS_FIELDS,
    ROAD_STATUS_NEGATIVE: ROAD_STATUS_NEGATIVE,
    FOREST_QUIZ_FIELDS: FOREST_QUIZ_FIELDS,
    quizAnswerIndicatesIssue: quizAnswerIndicatesIssue,
    TRANSFORMER_QUIZ_FIELDS: TRANSFORMER_QUIZ_FIELDS,
    TYPE_QUIZ_CONFIG: TYPE_QUIZ_CONFIG,
    QUIZ_PHOTO_OPTIONAL_FIELDS: QUIZ_PHOTO_OPTIONAL_FIELDS,
    quizStepRequiresPhoto: quizStepRequiresPhoto,
    STATUS: STATUS,
    STATUS_LABEL: STATUS_LABEL,
    evaluateQuiz: evaluateQuiz,
    evaluateWellQuiz: evaluateWellQuiz,
    evaluateRoadQuiz: evaluateRoadQuiz,
    evaluateWizardQuiz: evaluateWizardQuiz,
    resolveRegionOrgId: resolveRegionOrgId,
    resolveAssignee: resolveAssignee,
    isAssigneeMatch: isAssigneeMatch,
    notifyAssignee: notifyAssignee,
    applyTypeSubmit: applyTypeSubmit,
    applyWellSubmit: applyWellSubmit,
    applyRoadSubmit: applyRoadSubmit,
    applyWizardSubmit: applyWizardSubmit,
  };
})(window);
