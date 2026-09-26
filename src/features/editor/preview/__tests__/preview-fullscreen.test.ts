import { describe, expect, it, vi } from 'vitest'

import {
  applyPreviewFullscreenAction,
  createPreviewFullscreenDriver,
  previewFullscreenTransition,
} from '../preview-fullscreen'

import type {
  PreviewFullscreenStatus,
  PreviewFullscreenWindow,
} from '../preview-fullscreen'

const IDLE: PreviewFullscreenStatus = { mirrored: false, corrected: false }

interface FakeWindow {
  appWindow: PreviewFullscreenWindow
  calls: string[]
  failOn: (call?: string) => void
  resize: () => void
  setMaximized: (value: boolean) => void
}

/** 假窗口：记录调用顺序，可注入最大化形态与失败点。 */
function createFakeWindow(): FakeWindow {
  const calls: string[] = []
  let failing: string | undefined
  let maximized = false
  let resizeHandler: (() => void) | undefined
  const record = (call: string) => {
    calls.push(call)
    if (failing === call) {
      throw new Error(`失败: ${call}`)
    }
  }

  return {
    calls,
    failOn: (call) => {
      failing = call
    },
    resize: () => resizeHandler?.(),
    setMaximized: (value) => {
      maximized = value
    },
    appWindow: {
      isMaximized: () => Promise.resolve(maximized),
      maximize: () => {
        record('maximize')
        return Promise.resolve()
      },
      onResized: (handler) => {
        resizeHandler = handler
        return Promise.resolve(() => {
          resizeHandler = undefined
        })
      },
      setFullscreen: (value) => {
        record(`setFullscreen(${value})`)
        return Promise.resolve()
      },
      unmaximize: () => {
        record('unmaximize')
        return Promise.resolve()
      },
    },
  }
}

