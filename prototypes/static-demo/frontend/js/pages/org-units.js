(function () {
  if (!AppNav.requireSession('./login.html')) return;
  AppNav.setBreadcrumb('单位管理', '组织架构');
  AppIcons.injectAll(document);

  var TYPE_MAP = {
    gov: '管委会',
    dept: '行政部门',
    office: '街道办事处',
    street: '街道',
    village: '村',
    community: '社区',
  };

  function orgName(id) {
    var o = AppData.getOrgs().find(function (x) {
      return x.id === id;
    });
    return o ? o.name : '—';
  }

  function render() {
    var tbody = document.querySelector('#orgTable tbody');
    var list = AppData.getOrgs();
    tbody.innerHTML = list
      .map(function (o) {
        return (
          '<tr><td>' +
          o.name +
          '</td><td>' +
          (TYPE_MAP[o.type] || o.type) +
          '</td><td>' +
          (o.parentId ? orgName(o.parentId) : '—') +
          '</td><td><button type="button" class="app-link-btn" data-del="' +
          o.id +
          '">删除</button></td></tr>'
        );
      })
      .join('');
  }

  document.getElementById('btnAddOrg').addEventListener('click', function () {
    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<div class="app-form-row"><label>名称</label><input class="app-input" id="fName" /></div>' +
      '<div class="app-form-row"><label>类型</label><select class="app-select" id="fType">' +
      '<option value="dept">行政部门</option><option value="office">街道办事处</option>' +
      '<option value="street">街道</option><option value="village">村</option><option value="community">社区</option>' +
      '</select></div>' +
      '<div class="app-form-row"><label>上级</label><select class="app-select" id="fParent"></select></div>';
    var sel = wrap.querySelector('#fParent');
    AppData.getOrgs().forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = o.name;
      sel.appendChild(opt);
    });
    AppUI.modal({ title: '新增组织', content: wrap }).then(function (ok) {
      if (!ok) return;
      var name = wrap.querySelector('#fName').value.trim();
      if (!name) {
        AppUI.toast('请填写名称', 'error');
        return;
      }
      var list = AppData.getOrgs();
      list.push({
        id: AppSeed.uid('org'),
        name: name,
        type: wrap.querySelector('#fType').value,
        parentId: wrap.querySelector('#fParent').value,
      });
      AppData.saveOrgs(list);
      AppData.pushLog('新增组织', name);
      AppUI.toast('已保存');
      render();
    });
  });

  document.querySelector('#orgTable').addEventListener('click', function (e) {
    var id = e.target.getAttribute('data-del');
    if (!id) return;
    AppUI.modal({ title: '确认删除', content: '删除后不可恢复，确定吗？' }).then(function (ok) {
      if (!ok) return;
      AppData.saveOrgs(
        AppData.getOrgs().filter(function (o) {
          return o.id !== id;
        })
      );
      AppUI.toast('已删除');
      render();
    });
  });

  render();
})();
