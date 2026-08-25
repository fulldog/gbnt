/**
 * 系统管理 · 数据字典：左排查类型 + 右选项字段 + 选项值（对齐街道专项排查台账）
 */
(function (global) {
  var A = global.TzttAdmin;
  var TABLE_ID = "tblDictItems";
  var COLS = ["序号", "选项名称", "选项值", "排序号", "创建时间", "操作"];
  var DICT_VERSION = 2;
  var SEED_CREATED = "2026/01/08 09:00:00";
  var YES_NO_OPTS = [
    { label: "是", value: "yes" },
    { label: "否", value: "no" },
  ];

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function H(s) {
    return A && A.escapeHtml ? A.escapeHtml(s) : escapeHtml(s);
  }

  function buildHsfDictSeed() {
    var types = [
      { id: "dt_well", name: "机井", code: "well", sort: 1 },
      { id: "dt_road", name: "道路", code: "road", sort: 2 },
      { id: "dt_bridge", name: "桥涵", code: "bridge", sort: 3 },
      { id: "dt_forest", name: "林网", code: "forest", sort: 4 },
      { id: "dt_transformer", name: "变压器", code: "transformer", sort: 5 },
    ];
    var fieldDefs = [
      { typeId: "dt_well", key: "buildKind", label: "新建/配套", sort: 1, options: [{ label: "新建", value: "new" }, { label: "配套", value: "match" }] },
      { typeId: "dt_well", key: "waterOut", label: "机井是否出水", sort: 2, options: YES_NO_OPTS },
      { typeId: "dt_well", key: "pipeOk", label: "管道是否按要求连接", sort: 3, options: YES_NO_OPTS },
      { typeId: "dt_well", key: "wiringOk", label: "走线是否规范", sort: 4, options: YES_NO_OPTS },
      { typeId: "dt_well", key: "boxOk", label: "配电箱及电表等设施是否完好", sort: 5, options: YES_NO_OPTS },
      { typeId: "dt_well", key: "coverOk", label: "井台、井盖是否完整", sort: 6, options: YES_NO_OPTS },
      { typeId: "dt_well", key: "transformerOk", label: "变压器是否正常使用", sort: 7, options: YES_NO_OPTS },
      { typeId: "dt_road", key: "hasShoulder", label: "路肩", sort: 1, options: YES_NO_OPTS },
      { typeId: "dt_road", key: "hasAsh", label: "灰土层", sort: 2, options: YES_NO_OPTS },
      { typeId: "dt_bridge", key: "kind", label: "设施类型", sort: 1, options: [{ label: "桥", value: "bridge" }, { label: "涵", value: "culvert" }, { label: "闸", value: "gate" }] },
      { typeId: "dt_forest", key: "brokenBelt", label: "林带是否断带", sort: 1, options: YES_NO_OPTS },
      { typeId: "dt_forest", key: "deadTrees", label: "是否有枯死木", sort: 2, options: YES_NO_OPTS },
      { typeId: "dt_forest", key: "pest", label: "是否发现病虫害", sort: 3, options: YES_NO_OPTS },
      { typeId: "dt_transformer", key: "voltage", label: "电压等级", sort: 1, options: [{ label: "10kV", value: "10kv" }, { label: "0.4kV", value: "0.4kv" }] },
      { typeId: "dt_transformer", key: "powered", label: "是否通电", sort: 2, options: YES_NO_OPTS },
      { typeId: "dt_transformer", key: "deviceOk", label: "设备是否完好", sort: 3, options: YES_NO_OPTS },
      { typeId: "dt_transformer", key: "cabinetOk", label: "配电设施是否完好", sort: 4, options: YES_NO_OPTS },
      { typeId: "dt_transformer", key: "illegalWire", label: "是否私拉乱接", sort: 5, options: YES_NO_OPTS },
    ];
    var fields = [];
    var items = [];
    fieldDefs.forEach(function (fd) {
      var typeCode = fd.typeId.replace("dt_", "");
      var fieldId = "df_" + typeCode + "_" + fd.key;
      fields.push({
        id: fieldId,
        typeId: fd.typeId,
        key: fd.key,
        label: fd.label,
        sort: fd.sort,
      });
      (fd.options || []).forEach(function (opt, idx) {
        items.push({
          id: "di_" + fieldId + "_" + opt.value,
          typeId: fd.typeId,
          fieldId: fieldId,
          label: opt.label,
          value: opt.value,
          sort: idx + 1,
          created: SEED_CREATED,
        });
      });
    });
    return { version: DICT_VERSION, types: types, fields: fields, items: items };
  }

  var SEED = buildHsfDictSeed();

  function isHsfDictModel(raw) {
    if (!raw || !Array.isArray(raw.types) || !Array.isArray(raw.fields) || !Array.isArray(raw.items)) return false;
    return raw.version === DICT_VERSION && raw.types.some(function (t) {
      return t && t.id === "dt_well";
    });
  }

  function loadModel() {
    var raw = global.LadsStorage.get("sysDictModel", null);
    if (!isHsfDictModel(raw)) {
      raw = buildHsfDictSeed();
      global.LadsStorage.set("sysDictModel", raw);
    }
    return {
      types: raw.types.slice().sort(function (a, b) {
        return (Number(a.sort) || 0) - (Number(b.sort) || 0);
      }),
      fields: raw.fields.slice().sort(function (a, b) {
        return (Number(a.sort) || 0) - (Number(b.sort) || 0);
      }),
      items: raw.items.slice(),
    };
  }

  function saveModel(model) {
    global.LadsStorage.set("sysDictModel", {
      version: DICT_VERSION,
      types: model.types,
      fields: model.fields,
      items: model.items,
    });
  }

  var state = {
    activeTypeId: "",
    activeFieldId: "",
    typeKw: "",
    itemNameKw: "",
    itemValKw: "",
    page: 1,
    pageSize: 10,
    treeCollapsed: false,
  };

  var typeModal = { data: null, isEdit: false, sync: null };
  var itemModal = { data: null, isEdit: false, sync: null, typeId: "", fieldId: "" };

  function formatNow() {
    var d = new Date();
    function p(n) {
      return (n < 10 ? "0" : "") + n;
    }
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
  }

  function showTypeFormError(msg) {
    var err = document.getElementById("sdt-form-error");
    if (!err) return;
    if (msg) {
      err.textContent = msg;
      err.style.display = "block";
    } else {
      err.textContent = "";
      err.style.display = "none";
    }
  }

  function showItemFormError(msg) {
    var err = document.getElementById("sdi-form-error");
    if (!err) return;
    if (msg) {
      err.textContent = msg;
      err.style.display = "block";
    } else {
      err.textContent = "";
      err.style.display = "none";
    }
  }

  function bindDictModalsOnce() {
    if (bindDictModalsOnce._done) return;
    bindDictModalsOnce._done = true;
    var typeBtn = document.getElementById("sdTypeSaveBtn");
    if (typeBtn) typeBtn.addEventListener("click", saveTypeFromModal);
    var itemBtn = document.getElementById("sdItemSaveBtn");
    if (itemBtn) itemBtn.addEventListener("click", saveItemFromModal);
  }

  function openTypeModal(existing, sync) {
    bindDictModalsOnce();
    var isEdit = !!existing;
    var data = existing || { id: "dt_" + Date.now(), name: "", code: "", sort: 99 };
    typeModal.data = data;
    typeModal.isEdit = isEdit;
    typeModal.sync = sync;

    var titleEl = document.getElementById("modalDictTypeEditTitle");
    if (titleEl) titleEl.textContent = isEdit ? "修改字典类型" : "新增字典类型";

    var nameEl = document.getElementById("sdt-name");
    if (nameEl) nameEl.value = data.name || "";

    var codeEl = document.getElementById("sdt-code");
    if (codeEl) codeEl.value = data.code || "";

    var sortEl = document.getElementById("sdt-sort");
    if (sortEl) sortEl.value = String(data.sort != null ? data.sort : 99);

    showTypeFormError("");
    if (typeof openModal === "function") openModal("modalDictTypeEdit");
    else if (nameEl) nameEl.focus();
  }

  function saveTypeFromModal() {
    var data = typeModal.data;
    var isEdit = typeModal.isEdit;
    var sync = typeModal.sync;
    if (!data) return;

    var name = document.getElementById("sdt-name") ? document.getElementById("sdt-name").value.trim() : "";
    var code = document.getElementById("sdt-code") ? document.getElementById("sdt-code").value.trim() : "";
    var sortRaw = document.getElementById("sdt-sort") ? document.getElementById("sdt-sort").value : "99";
    var sort = Number(sortRaw);

    if (!name || !code) {
      showTypeFormError("请填写字典名称和编码。");
      return;
    }
    var model = loadModel();
    var dup = model.types.some(function (t) {
      return t.code === code && t.id !== data.id;
    });
    if (dup) {
      showTypeFormError("字典编码已存在。");
      return;
    }
    var next = { id: data.id, name: name, code: code, sort: isNaN(sort) ? 99 : sort };
    var ix = model.types.findIndex(function (t) {
      return t.id === data.id;
    });
    if (ix >= 0) model.types[ix] = next;
    else model.types.unshift(next);
    saveModel(model);
    if (!state.activeTypeId) state.activeTypeId = next.id;
    global.LadsBus.emit("toast", { text: isEdit ? "已保存字典类型" : "已新增字典类型" });
    if (typeof closeModal === "function") closeModal("modalDictTypeEdit");
    if (sync) sync();
  }

  function openItemModal(existing, typeId, fieldId, sync) {
    bindDictModalsOnce();
    var isEdit = !!existing;
    var data = existing || {
      id: "di_" + Date.now(),
      typeId: typeId,
      fieldId: fieldId,
      label: "",
      value: "",
      sort: 1,
      created: formatNow(),
    };
    itemModal.data = data;
    itemModal.isEdit = isEdit;
    itemModal.sync = sync;
    itemModal.typeId = typeId;
    itemModal.fieldId = fieldId;

    var titleEl = document.getElementById("modalDictItemEditTitle");
    if (titleEl) titleEl.textContent = isEdit ? "修改选项" : "新增选项";

    var labelEl = document.getElementById("sdi-label");
    if (labelEl) labelEl.value = data.label || "";

    var valueEl = document.getElementById("sdi-value");
    if (valueEl) valueEl.value = data.value || "";

    var sortEl = document.getElementById("sdi-sort");
    if (sortEl) sortEl.value = String(data.sort != null ? data.sort : 1);

    showItemFormError("");
    if (typeof openModal === "function") openModal("modalDictItemEdit");
    else if (labelEl) labelEl.focus();
  }

  function saveItemFromModal() {
    var data = itemModal.data;
    var isEdit = itemModal.isEdit;
    var sync = itemModal.sync;
    var typeId = itemModal.typeId;
    var fieldId = itemModal.fieldId;
    if (!data) return;

    var label = document.getElementById("sdi-label") ? document.getElementById("sdi-label").value.trim() : "";
    var value = document.getElementById("sdi-value") ? document.getElementById("sdi-value").value.trim() : "";
    var sortRaw = document.getElementById("sdi-sort") ? document.getElementById("sdi-sort").value : "1";
    var sort = Number(sortRaw);

    if (!label || !value) {
      showItemFormError("请填写选项名称和值。");
      return;
    }
    if (!fieldId) {
      showItemFormError("请先选择字段。");
      return;
    }
    var model = loadModel();
    var dup = model.items.some(function (x) {
      return x.fieldId === fieldId && x.value === value && x.id !== data.id;
    });
    if (dup) {
      showItemFormError("该字段下选项值已存在。");
      return;
    }
    var next = {
      id: data.id,
      typeId: data.typeId || typeId,
      fieldId: data.fieldId || fieldId,
      label: label,
      value: value,
      sort: isNaN(sort) ? 1 : sort,
      created: data.created || formatNow(),
    };
    var ix = model.items.findIndex(function (x) {
      return x.id === data.id;
    });
    if (ix >= 0) model.items[ix] = next;
    else model.items.unshift(next);
    saveModel(model);
    global.LadsBus.emit("toast", { text: isEdit ? "已保存" : "已新增选项" });
    if (typeof closeModal === "function") closeModal("modalDictItemEdit");
    if (sync) sync();
  }


  global.sdGoPage = function (p) {
    var page = Number(p) || 1;
    if (page < 1) page = 1;
    state.page = page;
    var root = document.getElementById("sys-admin-root");
    var w = root && root.querySelector(".sys-dict-root");
    if (w && w._sdSync) w._sdSync();
  };

  function buildTypeListHtml(types) {
    if (!types.length) return '<div class="sys-dict-empty">暂无排查类型</div>';
    return types
      .map(function (t) {
        return (
          '<button type="button" class="sys-dict-type-btn' +
          (t.id === state.activeTypeId ? " is-active" : "") +
          '" data-type-id="' +
          escapeHtml(t.id) +
          '"><span class="sys-dict-type-name">' +
          escapeHtml(t.name) +
          "</span></button>"
        );
      })
      .join("");
  }

  function buildFieldListHtml(fields) {
    if (!fields.length) return '<div class="sys-dict-empty">该类型暂无选项字段</div>';
    return fields
      .map(function (f) {
        return (
          '<button type="button" class="sys-dict-field-btn' +
          (f.id === state.activeFieldId ? " is-active" : "") +
          '" data-field-id="' +
          escapeHtml(f.id) +
          '"><span class="sys-dict-field-name">' +
          escapeHtml(f.label) +
          "</span></button>"
        );
      })
      .join("");
  }

  function activeFieldLabel(model) {
    var field = (model.fields || []).find(function (f) {
      return f.id === state.activeFieldId;
    });
    return field ? field.label : "选项";
  }

  var TOOL_ICON_SEARCH =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';
  var TOOL_ICON_REFRESH =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>';
  var TOOL_ICON_FULLSCREEN =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>';
  var TOOL_ICON_COL_SETTINGS =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>';

  var sdColDocClickBound = false;

  function sdTh(label, extraCls, widthPx) {
    var cls = extraCls ? extraCls + " " : "";
    return (
      '<th class="' +
      cls +
      '" style="width:' +
      widthPx +
      'px">' +
      '<div class="th-flex-container"><div class="th-title">' +
      escapeHtml(label) +
      '</div><div class="th-divider"></div></div></th>'
    );
  }

  function dictTableTheadHtml() {
    return (
      '<thead id="' +
      TABLE_ID +
      '-head"><tr>' +
      sdTh("序号", "col-fixed-left", 60) +
      sdTh("选项名称", "", 140) +
      sdTh("选项值", "", 140) +
      sdTh("排序号", "", 80) +
      sdTh("创建时间", "", 160) +
      sdTh("操作", "col-fixed-right", 100) +
      "</tr></thead>"
    );
  }

  function buildSyncHtml(typeListHtml, fieldListHtml, fieldTitle) {
    return (
      '<div class="sd-shell' +
      (state.treeCollapsed ? " sd-shell--tree-collapsed" : "") +
      '">' +
      '<aside class="sys-dict-left" aria-label="排查类型">' +
      '<div class="sys-dict-left__head">' +
      '<input id="sd-type-kw" class="sys-org-tree__input" type="search" placeholder="输入类型名称搜索" value="' +
      escapeHtml(state.typeKw) +
      '" />' +
      '</div>' +
      '<div class="sys-dict-left__body" id="sd-type-list">' +
      (typeListHtml || '') +
      '</div></aside>' +
      '<button type="button" class="sys-org-tree__toggle' +
      (state.treeCollapsed ? " sys-org-tree__toggle--collapsed" : "") +
      '" id="sd-tree-toggle" title="' +
      (state.treeCollapsed ? "展开排查类型" : "收起排查类型") +
      '" aria-expanded="' +
      (!state.treeCollapsed ? "true" : "false") +
      '">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '</button>' +
      '<div class="dm-right sys-dict-main">' +
      '<div class="sd-field-strip" id="sd-field-strip" aria-label="选项字段">' +
      (fieldListHtml || '') +
      '</div>' +
      '<div class="dm-panel dm-panel--filters">' +
      '<div class="filter-bar" id="sdFilterBar" data-fb-collapse-after="2" data-fb-show-toggle="true">' +
      '<div class="filter-bar__grid">' +
      '<div class="filter-bar__cell"><div class="filter-bar__cell-inner"><label class="filter-bar__label" for="sd-name">选项名称</label><div class="filter-bar__control"><input id="sd-name" type="text" placeholder="请输入" value="' +
      escapeHtml(state.itemNameKw) +
      '" /></div></div></div>' +
      '<div class="filter-bar__cell"><div class="filter-bar__cell-inner"><label class="filter-bar__label" for="sd-val">选项值</label><div class="filter-bar__control"><input id="sd-val" type="text" placeholder="请输入" value="' +
      escapeHtml(state.itemValKw) +
      '" /></div></div></div>' +
      '<div class="filter-bar__cell filter-bar__cell--actions"><div class="filter-bar__actions">' +
      '<button type="button" class="filter-bar__btn filter-bar__btn--ghost" id="sd-reset">重置</button>' +
      '<button type="button" class="filter-bar__btn filter-bar__btn--primary" id="sd-search">查询</button>' +
      '<span class="filter-bar__toggle-wrap" hidden><button type="button" class="filter-bar__toggle" data-fb-toggle aria-expanded="false"><span class="filter-bar__toggle-text">展开</span><span class="filter-bar__chev"><svg class="filter-bar__chev-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span></button></span>' +
      '</div></div></div></div></div>' +
      '<div class="dm-panel table-combined-box" id="combined-table-sd">' +
      '<div id="section-table-header">' +
      '<div id="table-tools-sd">' +
      '<div class="tools-left-head"><span class="tools-left-title">' + escapeHtml(fieldTitle || "选项") + '</span></div>' +
      '<div class="tools-right-ops">' +
      '<button type="button" class="tool-btn-primary" id="sd-item-add">' +
      '<svg viewBox="0 0 24 24" style="width:14px;stroke:#fff;" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> 新增选项' +
      '</button>' +
      '<div class="tool-icon-btn" id="sd-toggle-filter" title="显示/隐藏筛选">' + TOOL_ICON_SEARCH + '</div>' +
      '<div class="tool-icon-btn" id="sd-refresh" title="刷新表格">' + TOOL_ICON_REFRESH + '</div>' +
      '<div class="tool-icon-btn" id="sd-fullscreen" title="全屏查看">' + TOOL_ICON_FULLSCREEN + '</div>' +
      '<div class="tool-icon-btn" id="sd-col-settings" title="列设置">' + TOOL_ICON_COL_SETTINGS + '</div>' +
      '<div class="col-settings-panel" id="sd-col-panel">' +
      '<div class="col-settings-title">可展示字段</div>' +
      '<div id="sd-col-list-container"></div></div>' +
      '</div></div></div>' +
      '<div id="section-table-body"><div class="fixed-table-container" id="sd-scroll-wrap">' +
      '<table class="vben-table-std dl-table" id="' + TABLE_ID + '">' +
      dictTableTheadHtml() +
      '<tbody id="' + TABLE_ID + '-body"></tbody>' +
      '</table></div></div>' +
      '<div id="section-pagination" class="section-pagination"></div></div></div></div>'
    );
  }

  function debugDictLayout(reason) {
    if (global.SdLayoutDebug && global.SdLayoutDebug.snapshot) {
      global.SdLayoutDebug.snapshot(reason);
    }
  }

  function renderPaginationBar(total) {
    if (global.TzttSysPagination) {
      global.TzttSysPagination.render("section-pagination", total, state.page, state.pageSize, "sdGoPage", function (size) {
        state.pageSize = size;
        state.page = 1;
        var root = document.getElementById("sys-admin-root");
        var w = root && root.querySelector(".sys-dict-root");
        if (w && w._sdSync) w._sdSync();
      });
      return;
    }
    if (typeof renderPagination === "function") {
      renderPagination("section-pagination", total, state.page, state.pageSize, "sdGoPage");
    }
  }

  function renderTable(pageRows, total) {
    var tbody = document.getElementById(TABLE_ID + "-body");
    if (!tbody) return;
    var colspan = COLS.length;
    if (!pageRows.length) {
      tbody.innerHTML =
        '<tr><td colspan="' + colspan + '" style="text-align:center;padding:40px;color:#999">暂无数据</td></tr>';
      if (A && A.syncRowColClasses) A.syncRowColClasses(TABLE_ID);
      var sdRoot = document.getElementById("sys-admin-root");
      var sdWrap = sdRoot && sdRoot.querySelector(".sys-dict-root");
      if (sdWrap && sdWrap._sdRebuildColList) sdWrap._sdRebuildColList();
      renderPaginationBar(0);
      return;
    }
    tbody.innerHTML = pageRows
      .map(function (r, idx) {
        var serial = total - (state.page - 1) * state.pageSize - idx;
        var serialStr = String(serial);
        if (serialStr.length < 2) serialStr = "0" + serialStr;
        return (
          "<tr>" +
          '<td class="col-fixed-left">' +
          H(serialStr) +
          '</td><td class="text-sm">' +
          H(r.label) +
          '</td><td class="text-sm">' +
          H(r.value) +
          '</td><td class="text-sm">' +
          H(String(r.sort != null ? r.sort : "")) +
          '</td><td class="text-sm">' +
          H(r.created || "—") +
          '</td><td class="col-actions col-fixed-right sys-dict-td-actions"><div class="dl-actions">' +
          '<button type="button" class="dl-link sd-edit" data-id="' +
          H(r.id) +
          '">修改</button>' +
          '<button type="button" class="dl-link sd-del" data-id="' +
          H(r.id) +
          '">删除</button></div></td></tr>'
        );
      })
      .join("");
    if (A && A.syncRowColClasses) A.syncRowColClasses(TABLE_ID);
    var sdRoot2 = document.getElementById("sys-admin-root");
    var sdWrap2 = sdRoot2 && sdRoot2.querySelector(".sys-dict-root");
    if (sdWrap2 && sdWrap2._sdRebuildColList) sdWrap2._sdRebuildColList();
    renderPaginationBar(total);
  }

  function initSdTableChrome(wrap) {
    var table = document.getElementById(TABLE_ID);
    var btnCol = wrap.querySelector("#sd-col-settings");
    var colPanel = wrap.querySelector("#sd-col-panel");
    var colListWrap = wrap.querySelector("#sd-col-list-container");
    if (!table || !colListWrap) return;

    function buildColList() {
      var headers = Array.from(table.querySelectorAll("thead th"));
      colListWrap.innerHTML = headers
        .map(function (th, idx) {
          var titleEl = th.querySelector(".th-title");
          var label = titleEl ? titleEl.textContent.trim() : (th.textContent || "").trim();
          var fixed = th.classList.contains("col-fixed-left") || th.classList.contains("col-fixed-right");
          var hidden = th.style.display === "none";
          return (
            '<div class="col-list-item">' +
            '<input type="checkbox"' +
            (hidden ? "" : " checked") +
            ' id="sd-chk-' +
            idx +
            '" data-idx="' +
            idx +
            '"' +
            (fixed ? " disabled" : "") +
            ">" +
            '<label for="sd-chk-' +
            idx +
            '" style="cursor:pointer;flex:1;">' +
            H(label) +
            "</label></div>"
          );
        })
        .join("");
    }

    buildColList();
    wrap._sdRebuildColList = buildColList;

    if (btnCol && colPanel) {
      btnCol.onclick = function (e) {
        e.stopPropagation();
        colPanel.classList.toggle("show");
      };
      colPanel.onclick = function (e) {
        e.stopPropagation();
      };
    }

    if (!sdColDocClickBound) {
      sdColDocClickBound = true;
      document.addEventListener("click", function () {
        var panel = document.querySelector("#sd-col-panel.show");
        if (panel) panel.classList.remove("show");
      });
    }

    colListWrap.onchange = function (e) {
      var target = e.target;
      if (!target.dataset || target.dataset.idx === undefined) return;
      var idx = parseInt(target.dataset.idx, 10);
      var show = target.checked;
      var cells = table.querySelectorAll("tr > *:nth-child(" + (idx + 1) + ")");
      cells.forEach(function (c) {
        c.style.display = show ? "" : "none";
      });
    };

    function updateTableShadow() {
      var scrollWrap = wrap.querySelector("#sd-scroll-wrap");
      if (!scrollWrap) return;
      var sl = scrollWrap.scrollLeft;
      var max = scrollWrap.scrollWidth - scrollWrap.clientWidth;
      scrollWrap.classList.toggle("is-scrolling-left", sl > 0);
      scrollWrap.classList.toggle("is-scrolling-right", sl < max - 1);
    }
    wrap._sdUpdateTableShadow = updateTableShadow;
    if (!wrap._sdScrollShadowBound) {
      wrap._sdScrollShadowBound = true;
      wrap.addEventListener("scroll", function (e) {
        if (e.target && e.target.id === "sd-scroll-wrap") updateTableShadow();
      }, true);
      window.addEventListener("resize", updateTableShadow);
    }
    setTimeout(updateTableShadow, 200);
  }

  function render(root) {
    root.innerHTML = "";
    var wrap = document.createElement("div");
    wrap.className = "sys-dict-root";
    root.appendChild(wrap);

    function sync() {
      var model = loadModel();
      var types = model.types.filter(function (t) {
        return !state.typeKw || (t.name + " " + t.code).toLowerCase().indexOf(state.typeKw.toLowerCase()) >= 0;
      });
      if (!state.activeTypeId && types.length) state.activeTypeId = types[0].id;
      if (
        types.length &&
        types.every(function (t) {
          return t.id !== state.activeTypeId;
        })
      ) {
        state.activeTypeId = types[0].id;
      }

      var fields = model.fields.filter(function (f) {
        return f.typeId === state.activeTypeId;
      });
      if (!state.activeFieldId && fields.length) state.activeFieldId = fields[0].id;
      if (
        fields.length &&
        fields.every(function (f) {
          return f.id !== state.activeFieldId;
        })
      ) {
        state.activeFieldId = fields[0].id;
      }
      if (!fields.length) state.activeFieldId = "";

      var rows = model.items
        .filter(function (it) {
          if (state.activeFieldId && it.fieldId !== state.activeFieldId) return false;
          if (!state.activeFieldId && state.activeTypeId && it.typeId !== state.activeTypeId) return false;
          if (state.itemNameKw && String(it.label || "").indexOf(state.itemNameKw) < 0) return false;
          if (state.itemValKw && String(it.value || "").indexOf(state.itemValKw) < 0) return false;
          return true;
        })
        .sort(function (a, b) {
          return (Number(a.sort) || 0) - (Number(b.sort) || 0);
        });

      var total = rows.length;
      var pages = Math.max(1, Math.ceil(total / state.pageSize));
      if (state.page > pages) state.page = pages;
      var start = (state.page - 1) * state.pageSize;
      var pageRows = rows.slice(start, start + state.pageSize);

      wrap.innerHTML = buildSyncHtml(buildTypeListHtml(types), buildFieldListHtml(fields), activeFieldLabel(model));
      if (global.FilterBar) global.FilterBar.init(wrap.querySelector("#sdFilterBar"));
      renderTable(pageRows, total);
      initSdTableChrome(wrap);
      debugDictLayout("sync");
    }

    wrap._sdState = state;
    wrap._sdSync = sync;

    wrap.addEventListener("click", function (e) {
      var t = e.target;
      function closest(sel) {
        return t.closest ? t.closest(sel) : null;
      }
      var typeBtn = closest("[data-type-id]");
      if (typeBtn) {
        state.activeTypeId = typeBtn.getAttribute("data-type-id");
        state.activeFieldId = "";
        state.page = 1;
        sync();
        return;
      }
      var fieldBtn = closest("[data-field-id]");
      if (fieldBtn) {
        state.activeFieldId = fieldBtn.getAttribute("data-field-id");
        state.page = 1;
        sync();
        return;
      }
      if (closest("#sd-tree-toggle")) {
        state.treeCollapsed = !state.treeCollapsed;
        sync();
        return;
      }
      if (closest("#sd-search")) {
        state.itemNameKw = wrap.querySelector("#sd-name") ? wrap.querySelector("#sd-name").value.trim() : "";
        state.itemValKw = wrap.querySelector("#sd-val") ? wrap.querySelector("#sd-val").value.trim() : "";
        state.page = 1;
        sync();
        return;
      }
      if (closest("#sd-reset")) {
        state.itemNameKw = "";
        state.itemValKw = "";
        state.page = 1;
        sync();
        return;
      }
      if (closest("#sd-toggle-filter")) {
        var filterPanel = wrap.querySelector(".dm-right.sys-dict-main .dm-panel--filters");
        if (filterPanel) filterPanel.style.display = filterPanel.style.display === "none" ? "" : "none";
        debugDictLayout("toggle-filter");
        return;
      }
      if (closest("#sd-refresh")) {
        var run = A && A.wrapRefresh ? A.wrapRefresh(sync) : sync;
        run();
        return;
      }
      if (closest("#sd-fullscreen")) {
        var container = document.getElementById("sdPageRoot");
        if (!container) return;
        var isFull = container.classList.toggle("vben-table-fullscreen");
        document.body.style.overflow = isFull ? "hidden" : "";
        if (wrap._sdUpdateTableShadow) setTimeout(wrap._sdUpdateTableShadow, 400);
        debugDictLayout("fullscreen");
        return;
      }
      if (closest("#sd-item-add")) {
        if (!state.activeTypeId) return global.LadsBus.emit("toast", { text: "请先选择排查类型" });
        if (!state.activeFieldId) return global.LadsBus.emit("toast", { text: "请先选择选项字段" });
        return openItemModal(null, state.activeTypeId, state.activeFieldId, sync);
      }
      if (closest(".sd-edit")) {
        var btn = closest(".sd-edit");
        var id = btn.getAttribute("data-id");
        var model2 = loadModel();
        var row = model2.items.find(function (x) {
          return x.id === id;
        });
        if (row) openItemModal(row, row.typeId, row.fieldId, sync);
        return;
      }
      if (closest(".sd-del")) {
        var btnDel = closest(".sd-del");
        var did = btnDel.getAttribute("data-id");
        if (!did) return;
        global.LadsUi.confirm("确认删除该选项吗？", function () {
          var model3 = loadModel();
          model3.items = model3.items.filter(function (x) {
            return x.id !== did;
          });
          saveModel(model3);
          global.LadsBus.emit("toast", { text: "已删除" });
          sync();
        });
      }
    });

    wrap.addEventListener("input", function (e) {
      if (e.target.id === "sd-type-kw") {
        state.typeKw = e.target.value.trim();
        sync();
      }
    });

    sync();
    debugDictLayout("mount");
  }

  global.LadsModules = global.LadsModules || {};
  global.LadsModules.sysDict = {
    title: "字典管理",
    subtitle: "系统管理 · 数据字典",
    render: render,
  };
})(window);
