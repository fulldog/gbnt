/**
 * 管理端侧栏导航（供 vben-bridge → HSF_VBEN_MENU）
 */
(function (global) {
  global.HSF_NAV = [
    { id: 'workbench', label: '工作台', icon: 'workplace', path: 'web/workbench.html' },
    { id: 'rectify', label: '专项整改', icon: 'list', path: 'web/rectify.html' },
    {
      id: 'ledger',
      label: '汇总管理',
      icon: 'ledger',
      children: [
        { label: '街道台账', icon: 'ledger', path: 'web/ledger-street.html' },
        { label: '街道排查汇总', icon: 'ledger', path: 'web/ledger-survey.html' },
      ],
    },
    {
      id: 'sys',
      label: '系统配置',
      icon: 'settings',
      children: [
        { label: '组织架构', icon: 'org', path: 'web/sys-org.html' },
        { label: '工作人员', icon: 'users', path: 'web/sys-staff.html' },
        { label: '角色权限', icon: 'shield', path: 'web/sys-roles.html' },
        { label: '数据字典', icon: 'dict', path: 'web/sys-dict.html' },
        { label: '操作日志', icon: 'log', path: 'web/sys-logs.html' },
      ],
    },
  ];
})(window);
