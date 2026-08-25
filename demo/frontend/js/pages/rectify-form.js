/**
 * 专项整改新增/编辑弹窗（复用上报表单）
 */
(function (global) {
  'use strict';

  var editingId = null;
  var onSaved = null;
  var regionSelect = null;
  var engine = null;

  function $(id) {
    return document.getElementById(id);
  }

  function regionIdFrom(street, village, naturalVillage) {
    if (!street) return '';
    if (naturalVillage && village) {
      return 'natural:' + street + ':' + village + ':' + naturalVillage;
    }
    if (!village) return 'street:' + street;
    return 'village:' + street + ':' + village;
  }

  function toggle(open) {
    var overlay = $('rf-form-overlay');
    if (!overlay) return;
    if (open) {
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    } else {
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      editingId = null;
      if (engine) engine.destroy();
      if (regionSelect) regionSelect.closeDropdown();
    }
  }

  function ensureEngine() {
    if (!global.HSFReportFormEngine) return null;
    if (!engine) {
      engine = global.HSFReportFormEngine.create({
        idPrefix: 'rf-',
        logScope: 'rectify-form',
        getRegion: function () {
          return regionSelect
            ? regionSelect.getRegion()
            : { street: '', village: '', naturalVillage: '' };
        },
      });
    }
    engine.init();
    return engine;
  }

  function open(id, row, savedCb) {
    onSaved = savedCb || null;
    editingId = id || null;
    var overlay = $('rf-form-overlay');
    if (overlay && overlay.parentNode !== document.body) {
      document.body.appendChild(overlay);
    }
    if ($('rf-form-title')) {
      $('rf-form-title').textContent = editingId ? '编辑巡查' : '新增巡查';
    }
    if (!engine && global.HSFReportFormEngine) {
      engine = global.HSFReportFormEngine.create({
        idPrefix: 'rf-',
        logScope: 'rectify-form',
        getRegion: function () {
          return regionSelect
            ? regionSelect.getRegion()
            : { street: '', village: '', naturalVillage: '' };
        },
      });
    }
    if (!engine) return;
    engine.init();
    if (row) {
      engine.fill(row);
      if (regionSelect) {
        regionSelect.setValue(
          regionIdFrom(row.street, row.village, row.naturalVillage)
        );
      }
    } else {
      engine.reset();
      if (regionSelect) regionSelect.reset();
    }
    engine.syncTypeBlocks();
    toggle(true);
    /* 弹层可见后再挂签名，避免 canvas 尺寸为 0 */
    engine.init();
  }

  function close() {
    toggle(false);
  }

  function finishSave(payload) {
    if (editingId) {
      delete payload.status;
      global.AppData.updateIssue(editingId, payload);
      global.AppData.pushLog(
        '编辑巡查',
        global.AppData.TYPE_LABEL[payload.type] + ' · ' + (payload.code || editingId)
      );
      if (global.AppUI) global.AppUI.toast('已保存');
    } else {
      global.AppData.addIssue(payload);
      if (global.AppUI) global.AppUI.toast('已新增');
    }
    close();
    if (typeof onSaved === 'function') onSaved();
  }

  function submit() {
    var eng = ensureEngine();
    if (!eng) return;
    var session = (global.AppStorage && global.AppStorage.get('session', null)) || {};
    var payload = eng.validateAndCollect(session);
    if (!payload) return;

    var confirmBtn = $('rf-form-confirm');
    if (confirmBtn) confirmBtn.disabled = true;

    function done(err) {
      if (confirmBtn) confirmBtn.disabled = false;
      if (err) return;
      finishSave(payload);
    }

    if (global.AppImageCompress && typeof AppImageCompress.compressIssuePayload === 'function') {
      AppImageCompress.compressIssuePayload(payload)
        .then(function (p) {
          payload = p;
          done();
        })
        .catch(function (err) {
          if (global.AppLog) AppLog.error('rectify-form', 'compress before save', err);
          if (global.AppUI) global.AppUI.toast('图片处理失败，请重试', 'error');
          done(err);
        });
      return;
    }

    done();
  }

  function init() {
    var overlay = $('rf-form-overlay');
    if (overlay && overlay.parentNode !== document.body) {
      document.body.appendChild(overlay);
    }
    if (global.HSFRegionTreeSelect && !regionSelect) {
      regionSelect = global.HSFRegionTreeSelect.create('rf-f-region', {
        placeholder: '请选择街道 / 村社区 / 自然村',
        searchPlaceholder: '搜索街道 / 村社区 / 自然村',
        includeAll: false,
        expandStreets: false,
      });
    }
    var cancel = $('rf-form-cancel');
    var confirm = $('rf-form-confirm');
    var closeBtn = $('rf-form-btn-close');
    if (cancel) cancel.onclick = close;
    if (closeBtn) closeBtn.onclick = close;
    if (confirm) confirm.onclick = submit;
    if (overlay) {
      overlay.onclick = function (e) {
        if (e.target === overlay) close();
      };
    }
  }

  global.RectifyForm = { open: open, close: close, init: init };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
