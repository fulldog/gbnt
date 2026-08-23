/**
 * PFF v15 授权树交互（源自 PFF/library/supermarket.html #v15-tree-root）
 */
(function (global) {
  var TICK =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  var MINUS =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4"><line x1="5" y1="12" x2="19" y2="12"></line></svg>';

  function setBoxState(box, checked, indeterminate) {
    if (!box) return;
    box.classList.toggle("checked", !!checked && !indeterminate);
    box.classList.toggle("indeterminate", !!indeterminate);
    if (indeterminate) box.innerHTML = MINUS;
    else if (checked) box.innerHTML = TICK;
    else box.innerHTML = "";
  }

  function cascadeDescendants(authNode, isChecked) {
    if (!authNode) return;
    var inline = authNode.querySelector(":scope > .auth-actions-inline");
    if (inline) {
      inline.querySelectorAll(".auth-checkbox").forEach(function (child) {
        setBoxState(child, isChecked, false);
      });
    }
    var subList = authNode.nextElementSibling;
    if (subList && subList.classList.contains("auth-sub-list")) {
      subList.querySelectorAll(".auth-checkbox").forEach(function (child) {
        setBoxState(child, isChecked, false);
      });
    }
  }

  global.v15ToggleFold = function (btn) {
    btn.classList.toggle("collapsed");
    var authNode = btn.closest(".auth-node");
    if (authNode) {
      var subList = authNode.nextElementSibling;
      if (subList && subList.classList.contains("auth-sub-list")) {
        subList.classList.toggle("collapsed");
      }
    }
  };

  global.v15ToggleCheck = function (box) {
    var isChecked = box.classList.toggle("checked");
    box.classList.remove("indeterminate");
    box.innerHTML = isChecked ? TICK : "";

    var authNode = box.closest(".auth-node");
    if (authNode) {
      cascadeDescendants(authNode, isChecked);
    }

    v15UpdateParent(box);
  };

  global.v15ToggleLabel = function (label) {
    var e = global.event || (arguments.length > 1 ? arguments[1] : null);
    if (e) e.stopPropagation();

    var authNode = label.closest(".auth-node");
    if (!authNode) return;

    var arrow = authNode.querySelector(":scope > .auth-arrow");
    if (arrow && !arrow.classList.contains("hidden")) {
      v15ToggleFold(arrow);
    } else {
      var box = authNode.querySelector(":scope > .auth-checkbox");
      if (box) v15ToggleCheck(box);
    }
  };

  global.v15ToggleNode = function (e, node) {
    var target = e.target || e.srcElement;
    if (target.closest(".auth-checkbox") || target.closest(".auth-arrow") || target.closest(".auth-label")) {
      return;
    }
    var label = node.querySelector(".auth-label");
    if (label) v15ToggleLabel(label);
  };

  function syncParentFromSiblings(parentBox, siblingBoxes) {
    var checkedCount = 0;
    var indeterminateCount = 0;
    var totalCount = siblingBoxes.length;
    siblingBoxes.forEach(function (box) {
      if (box.classList.contains("checked")) checkedCount++;
      if (box.classList.contains("indeterminate")) indeterminateCount++;
    });
    if (checkedCount === totalCount && totalCount > 0) {
      setBoxState(parentBox, true, false);
    } else if (checkedCount > 0 || indeterminateCount > 0) {
      setBoxState(parentBox, false, true);
    } else {
      setBoxState(parentBox, false, false);
    }
  }

  function v15UpdateParent(currentBox) {
    var inline = currentBox.closest(".auth-actions-inline");
    if (inline) {
      var rowNode = inline.closest(".auth-node--row");
      if (rowNode) {
        var rowBox = rowNode.querySelector(":scope > .auth-checkbox");
        var actionBoxes = inline.querySelectorAll(".auth-checkbox");
        syncParentFromSiblings(rowBox, actionBoxes);
        v15UpdateParent(rowBox);
      }
      return;
    }

    var parentList = currentBox.closest(".auth-sub-list");
    if (!parentList) return;

    var parentLi = parentList.parentElement;
    var parentNode = parentLi.querySelector(":scope > .auth-node");
    var parentBox = parentNode ? parentNode.querySelector(":scope > .auth-checkbox") : null;
    if (!parentBox) return;

    var siblingBoxes;
    if (parentList.classList.contains("horizontal-actions")) {
      siblingBoxes = parentList.querySelectorAll(":scope > .auth-node .auth-checkbox");
    } else {
      siblingBoxes = parentList.querySelectorAll(":scope > li > .auth-node--row > .auth-checkbox, :scope > li > .auth-node:not(.auth-node--row) > .auth-checkbox");
    }

    syncParentFromSiblings(parentBox, siblingBoxes);
    v15UpdateParent(parentBox);
  }

  global.v15CollectPermKeys = function (root) {
    if (!root) return [];
    var keys = [];
    root.querySelectorAll(".auth-checkbox.checked[data-perm]").forEach(function (box) {
      var k = box.getAttribute("data-perm");
      if (k) keys.push(k);
    });
    return keys;
  };

  global.v15ApplyPermKeys = function (root, selected) {
    if (!root) return;
    var sel = {};
    (selected || []).forEach(function (k) {
      sel[k] = true;
    });
    root.querySelectorAll(".auth-checkbox[data-perm]").forEach(function (box) {
      var on = !!sel[box.getAttribute("data-perm")];
      setBoxState(box, on, false);
    });
    root.querySelectorAll(".auth-checkbox[data-perm]").forEach(function (box) {
      v15UpdateParent(box);
    });
  };
})(window);
