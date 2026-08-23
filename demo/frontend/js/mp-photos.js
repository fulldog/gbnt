/**
 * 小程序现场照片条（与上报 #rPhotos 同一套 DOM / 样式 / 拍照上传）
 * 用法：AppMpPhotos.attach({ el, photos, max, logScope, previewMeta })
 */
(function (global) {
  function mountHost() {
    return (
      document.querySelector('.app-device__screen') ||
      document.getElementById('app-viewport') ||
      document.body
    );
  }

  function attach(opts) {
    opts = opts || {};
    var el = opts.el;
    var photos = opts.photos;
    if (!el || !photos) {
      if (global.AppLog) AppLog.warn('mp-photos', 'attach missing el/photos');
      return null;
    }
    var max = opts.max || 6;
    var logScope = opts.logScope || 'mp-photos';
    var previewMeta =
      typeof opts.previewMeta === 'function'
        ? opts.previewMeta
        : function () {
            return {};
          };
    var onChange = typeof opts.onChange === 'function' ? opts.onChange : function () {};

    var sheetRoot = null;
    var camRoot = null;
    var camStream = null;
    var albumInput = null;
    var bound = false;

    function ensureAlbumInput() {
      if (albumInput) return albumInput;
      albumInput = document.createElement('input');
      albumInput.type = 'file';
      albumInput.accept = 'image/*';
      albumInput.multiple = true;
      albumInput.hidden = true;
      albumInput.setAttribute('aria-hidden', 'true');
      document.body.appendChild(albumInput);
      albumInput.addEventListener('change', function () {
        appendFiles(albumInput.files);
        albumInput.value = '';
      });
      return albumInput;
    }

    function closeSheet() {
      if (!sheetRoot) return;
      sheetRoot.classList.remove('is-open');
      var root = sheetRoot;
      sheetRoot = null;
      setTimeout(function () {
        if (root.parentNode) root.parentNode.removeChild(root);
      }, 220);
    }

    function stopCamera() {
      if (camStream) {
        camStream.getTracks().forEach(function (t) {
          try {
            t.stop();
          } catch (e) {}
        });
        camStream = null;
      }
      if (camRoot && camRoot.parentNode) {
        camRoot.parentNode.removeChild(camRoot);
      }
      camRoot = null;
    }

    function closePreview() {
      if (global.AppWatermark && typeof AppWatermark.closePreview === 'function') {
        AppWatermark.closePreview();
      }
    }

    function openPreview(src) {
      closePreview();
      if (global.AppWatermark && typeof AppWatermark.openPreview === 'function') {
        AppWatermark.openPreview(src, previewMeta());
      }
    }

    function render() {
      var html = '';
      photos.forEach(function (src, i) {
        html +=
          '<div class="m-report__thumb">' +
          '<img src="' +
          src +
          '" alt="" data-act="preview" data-index="' +
          i +
          '" />' +
          '<button type="button" class="m-report__thumb-del" data-act="del" data-index="' +
          i +
          '" aria-label="删除">' +
          '<span data-icon="close" aria-hidden="true"></span>' +
          '</button></div>';
      });
      if (photos.length < max) {
        html +=
          '<button type="button" class="m-report__add" data-act="add" aria-label="添加照片">' +
          '<span data-icon="plus" aria-hidden="true"></span></button>';
      }
      el.innerHTML = html;
      if (global.AppIcons) AppIcons.injectAll(el);
      onChange();
    }

    function pushPhoto(dataUrl) {
      if (photos.length >= max) {
        AppUI.toast('最多上传' + max + '张', 'warn');
        return;
      }
      photos.push(dataUrl);
      render();
    }

    function appendFiles(fileList) {
      var files = Array.prototype.slice.call(fileList || [], 0).filter(function (f) {
        return f && /^image\//.test(f.type || '');
      });
      var room = max - photos.length;
      if (room <= 0) {
        AppUI.toast('最多上传' + max + '张', 'warn');
        return;
      }
      if (files.length > room) {
        files = files.slice(0, room);
        AppUI.toast('最多上传' + max + '张，已截取前' + room + '张', 'warn');
      }
      if (!files.length) return;

      var chain = Promise.resolve();
      files.forEach(function (file) {
        chain = chain.then(function () {
          return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () {
              photos.push(reader.result);
              render();
              resolve();
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        });
      });
      chain.catch(function () {
        AppUI.toast('图片处理失败', 'error');
      });
    }

    function openCamera() {
      stopCamera();
      closePreview();
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        AppUI.toast('当前环境不支持摄像头', 'error');
        if (global.AppLog) AppLog.warn(logScope, 'getUserMedia unavailable');
        return;
      }

      var facing = 'environment';
      var torchOn = false;
      var pendingSnap = '';
      var host = mountHost();
      var layer = document.createElement('div');
      layer.className = 'm-report__cam';
      layer.setAttribute('role', 'dialog');
      layer.setAttribute('aria-modal', 'true');
      layer.setAttribute('aria-label', '拍照');
      layer.innerHTML =
        '<button type="button" class="m-report__cam-close" data-act="cam-close" aria-label="关闭">' +
        '<span data-icon="close" aria-hidden="true"></span></button>' +
        '<div class="m-report__cam-stage">' +
        '<video class="m-report__cam-video" playsinline autoplay muted></video>' +
        '<img class="m-report__cam-snap" alt="" />' +
        '</div>' +
        '<div class="m-report__cam-bar" data-mode="live"></div>';
      host.appendChild(layer);
      camRoot = layer;
      if (global.AppIcons) AppIcons.injectAll(layer);

      var video = layer.querySelector('.m-report__cam-video');
      var snapImg = layer.querySelector('.m-report__cam-snap');
      var bar = layer.querySelector('.m-report__cam-bar');

      function renderBar(mode) {
        if (mode === 'review') {
          bar.setAttribute('data-mode', 'review');
          bar.innerHTML =
            '<button type="button" class="m-report__cam-text" data-act="cam-retake">取消</button>' +
            '<button type="button" class="m-report__cam-text m-report__cam-text--done" data-act="cam-done">完成</button>';
          return;
        }
        bar.setAttribute('data-mode', 'live');
        bar.innerHTML =
          '<button type="button" class="m-report__cam-side" data-act="cam-flash" aria-label="闪光灯">' +
          '<span data-icon="' +
          (torchOn ? 'flash' : 'flashOff') +
          '" aria-hidden="true"></span></button>' +
          '<button type="button" class="m-report__cam-shutter" data-act="cam-shot" aria-label="拍照"></button>' +
          '<button type="button" class="m-report__cam-side" data-act="cam-flip" aria-label="切换摄像头">' +
          '<span data-icon="switchCam" aria-hidden="true"></span></button>';
        if (global.AppIcons) AppIcons.injectAll(bar);
      }

      function bindStream(stream) {
        if (camStream) {
          camStream.getTracks().forEach(function (t) {
            try {
              t.stop();
            } catch (e) {}
          });
        }
        camStream = stream;
        video.srcObject = stream;
        layer.classList.toggle('is-front', facing === 'user');
        var playRet = video.play();
        if (playRet && typeof playRet.catch === 'function') playRet.catch(function () {});
      }

      function startStream() {
        return navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
      }

      function setTorch(on) {
        var track = camStream && camStream.getVideoTracks()[0];
        if (!track || typeof track.applyConstraints !== 'function') {
          AppUI.toast('当前设备不支持闪光灯', 'warn');
          return Promise.resolve(false);
        }
        return track
          .applyConstraints({ advanced: [{ torch: !!on }] })
          .then(function () {
            return true;
          })
          .catch(function () {
            AppUI.toast('当前设备不支持闪光灯', 'warn');
            return false;
          });
      }

      function enterReview(dataUrl) {
        pendingSnap = dataUrl;
        snapImg.src = dataUrl;
        layer.classList.add('is-review');
        renderBar('review');
      }

      function exitReview() {
        pendingSnap = '';
        snapImg.removeAttribute('src');
        layer.classList.remove('is-review');
        renderBar('live');
      }

      renderBar('live');

      startStream()
        .then(function (stream) {
          bindStream(stream);
          if (global.AppLog) AppLog.info(logScope, 'camera open', { facing: facing });
        })
        .catch(function (err) {
          stopCamera();
          var msg = '无法打开摄像头';
          if (err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
            msg = '请允许使用摄像头后再拍照';
          } else if (err && err.name === 'NotFoundError') {
            msg = '未检测到摄像头';
          }
          AppUI.toast(msg, 'error');
          if (global.AppLog) AppLog.warn(logScope, 'camera fail', err && err.name);
        });

      layer.addEventListener('click', function (e) {
        var t = e.target.closest('[data-act]');
        if (!t) return;
        var act = t.getAttribute('data-act');

        if (act === 'cam-close') {
          stopCamera();
          return;
        }

        if (act === 'cam-flash') {
          var next = !torchOn;
          setTorch(next).then(function (ok) {
            if (!ok) return;
            torchOn = next;
            renderBar('live');
          });
          return;
        }

        if (act === 'cam-flip') {
          facing = facing === 'environment' ? 'user' : 'environment';
          torchOn = false;
          startStream()
            .then(bindStream)
            .then(function () {
              renderBar('live');
              if (global.AppLog) AppLog.info(logScope, 'camera flip', { facing: facing });
            })
            .catch(function () {
              facing = facing === 'environment' ? 'user' : 'environment';
              AppUI.toast('无法切换摄像头', 'warn');
            });
          return;
        }

        if (act === 'cam-shot') {
          if (layer.classList.contains('is-review')) return;
          if (!video.videoWidth) {
            AppUI.toast('画面未就绪，请稍候', 'warn');
            return;
          }
          var canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          var ctx = canvas.getContext('2d');
          if (facing === 'user') {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          enterReview(canvas.toDataURL('image/jpeg', 0.92));
          return;
        }

        if (act === 'cam-retake') {
          exitReview();
          return;
        }

        if (act === 'cam-done') {
          if (!pendingSnap) return;
          var shot = pendingSnap;
          stopCamera();
          pushPhoto(shot);
        }
      });
    }

    function openSheet() {
      closeSheet();
      if (photos.length >= max) {
        AppUI.toast('最多上传' + max + '张', 'warn');
        return;
      }
      var host = mountHost();
      var mask = document.createElement('div');
      mask.className = 'm-sheet';
      mask.setAttribute('role', 'dialog');
      mask.setAttribute('aria-modal', 'true');
      mask.setAttribute('aria-label', '添加照片');
      mask.innerHTML =
        '<div class="m-sheet__mask" data-act="cancel"></div>' +
        '<div class="m-sheet__panel">' +
        '<button type="button" class="m-sheet__btn" data-act="camera">拍照</button>' +
        '<button type="button" class="m-sheet__btn" data-act="album">上传</button>' +
        '</div>';
      host.appendChild(mask);
      sheetRoot = mask;
      requestAnimationFrame(function () {
        mask.classList.add('is-open');
      });
      mask.addEventListener('click', function (e) {
        var t = e.target.closest('[data-act]');
        if (!t) return;
        var act = t.getAttribute('data-act');
        if (act === 'cancel') {
          closeSheet();
          return;
        }
        if (act === 'camera') {
          closeSheet();
          openCamera();
          return;
        }
        if (act === 'album') {
          closeSheet();
          ensureAlbumInput().value = '';
          ensureAlbumInput().click();
        }
      });
    }

    function onClick(e) {
      var t = e.target.closest('[data-act]');
      if (!t || !el.contains(t)) return;
      var act = t.getAttribute('data-act');
      var idx = parseInt(t.getAttribute('data-index'), 10);
      if (act === 'add') {
        openSheet();
        return;
      }
      if (act === 'del') {
        e.stopPropagation();
        if (!isNaN(idx)) {
          photos.splice(idx, 1);
          render();
        }
        return;
      }
      if (act === 'preview' && !isNaN(idx) && photos[idx]) {
        openPreview(photos[idx]);
      }
    }

    function destroy() {
      if (bound) {
        el.removeEventListener('click', onClick);
        bound = false;
      }
      closeSheet();
      stopCamera();
      closePreview();
      if (albumInput && albumInput.parentNode) albumInput.parentNode.removeChild(albumInput);
      albumInput = null;
    }

    el.addEventListener('click', onClick);
    bound = true;
    render();

    return {
      render: render,
      destroy: destroy,
      openSheet: openSheet,
      closeSheet: closeSheet,
      stopCamera: stopCamera,
    };
  }

  global.AppMpPhotos = { attach: attach };
})(window);
