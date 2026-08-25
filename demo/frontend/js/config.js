/**
 * 全局配置（栈 B：无 API_BASE_URL）
 */
(function (global) {
  global.AppConfig = {
    appName: '农田专项整治平台',
    storagePrefix: 'hsf:',
    /** [PRD/演示登录] 固定账密 */
    demoAccount: {
      username: 'admin',
      password: '123456',
      name: 'Administrator',
      phone: '13800000000',
      orgId: 'org-gov',
    },
  };
})(window);
