// 预览全屏的窗口侧处理：把一次 fullscreenchange 折算成「窗口要不要动、怎么动」。
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
  /** 是否为了让全屏生效而取消过最大化（退出时要还原） */
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
  setFullscreen(value: boolean): Promise<void>
  unmaximize(): Promise<void>
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
