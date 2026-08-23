/**
 * Toast — 轻量顶部通知
 * 用法：Toast.show('保存成功');
 *       Toast.show('操作失败', { bg: 'rgba(245,108,108,0.3)', color: '#f56c6c' });
 */
var Toast = {
  show: function(msg, opts) {
    opts = opts || {};
    var el = document.getElementById('tztt-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'tztt-toast';
      el.style.cssText = 'position:fixed;top:-60px;left:50%;transform:translateX(-50%);z-index:9999999;padding:10px 28px;border-radius:8px;font-size:14px;transition:top 0.35s cubic-bezier(0.25,0.8,0.25,1);pointer-events:none;white-space:nowrap;';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.background = opts.bg || 'rgba(64,129,112,0.3)';
    el.style.color = opts.color || '#408170';
    el.style.top = '20px';
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(function() { el.style.top = '-60px'; }, 2000);
  }
};
