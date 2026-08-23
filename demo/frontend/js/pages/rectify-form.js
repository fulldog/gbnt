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

  function regionIdFrom(street, village) {
    if (!street) return '';
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
          return regionSelect ? regionSelect.getRegion() : { street: '', village: '' };
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
      $('rf-form-title').textContent = editingId ? '编辑问题' : '新增问题';
    }
    if (!engine && global.HSFReportFormEngine) {
      engine = global.HSFReportFormEngine.create({
        idPrefix: 'rf-',
        logScope: 'rectify-form',
        getRegion: function () {
          return regionSelect ? regionSelect.getRegion() : { street: '', village: '' };
        },
      });
    }
    if (!engine) return;
    engine.init();
    if (row) {
      engine.fill(row);
      if (regionSelect) {
        regionSelect.setValue(regionIdFrom(row.street, row.village));
      }
    } else {
      engine.reset();
      if (regionSelect) regionSelect.reset();
    }
    engine.syncTypeBlocks();
    toggle(true);
  }

  function close() {
    toggle(false);
  }

  function submit() {
    var eng = ensureEngine();
    if (!eng) return;
    var session = (global.AppStorage && global.AppStorage.get('session', null)) || {};
    var payload = eng.validateAndCollect(session);
    if (!payload) return;
    if (editingId) {
      delete payload.status;
      global.AppData.updateIssue(editingId, payload);
      global.AppData.pushLog(
        '编辑问题',
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

  function init() {
    var overlay = $('rf-form-overlay');
    if (overlay && overlay.parentNode !== document.body) {
      document.body.appendChild(overlay);
    }
    if (global.HSFRegionTreeSelect && !regionSelect) {
      regionSelect = global.HSFRegionTreeSelect.create('rf-f-region', {
        placeholder: '请选择街道 / 村社区',
        searchPlaceholder: '搜索街道或村/社区',
        includeAll: false,
        expandStreets: true,
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
