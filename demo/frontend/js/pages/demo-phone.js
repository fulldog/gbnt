(function () {
  function boot() {
    var mount = window.HSFDevice && HSFDevice.getMountRoot
      ? HSFDevice.getMountRoot()
      : document.getElementById('app-viewport');
    if (!mount || mount.querySelector('#demoPhoneApp')) return;
    var tpl = document.getElementById('demo-phone-tpl');
    if (!tpl) return;
    mount.appendChild(tpl.content.cloneNode(true));
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
