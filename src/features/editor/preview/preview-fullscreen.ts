// 预览全屏的窗口侧处理：把 iframe 的元素全屏折算成窗口全屏，并串行执行窗口动作。
//
// iframe 与编辑器跨源，引擎在 iframe 里拿不到窗口权限，元素全屏只铺满 webview，窗口全屏得由编辑器
// 这一侧自己叫。
//
// Windows 上从最大化窗口进无边框全屏时，tao 不会清掉最大化状态，客户端区停在任务栏之上，底部会留下
// 一条未绘制的黑边（tao#1087）。补正只能让窗口在进入全屏那一刻不是最大化：先退窗口全屏，再离开最大化，
// 最后重新进全屏；退出时把最大化还原。
//
// 需要 core:window:allow-set-fullscreen / allow-maximize / allow-unmaximize（capabilities/desktop.json）。

/** 窗口接口：Tauri 的 WebviewWindow 结构上满足它，单独写出来是为了注入假窗口断言调用顺序。 */
export interface PreviewFullscreenWindowLike {
  isMaximized(): Promise<boolean>
  maximize(): Promise<void>
  setFullscreen(value: boolean): Promise<void>
  unmaximize(): Promise<void>
}

export interface PreviewFullscreenDriver {
  /** 每次 fullscreenchange 调用一次 */
  notify(fullscreenActive: boolean): void
  /** 面板卸载时调用：把预览带来的窗口形态收干净 */
  dispose(): Promise<void>
}

export function createPreviewFullscreenDriver(
  appWindow: PreviewFullscreenWindowLike,
  onError?: (error: unknown) => void,
): PreviewFullscreenDriver {
  /** 最新事件要求的窗口形态；同一形态下的重复事件靠它去重 */
  let desiredFullscreen = false
  /** 窗口全屏已经确认收敛到的形态：窗口动作成功才推进，失败时留在原处，交给后续事件或 dispose 重试 */
  let appliedFullscreen = false
  /** 补正时取消过最大化，还欠一次还原 */
  let owesMaximizeRestore = false
  let disposed = false
  /** 窗口动作串行执行：快速进出全屏或卸载都不会让两次动作交错 */
  let queue = Promise.resolve()

  function scheduleSync(): void {
    queue = queue.then(syncWindow).catch((error: unknown) => {
      onError?.(error)
    })
  }

  /**
   * 把窗口收敛到当前要求的形态。动作执行时才读 desiredFullscreen，队列里排着的动作不会用过期的决策；
   * 卸载后不再动窗口，交给 dispose 收尾。
   */
  async function syncWindow(): Promise<void> {
    if (disposed || desiredFullscreen === appliedFullscreen) {
      return
    }

    if (desiredFullscreen) {
      await enterWindowFullscreen()
      appliedFullscreen = true
      return
    }

    await appWindow.setFullscreen(false)
    appliedFullscreen = false
    if (owesMaximizeRestore) {
      await appWindow.maximize()
      owesMaximizeRestore = false
    }
  }

  async function enterWindowFullscreen(): Promise<void> {
    // 形态必须在动窗口之前问：这时窗口还没被这次全屏碰过，答案就是进全屏前的样子
    const wasMaximized = await appWindow.isMaximized().catch((error: unknown) => {
      onError?.(error)
      return false
    })

    if (!wasMaximized) {
      await appWindow.setFullscreen(true)
      return
    }

    owesMaximizeRestore = true
    await appWindow.setFullscreen(false)
    await appWindow.unmaximize()
    await appWindow.setFullscreen(true)
  }

  return {
    notify(fullscreenActive) {
      if (disposed || fullscreenActive === desiredFullscreen) {
        return
      }

      desiredFullscreen = fullscreenActive
      scheduleSync()
    },

    async dispose() {
      disposed = true
      await queue

      if (!appliedFullscreen && !owesMaximizeRestore) {
        return
      }

      try {
        await appWindow.setFullscreen(false)
        if (owesMaximizeRestore) {
          await appWindow.maximize()
        }
      } catch (error) {
        onError?.(error)
      }
    },
  }
}