/** 让队列里的窗口动作跑完。 */
function flushQueue(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

describe('previewFullscreenTransition', () => {
  it('普通窗口进入全屏时只把窗口设成全屏', () => {
    const next = previewFullscreenTransition(IDLE, { fullscreenActive: true, windowWasMaximized: false })
    expect(next).toEqual({ mirrored: true, corrected: false, action: { kind: 'enter-fullscreen' } })
  })

  it('最大化窗口进入全屏时补正，并记住退出要还原', () => {
    const next = previewFullscreenTransition(IDLE, { fullscreenActive: true, windowWasMaximized: true })
    expect(next).toEqual({ mirrored: true, corrected: true, action: { kind: 'correct-maximized' } })
  })

  it('补正过之后退出全屏时还原最大化', () => {
    const entered = previewFullscreenTransition(IDLE, { fullscreenActive: true, windowWasMaximized: true })
    const left = previewFullscreenTransition(entered, { fullscreenActive: false, windowWasMaximized: false })
    expect(left).toEqual({ mirrored: false, corrected: false, action: { kind: 'restore-maximized' } })
  })

  it('没补正过退出全屏时只取消窗口全屏', () => {
    const entered = previewFullscreenTransition(IDLE, { fullscreenActive: true, windowWasMaximized: false })
    const left = previewFullscreenTransition(entered, { fullscreenActive: false, windowWasMaximized: false })
    expect(left).toEqual({ mirrored: false, corrected: false, action: { kind: 'leave-fullscreen' } })
  })

  it('状态没变时什么都不做', () => {
    const entered = previewFullscreenTransition(IDLE, { fullscreenActive: true, windowWasMaximized: true })
    const again = previewFullscreenTransition(entered, { fullscreenActive: true, windowWasMaximized: true })
    expect(again).toEqual({ mirrored: true, corrected: true, action: { kind: 'none' } })

    const idle = previewFullscreenTransition(IDLE, { fullscreenActive: false, windowWasMaximized: true })
    expect(idle).toEqual({ mirrored: false, corrected: false, action: { kind: 'none' } })
  })

  it('还原过的最大化不会被第二次退出事件重复还原', () => {
    const entered = previewFullscreenTransition(IDLE, { fullscreenActive: true, windowWasMaximized: true })
    const left = previewFullscreenTransition(entered, { fullscreenActive: false, windowWasMaximized: true })
    expect(previewFullscreenTransition(left, { fullscreenActive: false, windowWasMaximized: true })).toEqual({
      mirrored: false,
      corrected: false,
      action: { kind: 'none' },
    })
  })
})

describe('applyPreviewFullscreenAction', () => {
  it('none 不动窗口', async () => {
    const { calls, appWindow } = createFakeWindow()
    await applyPreviewFullscreenAction(appWindow, { kind: 'none' })
    expect(calls).toEqual([])
  })

  it('普通窗口进出全屏', async () => {
    const { calls, appWindow } = createFakeWindow()
    await applyPreviewFullscreenAction(appWindow, { kind: 'enter-fullscreen' })
    await applyPreviewFullscreenAction(appWindow, { kind: 'leave-fullscreen' })
    expect(calls).toEqual(['setFullscreen(true)', 'setFullscreen(false)'])
  })

  it('补正最大化窗口时先退全屏，再离开最大化，最后重新进全屏', async () => {
    const { calls, appWindow } = createFakeWindow()
    await applyPreviewFullscreenAction(appWindow, { kind: 'correct-maximized' })
    expect(calls).toEqual(['setFullscreen(false)', 'unmaximize', 'setFullscreen(true)'])
  })

  it('还原最大化时先退全屏再最大化', async () => {
    const { calls, appWindow } = createFakeWindow()
    await applyPreviewFullscreenAction(appWindow, { kind: 'restore-maximized' })
    expect(calls).toEqual(['setFullscreen(false)', 'maximize'])
  })

  it('最大化窗口完整走一轮：补正三步加还原两步', async () => {
    const { calls, appWindow } = createFakeWindow()
    let status: PreviewFullscreenStatus = IDLE

    const enter = previewFullscreenTransition(status, { fullscreenActive: true, windowWasMaximized: true })
    status = { mirrored: enter.mirrored, corrected: enter.corrected }
    await applyPreviewFullscreenAction(appWindow, enter.action)

    const leave = previewFullscreenTransition(status, { fullscreenActive: false, windowWasMaximized: true })
    status = { mirrored: leave.mirrored, corrected: leave.corrected }
    await applyPreviewFullscreenAction(appWindow, leave.action)

    expect(calls).toEqual([
      'setFullscreen(false)',
      'unmaximize',
      'setFullscreen(true)',
      'setFullscreen(false)',
      'maximize',
    ])
    expect(status).toEqual({ mirrored: false, corrected: false })
  })
})

describe('createPreviewFullscreenDriver', () => {
  it('普通窗口的全屏进出', async () => {
    const { calls, appWindow } = createFakeWindow()
    const driver = createPreviewFullscreenDriver(appWindow)
    await flushQueue()

    driver.notify(true)
    await flushQueue()
    driver.notify(false)
    await flushQueue()

    expect(calls).toEqual(['setFullscreen(true)', 'setFullscreen(false)'])
  })

  it('最大化窗口：进入补正，退出还原', async () => {
    const { calls, appWindow, setMaximized } = createFakeWindow()
    setMaximized(true)
    const driver = createPreviewFullscreenDriver(appWindow)
    await flushQueue()

    driver.notify(true)
    await flushQueue()
    driver.notify(false)
    await flushQueue()

    expect(calls).toEqual([
      'setFullscreen(false)',
      'unmaximize',
      'setFullscreen(true)',
      'setFullscreen(false)',
      'maximize',
    ])
  })

  it('快速进出时动作串行，不会与未完成的多步动作交错', async () => {
    const { calls, appWindow, setMaximized } = createFakeWindow()
    setMaximized(true)
    const driver = createPreviewFullscreenDriver(appWindow)
    await flushQueue()

    driver.notify(true)
    driver.notify(false)
    await driver.dispose()

    expect(calls).toEqual([
      'setFullscreen(false)',
      'unmaximize',
      'setFullscreen(true)',
      'setFullscreen(false)',
      'maximize',
    ])
  })

  it('重复的全屏事件不重复执行动作', async () => {
    const { calls, appWindow } = createFakeWindow()
    const driver = createPreviewFullscreenDriver(appWindow)
    await flushQueue()

    driver.notify(true)
    driver.notify(true)
    await flushQueue()

    expect(calls).toEqual(['setFullscreen(true)'])
  })

  it('全屏期间不覆盖进入前记录的窗口形态', async () => {
    const { calls, appWindow, resize, setMaximized } = createFakeWindow()
    setMaximized(true)
    const driver = createPreviewFullscreenDriver(appWindow)
    await flushQueue()

    driver.notify(true)
    await flushQueue()
    // 补正过程中窗口已经不在最大化，这一次 resize 不该被当成「用户想要的样子」
    setMaximized(false)
    resize()
    await flushQueue()
    driver.notify(false)
    await flushQueue()

    expect(calls).toContain('maximize')
  })

  it('动作失败时保留还原所有权，卸载时兜底', async () => {
    const { appWindow, calls, failOn, setMaximized } = createFakeWindow()
    setMaximized(true)
    const onError = vi.fn()
    const driver = createPreviewFullscreenDriver(appWindow, onError)
    await flushQueue()

    failOn('unmaximize')
    driver.notify(true)
    await flushQueue()
    expect(onError).toHaveBeenCalledOnce()

    failOn(undefined)
    await driver.dispose()

    // 补正只走了一步，但「窗口形态被预览改过」的所有权还在，卸载时要退全屏并还原最大化
    expect(calls).toContain('setFullscreen(false)')
    expect(calls).toContain('maximize')
  })

  it('还原最大化失败时保留所有权，卸载时再试一次', async () => {
    const { appWindow, calls, failOn, setMaximized } = createFakeWindow()
    setMaximized(true)
    const onError = vi.fn()
    const driver = createPreviewFullscreenDriver(appWindow, onError)
    await flushQueue()

    driver.notify(true)
    await flushQueue()
    failOn('maximize')
    driver.notify(false)
    await flushQueue()
    expect(onError).toHaveBeenCalledOnce()

    failOn(undefined)
    await driver.dispose()

    expect(calls.filter(call => call === 'maximize')).toHaveLength(2)
  })

  it('卸载时仍处于全屏则退出窗口全屏', async () => {
    const { calls, appWindow } = createFakeWindow()
    const driver = createPreviewFullscreenDriver(appWindow)
    await flushQueue()

    driver.notify(true)
    await flushQueue()
    await driver.dispose()

    expect(calls).toEqual(['setFullscreen(true)', 'setFullscreen(false)'])
  })

  it('没动过窗口时卸载不碰窗口', async () => {
    const { calls, appWindow } = createFakeWindow()
    const driver = createPreviewFullscreenDriver(appWindow)
    await flushQueue()

    driver.notify(false)
    await driver.dispose()

    expect(calls).toEqual([])
  })

  it('卸载后不再响应全屏事件', async () => {
    const { calls, appWindow } = createFakeWindow()
    const driver = createPreviewFullscreenDriver(appWindow)
    await flushQueue()

    await driver.dispose()
    driver.notify(true)
    await flushQueue()

    expect(calls).toEqual([])
  })
})
