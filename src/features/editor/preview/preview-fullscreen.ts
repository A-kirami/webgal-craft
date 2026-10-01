// 预览全屏的编辑器侧：把 iframe 的元素全屏折算成窗口会话，并维护「进入前的窗口形态」。
//
// 窗口形态的决策在 Rust 侧（src-tauri/src/commands/preview_fullscreen.rs）：Windows 上 tauri-runtime-wry
// 会把元素全屏镜像成窗口全屏，元素全屏结束时还会自己退出窗口全屏，只有窗口的拥有者能把形态收干净。
// 这里只做两件事：
//
// - 采样进入元素全屏前的窗口形态，进入时交给 Rust；
// - 元素全屏期间不采样：镜像造成的窗口全屏不能当成窗口本来的形态。

import type { PreviewWindowShape } from '~/commands/preview-fullscreen'

/** 窗口接口：Tauri 的 WebviewWindow 结构上满足它，单独写出来是为了注入假窗口断言调用顺序。 */
export interface PreviewFullscreenWindowLike {
  isFullscreen(): Promise<boolean>
  isMaximized(): Promise<boolean>
  onResized(handler: () => void): Promise<() => void>
}

/** 窗口侧会话：Rust 命令封装结构上就满足它。 */
export interface PreviewFullscreenSession {
  enter(resting: PreviewWindowShape): Promise<void>
  /** 退出会话，返回还原后的窗口形态 */
  exit(): Promise<PreviewWindowShape>
}

export interface PreviewFullscreenDriver {
  /** 元素全屏状态变化时调用一次 */
  notify(fullscreenActive: boolean): void
  /** 面板卸载时调用：结束进行中的会话、停止采样 */
  dispose(): Promise<void>
}

export function createPreviewFullscreenDriver(
  appWindow: PreviewFullscreenWindowLike,
  session: PreviewFullscreenSession,
  onError?: (error: unknown) => void,
): PreviewFullscreenDriver {
  /** 进入元素全屏前的窗口形态；还没采到样时为 undefined */
  let restingShape: PreviewWindowShape | undefined
  /** 元素全屏进行中 */
  let elementFullscreenActive = false
  let disposed = false
  let unlistenResize: (() => void) | undefined
  /** 采样序号：只有最后一次采样算数 */
  let sampleRevision = 0
  /** 最近一次采样的落定，进入全屏时要等它 */
  let pendingSample: Promise<void> = Promise.resolve()
  /** 会话命令串行执行：快速进出全屏或卸载都不会让两次会话交错 */
  let queue = Promise.resolve()

  function run(step: () => Promise<void>): void {
    queue = queue.then(step).catch((error: unknown) => {
      onError?.(error)
    })
  }

  async function readWindowShape(): Promise<PreviewWindowShape> {
    const [fullscreen, maximized] = await Promise.all([
      appWindow.isFullscreen(),
      appWindow.isMaximized(),
    ])

    return { fullscreen, maximized }
  }

  /** 采样进入前的形态；采样期间进了元素全屏或面板已卸载就丢弃结果 */
  function sampleRestingShape(): void {
    if (disposed || elementFullscreenActive) {
      return
    }

    const revision = ++sampleRevision
    pendingSample = readWindowShape()
      .then((shape) => {
        if (revision !== sampleRevision || elementFullscreenActive || disposed) {
          return
        }

        restingShape = shape
      })
      .catch((error: unknown) => {
        onError?.(error)
      })
  }

  async function enterSession(): Promise<void> {
    // 采样值可能还在路上：那次查询发生在进入全屏之前，等它比现采更接近真实形态
    await pendingSample
    // 没有可信样本（采样失败）时按「不是全屏」处理：镜像可能已经把窗口改成全屏，
    // 那种全屏不是窗口本来的形态；最大化标志镜像不会动，可以现读
    const resting = restingShape ?? {
      fullscreen: false,
      maximized: await appWindow.isMaximized(),
    }

    if (disposed || !elementFullscreenActive) {
      return
    }

    await session.enter(resting)
  }

  async function exitSession(): Promise<void> {
    // 退出后窗口就是还原到的形态，直接作为下次进入前的形态，免得重新采样时被镜像带偏
    restingShape = await session.exit()
  }

  void sampleRestingShape()
  void appWindow.onResized(() => {
    void sampleRestingShape()
  })
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
      if (disposed || fullscreenActive === elementFullscreenActive) {
        return
      }

      elementFullscreenActive = fullscreenActive
      run(fullscreenActive ? enterSession : exitSession)
    },

    async dispose() {
      disposed = true
      unlistenResize?.()

      if (elementFullscreenActive) {
        elementFullscreenActive = false
        run(exitSession)
      }

      await queue
    },
  }
}
