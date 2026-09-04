/**
 * Vben Footer — 底部版权
 */
(function () {
  class VbenFooter extends HTMLElement {
    constructor() {
      super();
      this.render();
    }

    render() {
      var year = new Date().getFullYear();
      this.innerHTML =
        '<div class="vben-footer">' +
        'Copyright © ' +
        year +
        ' 聊城经济技术开发区管委会' +
        '</div>';
    }
  }

  if (!customElements.get('vben-footer')) {
    customElements.define('vben-footer', VbenFooter);
  }
})();
