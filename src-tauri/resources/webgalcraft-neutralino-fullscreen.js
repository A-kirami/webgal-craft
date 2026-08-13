(() => {
  let fullscreenActive = false;

  function notifyFullscreenChange(active) {
    if (fullscreenActive === active) return;

    fullscreenActive = active;
    document.dispatchEvent(new Event('fullscreenchange'));
  }

  async function enterFullscreen() {
    await Neutralino.window.setFullScreen();
    notifyFullscreenChange(true);
  }

  async function exitFullscreen() {
    await Neutralino.window.exitFullScreen();
    notifyFullscreenChange(false);
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
    value: enterFullscreen,
    writable: true,
  });
  Object.defineProperty(document, 'exitFullscreen', {
    configurable: true,
    value: exitFullscreen,
    writable: true,
  });

  Neutralino.events.on('ready', async () => {
    notifyFullscreenChange(await Neutralino.window.isFullScreen());
  });
  Neutralino.init();
})();
