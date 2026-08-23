(function () {
  if (!AppNav.requireSession('./login.html')) return;
  AppNav.setBreadcrumb('单位管理', '工作人员');
  AppIcons.injectAll(document);

  function orgName(id) {
    var o = AppData.getOrgs().find(function (x) {
      return x.id === id;
    });
    return o ? o.name : '—';
  }

  function render() {
    var tbody = document.querySelector('#staffTable tbody');
    tbody.innerHTML = AppData.getStaff()
      .map(function (s) {
        return (
          '<tr><td>' +
          s.username +
          '</td><td>' +
          s.name +
          '</td><td>' +
          (s.phone || '—') +
          '</td><td>' +
          orgName(s.orgId) +
          '</td><td>' +
          (s.role === 'admin' ? '管理员' : '工作人员') +
          '</td><td><button type="button" class="app-link-btn" data-del="' +
          s.id +
          '">删除</button></td></tr>'
        );
      })
      .join('');
  }

  document.getElementById('btnAddStaff').addEventListener('click', function () {
    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<div class="app-form-row"><label>账号</label><input class="app-input" id="fUser" /></div>' +
      '<div class="app-form-row"><label>姓名</label><input class="app-input" id="fName" /></div>' +
      '<div class="app-form-row"><label>电话</label><input class="app-input" id="fPhone" /></div>' +
      '<div class="app-form-row"><label>密码</label><input class="app-input" id="fPass" value="123456" /></div>' +
      '<div class="app-form-row"><label>组织</label><select class="app-select" id="fOrg"></select></div>';
    var sel = wrap.querySelector('#fOrg');
    AppData.getOrgs().forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = o.name;
      sel.appendChild(opt);
    });
    AppUI.modal({ title: '新增工作人员', content: wrap }).then(function (ok) {
      if (!ok) return;
      var username = wrap.querySelector('#fUser').value.trim();
      var name = wrap.querySelector('#fName').value.trim();
      if (!username || !name) {
        AppUI.toast('请填写账号和姓名', 'error');
        return;
      }
      var list = AppData.getStaff();
      list.push({
        id: AppSeed.uid('staff'),
        username: username,
        password: wrap.querySelector('#fPass').value || '123456',
        name: name,
        phone: wrap.querySelector('#fPhone').value.trim(),
        orgId: wrap.querySelector('#fOrg').value,
        role: 'staff',
      });
      AppData.saveStaff(list);
      AppData.pushLog('新增人员', name);
      AppUI.toast('已保存');
      render();
    });
  });

  document.querySelector('#staffTable').addEventListener('click', function (e) {
    var id = e.target.getAttribute('data-del');
    if (!id) return;
    AppUI.modal({ title: '确认删除', content: '确定删除该人员？' }).then(function (ok) {
      if (!ok) return;
      AppData.saveStaff(
        AppData.getStaff().filter(function (s) {
          return s.id !== id;
        })
      );
      AppUI.toast('已删除');
      render();
    });
  });

  render();
})();
