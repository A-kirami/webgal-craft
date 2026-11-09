((nativeFullscreen) => {
  const invoke = window.__TAURI_INTERNALS__.invoke;
  const fullscreenElement = Object.getOwnPropertyDescriptor(Document.prototype, 'fullscreenElement').get;
  const requestFullscreen = Element.prototype.requestFullscreen;
  const exitFullscreen = document.exitFullscreen;

  window.close = () => invoke('exit_game');

  function setRootFullscreen(active) {
    if (nativeFullscreen === active) return Promise.resolve();
    return new Promise((resolve, reject) => {
      function onChange(event) {
        if (event.detail !== active) return;
        window.removeEventListener('webgal:window-fullscreen', onChange);
        resolve();
      }
      window.addEventListener('webgal:window-fullscreen', onChange);
      invoke('set_window_fullscreen', { active }).catch((error) => {
        window.removeEventListener('webgal:window-fullscreen', onChange);
        reject(error);
      });
    });
  }

  // 保留元素全屏的浏览器实现，仅补齐原生窗口启动/系统切换的全屏状态。
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => fullscreenElement.call(document) || (nativeFullscreen ? document.documentElement : null),
  });
  Object.defineProperty(Element.prototype, 'requestFullscreen', {
    configurable: true,
    writable: true,
    value: function (options) {
      if (this === document.documentElement) return setRootFullscreen(true);
      return requestFullscreen.call(this, options);
    },
  });
  Object.defineProperty(document, 'exitFullscreen', {
    configurable: true,
    value: function () {
      if (fullscreenElement.call(document) || !nativeFullscreen) return exitFullscreen.call(document);
      return setRootFullscreen(false);
    },
  });
  window.addEventListener('webgal:window-fullscreen', (event) => {
    if (nativeFullscreen === event.detail) return;
    nativeFullscreen = event.detail;
    if (!fullscreenElement.call(document)) document.dispatchEvent(new Event('fullscreenchange'));
  });
})(__WEBGAL_INITIAL_FULLSCREEN__);
