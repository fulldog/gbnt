/**
 * 系统管理 · 组织架构：单位树表（本地存储 LadsStorage.sysDepartments）
 */
(function (global) {
  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatSlash(created) {
    var t = String(created || "").trim();
    if (!t) return "—";
    if (t.indexOf("/") >= 0) return t;
    var m = t.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2}:\d{2})/);
    if (m) return m[1] + "/" + m[2] + "/" + m[3] + " " + m[4];
    return t;
  }

  var TREE_CHEV_SVG =
    '<svg class="dm-tree-chev" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">' +
    '<path fill="currentColor" d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>' +
    "</svg>";

  function rootDeptId(list) {
    var r = list.find(function (d) {
      return !d.parentId;
    });
    return r ? r.id : "org-gov";
  }

  function isVillageLevel(d) {
    var t = String((d && d.remark) || "").trim();
    return t === "village" || t === "community";
  }

  function loadDepts() {
    var raw = global.LadsStorage.get("sysDepartments", []);
    if (!raw || !Array.isArray(raw) || raw.length === 0) return [];
    return raw.slice();
  }

  function saveDepts(list) {
    global.LadsStorage.set("sysDepartments", list);
  }

  function sortDepts(list) {
    return list.slice().sort(function (a, b) {
      var sa = a.sort != null ? Number(a.sort) : 0;
      var sb = b.sort != null ? Number(b.sort) : 0;
      if (sa !== sb) return sa - sb;
      return String(a.name).localeCompare(String(b.name), "zh");
    });
  }

  function byParent(list) {
    var map = {};
    list.forEach(function (d) {
      var pid = d.parentId || "";
      if (!map[pid]) map[pid] = [];
      map[pid].push(d);
    });
    Object.keys(map).forEach(function (k) {
      map[k] = sortDepts(map[k]);
    });
    return map;
  }

  function collectDescendants(id, byP) {
    var out = {};
    function walk(n) {
      out[n] = true;
      var ch = byP[n] || [];
      ch.forEach(function (c) {
        walk(c.id);
      });
    }
    walk(id);
    return out;
  }

  var state = {
    expanded: {},
    treeSeg: "expand",
  };

  var branchModal = { data: null, isEdit: false, list: [], onConfirm: null, defaultParentId: "" };

  var TREE_CHEV_SVG =
    '<svg class="dm-tree-chev" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">' +
    '<path fill="currentColor" d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>' +
    "</svg>";

  function defaultSortForParent(list, parentId) {
    var pid = parentId || "";
    var max = 0;
    list.forEach(function (d) {
      if ((d.parentId || "") !== pid) return;
      var s = d.sort != null ? Number(d.sort) : 0;
      if (s > max) max = s;
    });
    return max + 1 || 1;
  }

  function buildParentOptionsHtml(list, selectedId, excludeSet) {
    var map = byParent(list);
    var html = "";
    function walk(pid, depth) {
      var children = map[pid] || [];
      children.forEach(function (d) {
        if (excludeSet && excludeSet[d.id]) return;
        var indent = "";
        for (var i = 0; i < depth; i++) indent += "\u3000";
        if (depth > 0) indent += "\u2514 ";
        html +=
          '<option value="' +
          escapeHtml(d.id) +
          '"' +
          (d.id === selectedId ? " selected" : "") +
          ">" +
          escapeHtml(indent + d.name) +
          "</option>";
        walk(d.id, depth + 1);
      });
    }
    walk("", 0);
    return html;
  }

  function showBranchError(msg) {
    var err = document.getElementById("branchEditError");
    if (!err) return;
    if (msg) {
      err.textContent = msg;
      err.style.display = "block";
    } else {
      err.textContent = "";
      err.style.display = "none";
    }
  }

  function render(root) {
    var wrap = document.createElement("div");
    root.appendChild(wrap);

    function sync() {
      var list = loadDepts();
      var map = byParent(list);
      var rows = [];
      function walk(pid, depth) {
        var children = map[pid] || [];
        children.forEach(function (d) {
          rows.push({ d: d, depth: depth });
          var exp = state.expanded[d.id] !== false;
          if (exp && (map[d.id] || []).length) walk(d.id, depth + 1);
        });
      }
      walk("", 0);

      var body =
        rows.length === 0
          ? '<tr><td colspan="4" style="text-align:center;color:#8aa4c8;padding:24px">暂无单位，请点击「新增单位」</td></tr>'
          : rows
              .map(function (r, idx) {
                var d = r.d;
                var depth = r.depth;
                var kids = map[d.id] || [];
                var hasKids = kids.length > 0;
                var exp = state.expanded[d.id] !== false;
                var pad = depth * 12;
                var chev = hasKids
                  ? '<span class="dm-tree-toggle dm-tree-toggle--has' +
                    (exp ? " is-expanded" : "") +
                    '" data-exp="' +
                    escapeHtml(d.id) +
                    '" role="button" tabindex="-1" aria-label="' +
                    (exp ? "收起" : "展开") +
                    '" aria-expanded="' +
                    (exp ? "true" : "false") +
                    '">' +
                    TREE_CHEV_SVG +
                    "</span>"
                  : '<span class="dm-tree-toggle dm-tree-toggle--leaf" aria-hidden="true"></span>';
                var rootId = rootDeptId(list);
                var addDisabled = isVillageLevel(d);
                var addChildBtn =
                  '<button type="button" class="dl-link sys-dept-add-child' +
                  (addDisabled ? ' is-disabled" disabled aria-disabled="true" tabindex="-1"' : '"') +
                  ' data-id="' +
                  escapeHtml(d.id) +
                  '">新增单位</button>';
                return (
                  "<tr>" +
                  '<td class="sys-org-td-name"><div class="sys-org-name-cell" style="padding-left:' +
                  pad +
                  'px">' +
                  chev +
                  '<span class="sys-org-name-text">' +
                  escapeHtml(d.name) +
                  "</span></div></td>" +
                  '<td class="sys-org-td-sort">' +
                  escapeHtml(String(d.sort != null ? d.sort : "")) +
                  "</td>" +
                  "<td>" +
                  escapeHtml(formatSlash(d.created)) +
                  "</td>" +
                  '<td class="sys-org-td-actions"><div class="dl-actions sys-org-actions">' +
                  addChildBtn +
                  '<button type="button" class="dl-link sys-dept-edit" data-id="' +
                  escapeHtml(d.id) +
                  '">修改</button>' +
                  '<button type="button" class="dl-link dl-link--danger sys-dept-del' +
                  (d.id === rootId ? ' is-disabled" disabled aria-disabled="true" tabindex="-1"' : '"') +
                  ' data-id="' +
                  escapeHtml(d.id) +
                  '">删除</button></div></td></tr>'
                );
              })
              .join("");

      var segExpandActive = state.treeSeg !== "collapse";
      wrap.innerHTML =
        '<div class="dm-right biz-page sys-admin-page">' +
        '<div class="dm-panel dl-panel sys-org-page">' +
        '<div class="dl-toolbar dl-toolbar--rich">' +
        '<span class="dl-toolbar__title">单位列表</span>' +
        '<div class="dl-toolbar__actions dl-toolbar__actions--split">' +
        '<div class="vben-segmented-box" id="sys-org-tree-seg" role="tablist" aria-label="单位树展开">' +
        '<div class="seg-item' +
        (segExpandActive ? " active" : "") +
        '" data-org-tree-seg="expand" role="tab" aria-selected="' +
        (segExpandActive ? "true" : "false") +
        '">展开全部</div>' +
        '<div class="seg-item' +
        (segExpandActive ? "" : " active") +
        '" data-org-tree-seg="collapse" role="tab" aria-selected="' +
        (segExpandActive ? "false" : "true") +
        '">折叠全部</div>' +
        "</div>" +
        '<button type="button" class="dl-btn--primary dl-btn--icon-plus" id="sys-dept-add-root"><span class="dl-btn__plus" aria-hidden="true">+</span> 新增单位</button>' +
        "</div></div>" +
        '<div class="dl-table-wrap sys-org-table-wrap"><table class="dl-table sys-org-table"><thead><tr><th>单位名称</th><th class="sys-org-th-sort">排序</th><th>创建时间</th><th class="sys-org-th-actions">操作</th></tr></thead><tbody>' +
        body +
        "</tbody></table></div></div></div>";
    }

    sync();

    function openDeptModal(opts) {
      var existing = opts.existing;
      var list = loadDepts();
      var rootId = rootDeptId(list);
      var defaultParent = opts.defaultParentId != null ? opts.defaultParentId : rootId;
      var isEdit = !!existing;
      var isRootEdit = isEdit && existing && existing.id === rootId;

      var data = existing || {
        id: "dept_" + Date.now(),
        parentId: defaultParent || rootId,
        name: "",
        enabled: true,
        remark: "",
        sort: list.length,
        created: "",
      };
      if (!data.created) {
        var now = new Date();
        function p2(n) {
          return n < 10 ? "0" + n : String(n);
        }
        data.created =
          now.getFullYear() +
          "/" +
          p2(now.getMonth() + 1) +
          "/" +
          p2(now.getDate()) +
          " " +
          p2(now.getHours()) +
          ":" +
          p2(now.getMinutes()) +
          ":" +
          p2(now.getSeconds());
      }

      branchModal.data = data;
      branchModal.isEdit = isEdit;
      branchModal.list = list;
      branchModal.defaultParentId = defaultParent || rootId;

      var titleEl = document.getElementById("modalBranchEditTitle");
      if (titleEl) {
        titleEl.textContent = isEdit ? "修改单位" : "新增单位";
      }

      var nameEl = document.getElementById("branchEditName");
      if (nameEl) nameEl.value = data.name || "";

      var sortEl = document.getElementById("branchEditSort");
      var sortGroup = sortEl ? sortEl.closest(".form-group") : null;
      var pidForSort = isEdit ? data.parentId || rootId : defaultParent || rootId;
      if (sortEl) {
        if (isRootEdit) {
          if (sortGroup) sortGroup.style.display = "none";
        } else {
          if (sortGroup) sortGroup.style.display = "";
          var sortVal = data.sort != null ? Number(data.sort) : defaultSortForParent(list, pidForSort);
          sortEl.value = String(sortVal > 0 ? sortVal : 1);
        }
      }

      var parentGroup = document.getElementById("branchEditParentGroup");
      var parentEl = document.getElementById("branchEditParent");
      if (parentGroup && parentEl) {
        if (isRootEdit) {
          parentGroup.style.display = "none";
          parentEl.innerHTML = "";
        } else {
          parentGroup.style.display = "";
          var pid = isEdit ? data.parentId || rootId : defaultParent || rootId;
          if (!pid || pid === "") pid = rootId;
          var exclude = isEdit && existing ? collectDescendants(existing.id, byParent(list)) : {};
          if (isEdit && existing) exclude[existing.id] = true;
          parentEl.innerHTML = buildParentOptionsHtml(list, pid, exclude);
          if (!parentEl.value) parentEl.value = rootId;
        }
      }

      showBranchError("");
      if (typeof openModal === "function") openModal("modalBranchEdit");
      else if (nameEl) nameEl.focus();
    }

    function saveBranchFromModal() {
      var data = branchModal.data;
      var isEdit = branchModal.isEdit;
      var list = branchModal.list || loadDepts();
      if (!data) return;

      var nameEl = document.getElementById("branchEditName");
      var parentEl = document.getElementById("branchEditParent");
      var sortEl = document.getElementById("branchEditSort");
      var rootId = rootDeptId(list);
      var name = nameEl ? String(nameEl.value || "").trim() : "";
      var isRootEdit = data.id === rootId;
      var parentId = isRootEdit ? "" : parentEl ? parentEl.value || rootId : rootId;
      var sortVal = sortEl ? parseInt(sortEl.value, 10) : 1;

      if (!name) {
        showBranchError("请填写单位名称。");
        if (nameEl) nameEl.focus();
        return;
      }
      if (!isRootEdit && !parentId) {
        showBranchError("请选择上级单位。");
        if (parentEl) parentEl.focus();
        return;
      }
      if (!isRootEdit && (!sortVal || sortVal < 1)) {
        showBranchError("请输入有效的排序（正整数）。");
        if (sortEl) sortEl.focus();
        return;
      }

      var next = {
        id: data.id,
        parentId: parentId,
        name: name,
        enabled: true,
        remark: data.remark || "",
        sort: isRootEdit ? (data.sort != null ? data.sort : 0) : sortVal,
        created: data.created,
      };
      var ix = list.findIndex(function (x) {
        return x.id === next.id;
      });
      if (ix >= 0) list[ix] = next;
      else list.push(next);
      saveDepts(sortDepts(list));
      global.LadsStorage.appendLog(isEdit ? "单位修改" : "单位新增", next.name);
      global.LadsBus.emit("toast", { text: isEdit ? "已保存" : "已新增单位" });
      if (typeof closeModal === "function") closeModal("modalBranchEdit");
      sync();
    }

    function openBranchConfirm(message, onOk) {
      var msgEl = document.getElementById("modalBranchConfirmMsg");
      if (msgEl) msgEl.textContent = message || "确认执行该操作吗？";
      branchModal.onConfirm = typeof onOk === "function" ? onOk : null;
      if (typeof openModal === "function") openModal("modalBranchConfirm");
    }

    var saveBtn = document.getElementById("branchEditSaveBtn");
    if (saveBtn && !saveBtn.getAttribute("data-bound")) {
      saveBtn.setAttribute("data-bound", "1");
      saveBtn.addEventListener("click", saveBranchFromModal);
    }
    var confirmOk = document.getElementById("modalBranchConfirmOk");
    if (confirmOk && !confirmOk.getAttribute("data-bound")) {
      confirmOk.setAttribute("data-bound", "1");
      confirmOk.addEventListener("click", function () {
        var fn = branchModal.onConfirm;
        branchModal.onConfirm = null;
        if (typeof closeModal === "function") closeModal("modalBranchConfirm");
        if (fn) fn();
      });
    }
    var nameInput = document.getElementById("branchEditName");
    if (nameInput && !nameInput.getAttribute("data-bound")) {
      nameInput.setAttribute("data-bound", "1");
      nameInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          saveBranchFromModal();
        }
      });
    }


    wrap.addEventListener("click", function (event) {
      var t = event.target;
      if (t.id === "sys-dept-add-root") {
        openDeptModal({ existing: null, defaultParentId: rootDeptId(loadDepts()) });
        return;
      }
      var treeSeg = t.closest && t.closest("[data-org-tree-seg]");
      if (treeSeg && treeSeg.closest("#sys-org-tree-seg")) {
        var mode = treeSeg.getAttribute("data-org-tree-seg");
        if (mode === "expand") {
          state.expanded = {};
          state.treeSeg = "expand";
        } else if (mode === "collapse") {
          var listSeg = loadDepts();
          var mapSeg = byParent(listSeg);
          listSeg.forEach(function (d) {
            if ((mapSeg[d.id] || []).length) state.expanded[d.id] = false;
          });
          state.treeSeg = "collapse";
        }
        sync();
        return;
      }
      var exp = t.closest && t.closest(".dm-tree-toggle[data-exp]");
      if (exp && exp.getAttribute("data-exp")) {
        var eid = exp.getAttribute("data-exp");
        var open = state.expanded[eid] !== false;
        state.expanded[eid] = !open;
        sync();
        return;
      }
      var addC = t.closest && t.closest(".sys-dept-add-child");
      if (addC && addC.getAttribute("data-id") && !addC.disabled && !addC.classList.contains("is-disabled")) {
        var parentForChild = addC.getAttribute("data-id");
        state.expanded[parentForChild] = true;
        sync();
        openDeptModal({ existing: null, defaultParentId: parentForChild });
        return;
      }
      var ed = t.closest && t.closest(".sys-dept-edit");
      if (ed && ed.getAttribute("data-id")) {
        var eid = ed.getAttribute("data-id");
        var d = loadDepts().find(function (x) {
          return x.id === eid;
        });
        if (d) openDeptModal({ existing: d });
        return;
      }
      var del = t.closest && t.closest(".sys-dept-del");
      if (del && del.getAttribute("data-id")) {
        var did = del.getAttribute("data-id");
        var listDel = loadDepts();
        var rootIdDel = rootDeptId(listDel);
        if (did === rootIdDel) {
          global.LadsBus.emit("toast", { text: "管理中心不允许删除" });
          return;
        }
        var map = byParent(listDel);
        if ((map[did] || []).length) {
          global.LadsBus.emit("toast", { text: "请先删除子下级单位" });
          return;
        }
        openBranchConfirm("确认删除该单位吗？", function () {
          var list = loadDepts().filter(function (x) {
            return x.id !== did;
          });
          saveDepts(list);
          global.LadsStorage.appendLog("单位删除", did);
          global.LadsBus.emit("toast", { text: "已删除" });
          sync();
        });
      }
    });

  }

  global.LadsModules = global.LadsModules || {};
  global.LadsModules.sysOrg = {
    title: "组织架构",
    subtitle: "系统管理 · 组织架构",
    render: render,
  };
})(window);
