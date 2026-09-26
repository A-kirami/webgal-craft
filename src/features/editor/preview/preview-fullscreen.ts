// 预览全屏的窗口侧处理：把 iframe 的全屏状态折算成窗口动作，并串行执行。
//
// Windows 上 Tauri 会把「webview 里有全屏元素」映射成窗口全屏，而从最大化窗口进无边框全屏时
// tao 不会清掉最大化状态，客户端区停在任务栏之上，底部会留下一条未绘制的黑边（tao#1087）。
// 补正只能让窗口在进入全屏那一刻不是最大化：先退窗口全屏，再离开最大化，最后重新进全屏。
//
// 需要 core:window:allow-set-fullscreen / allow-maximize / allow-unmaximize（capabilities/desktop.json）。

/** 一次 fullscreenchange 之后，窗口这边要做的唯一一件事。 */
export type PreviewFullscreenAction =
  | { kind: 'none' }
  | { kind: 'enter-fullscreen' }
  | { kind: 'leave-fullscreen' }
  | { kind: 'correct-maximized' }
  | { kind: 'restore-maximized' }

/** 上一次算出来的状态。 */
export interface PreviewFullscreenStatus {
  /** 预览 iframe 现在是不是全屏元素 */
  mirrored: boolean
  /** 窗口形态被预览改过（取消过最大化），还欠一次还原 */
  corrected: boolean
}

export interface PreviewFullscreenInput {
  /** 预览 iframe 现在是不是全屏元素 */
  fullscreenActive: boolean
  /** 进入全屏之前窗口是不是最大化 */
  windowWasMaximized: boolean
}

export interface PreviewFullscreenTransition extends PreviewFullscreenStatus {
  action: PreviewFullscreenAction
}

/** 窗口接口：Tauri 的 WebviewWindow 结构上就满足它，单独写出来是为了注入假实现断言顺序。 */
export interface PreviewFullscreenWindow {
  isMaximized(): Promise<boolean>
  maximize(): Promise<void>
  onResized(handler: () => void): Promise<() => void>
  setFullscreen(value: boolean): Promise<void>
  unmaximize(): Promise<void>
}

export interface PreviewFullscreenDriver {
  /** 每次 fullscreenchange 调用一次 */
  notify(fullscreenActive: boolean): void
  /** 面板卸载时调用：把预览带来的窗口形态收干净 */
  dispose(): Promise<void>
}

/** 折算状态与动作；windowWasMaximized 必须是进入全屏之前的形态。 */
export function previewFullscreenTransition(
  previous: PreviewFullscreenStatus,
  input: PreviewFullscreenInput,
): PreviewFullscreenTransition {
  // 状态没变（同一状态下的重复事件）就什么都不做
  if (input.fullscreenActive === previous.mirrored) {
    return { ...previous, action: { kind: 'none' } }
  }

  if (input.fullscreenActive) {
    return input.windowWasMaximized
      ? { mirrored: true, corrected: true, action: { kind: 'correct-maximized' } }
      : { mirrored: true, corrected: false, action: { kind: 'enter-fullscreen' } }
  }

  return {
    mirrored: false,
    corrected: false,
    action: previous.corrected ? { kind: 'restore-maximized' } : { kind: 'leave-fullscreen' },
  }
}

/** 执行动作；两个补正动作都先退窗口全屏，顺序不能换（见文件头）。 */
export async function applyPreviewFullscreenAction(
  appWindow: PreviewFullscreenWindow,
  action: PreviewFullscreenAction,
): Promise<void> {
  switch (action.kind) {
    case 'enter-fullscreen': {
      await appWindow.setFullscreen(true)
      return
    }
    case 'leave-fullscreen': {
      await appWindow.setFullscreen(false)
      return
    }
    case 'correct-maximized': {
      await appWindow.setFullscreen(false)
      await appWindow.unmaximize()
      await appWindow.setFullscreen(true)
      return
    }
    case 'restore-maximized': {
      await appWindow.setFullscreen(false)
      await appWindow.maximize()
      return
    }
    default: {
      return
    }
  }
}

/**
 * 接上窗口，返回一个只在 editor 侧驱动窗口的驱动器。
 *
 * 窗口动作串行执行：快速进出全屏或面板卸载都不会让两次动作交错，失败时保留「窗口形态由预览改过」
 * 的所有权，交给 dispose 兜底。
 */
export function createPreviewFullscreenDriver(
  appWindow: PreviewFullscreenWindow,
  onError?: (error: unknown) => void,
): PreviewFullscreenDriver {
  let status: PreviewFullscreenStatus = { mirrored: false, corrected: false }
  let windowWasMaximized = false
  let needsWindowCleanup = false
  let queue = Promise.resolve()
  let unlistenResize: (() => void) | undefined
  let disposed = false

  // 全屏那一次 resize 正是要修的形态变化，只在非全屏时记录
  function syncWindowWasMaximized(): void {
    if (status.mirrored) {
      return
    }

    void appWindow.isMaximized()
      .then((maximized) => {
        windowWasMaximized = maximized
      })
      .catch(() => {
        // 问不到就按非最大化处理
      })
  }

  function run(action: PreviewFullscreenAction): void {
    queue = queue
      .catch(() => undefined)
      .then(async () => {
        try {
          await applyPreviewFullscreenAction(appWindow, action)
        } catch (error) {
          needsWindowCleanup = true
          if (action.kind === 'restore-maximized') {
            status = { ...status, corrected: true }
          }
          onError?.(error)
        }
      })
  }

  syncWindowWasMaximized()
  void appWindow.onResized(syncWindowWasMaximized)
    .then((unlisten) => {
      if (disposed) {
        unlisten()
        return
      }
      unlistenResize = unlisten
    })
    .catch((error: unknown) => {
      onError?.(error)
    })

  return {
    notify(fullscreenActive) {
      if (disposed) {
        return
      }

      const next = previewFullscreenTransition(status, { fullscreenActive, windowWasMaximized })
      status = { mirrored: next.mirrored, corrected: next.corrected }
      if (next.action.kind !== 'none') {
        run(next.action)
      }
    },
    async dispose() {
      disposed = true
      unlistenResize?.()
      await queue.catch(() => undefined)

      if (!needsWindowCleanup && !status.mirrored && !status.corrected) {
        return
      }

      try {
        await appWindow.setFullscreen(false)
        if (status.corrected) {
          await appWindow.maximize()
        }
      } catch (error) {
        onError?.(error)
      }
    },
  }
}
