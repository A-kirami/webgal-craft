(() => {
  let fullscreenActive = false;

  window.close = Neutralino.app.exit;

  function notifyFullscreenChange(active) {
    if (fullscreenActive === active) return;

    fullscreenActive = active;
    document.dispatchEvent(new Event('fullscreenchange'));
  }

  Object.defineProperties(document, {
    fullscreenElement: {
      configurable: true,
      get: () => fullscreenActive ? document.documentElement : null,
    },
    fullscreenEnabled: {
      configurable: true,
      get: () => true,
    },
  });

  Object.defineProperty(Element.prototype, 'requestFullscreen', {
    configurable: true,
    value: Neutralino.window.setFullScreen,
    writable: true,
  });
  Object.defineProperty(document, 'exitFullscreen', {
    configurable: true,
    value: Neutralino.window.exitFullScreen,
    writable: true,
  });

  Neutralino.events.on('windowFullScreenEnter', () => notifyFullscreenChange(true));
  Neutralino.events.on('windowFullScreenExit', () => notifyFullscreenChange(false));
  Neutralino.events.on('ready', async () => {
    notifyFullscreenChange(await Neutralino.window.isFullScreen());
  });
  Neutralino.init();
})();
