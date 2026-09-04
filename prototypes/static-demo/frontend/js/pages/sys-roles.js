(function () {
  if (!AppNav.requireSession('./login.html')) return;
  AppNav.setBreadcrumb('系统配置', '角色权限');
  AppIcons.injectAll(document);
  document.querySelector('#roleTable tbody').innerHTML =
    '<tr><td>管理员</td><td>全部菜单与配置</td><td>全组织</td></tr>' +
    '<tr><td>工作人员</td><td>上报 / 待办 / 整改</td><td>本组织及下级（演示不强制拦截）</td></tr>';
})();
