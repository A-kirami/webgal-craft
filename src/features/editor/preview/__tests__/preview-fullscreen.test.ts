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
  /** 挂起 isMaximized 的应答，之后用 releaseMaximized / rejectMaximized 放行 */
  holdMaximized: () => void
  rejectMaximized: () => void
  /** 放行一个挂起的应答；index 用来乱序放行，验证过期结果被丢弃 */
  releaseMaximized: (value: boolean, index?: number) => void
  resize: () => void
  setMaximized: (value: boolean) => void
}

/** 假窗口：记录调用顺序，可注入最大化形态、挂起形态查询与失败点。 */
function createFakeWindow(): FakeWindow {
  const calls: string[] = []
  let failing: string | undefined
  let maximized = false
  let holding = false
  const held: { reject: (error: unknown) => void, resolve: (value: boolean) => void }[] = []
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
    holdMaximized: () => {
      holding = true
    },
    rejectMaximized: () => {
      held.splice(0, 1)[0]?.reject(new Error('失败: isMaximized'))
    },
    releaseMaximized: (value, index = 0) => {
      held.splice(index, 1)[0]?.resolve(value)
    },
    resize: () => resizeHandler?.(),
    setMaximized: (value) => {
      maximized = value
    },
    appWindow: {
      isMaximized: () =>
        holding
          ? new Promise<boolean>((resolve, reject) => {
              held.push({ reject, resolve })
            })
          : Promise.resolve(maximized),
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

  it('初始形态查询未落定时的全屏事件等查询结果再处理', async () => {
    const { calls, appWindow, holdMaximized, releaseMaximized } = createFakeWindow()
    holdMaximized()
    const driver = createPreviewFullscreenDriver(appWindow)

    driver.notify(true)
    await flushQueue()
    // 形态还没问出来，不能先按「非最大化」把窗口设成全屏
    expect(calls).toEqual([])

    releaseMaximized(true)
    await flushQueue()

    expect(calls).toEqual(['setFullscreen(false)', 'unmaximize', 'setFullscreen(true)'])
  })

  it('形态查询失败时挂起的事件按非最大化处理', async () => {
    const { appWindow, calls, holdMaximized, rejectMaximized, setMaximized } = createFakeWindow()
    setMaximized(true)
    holdMaximized()
    const driver = createPreviewFullscreenDriver(appWindow)

    driver.notify(true)
    await flushQueue()
    rejectMaximized()
    await flushQueue()

    expect(calls).toEqual(['setFullscreen(true)'])
  })

  it('查询在途时只保留最新的全屏事件', async () => {
    const { appWindow, calls, holdMaximized, releaseMaximized } = createFakeWindow()
    holdMaximized()
    const driver = createPreviewFullscreenDriver(appWindow)

    driver.notify(true)
    driver.notify(false)
    releaseMaximized(true)
    await flushQueue()

    // 最后一个事件才是当前状态：进来又立刻退出，本来就没有窗口动作
    expect(calls).toEqual([])
  })

  it('乱序落定的过期形态查询不覆盖最新结果', async () => {
    const { appWindow, calls, holdMaximized, releaseMaximized, resize, setMaximized } = createFakeWindow()
    setMaximized(true)
    holdMaximized()
    const driver = createPreviewFullscreenDriver(appWindow)
    releaseMaximized(true)
    await flushQueue()

    // 两次 resize 各起一次查询，最新一次说「不是最大化」
    resize()
    resize()
    releaseMaximized(false, 1)
    await flushQueue()
    // 最老的一次查询此刻才落定，说「是最大化」，但它已经过期
    releaseMaximized(true)
    await flushQueue()

    driver.notify(true)
    await flushQueue()

    expect(calls).toEqual(['setFullscreen(true)'])
  })

  it('初始查询未落定就卸载时，挂起的事件不再动窗口', async () => {
    const { appWindow, calls, holdMaximized, releaseMaximized } = createFakeWindow()
    holdMaximized()
    const driver = createPreviewFullscreenDriver(appWindow)

    driver.notify(true)
    await driver.dispose()
    releaseMaximized(true)
    await flushQueue()

    expect(calls).toEqual([])
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
