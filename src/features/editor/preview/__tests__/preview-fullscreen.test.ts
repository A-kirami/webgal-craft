import { describe, expect, it, vi } from 'vitest'

import { createPreviewFullscreenDriver } from '../preview-fullscreen'

import type { PreviewFullscreenWindowLike } from '../preview-fullscreen'

interface FakeWindow {
  appWindow: PreviewFullscreenWindowLike
  calls: string[]
  failOn: (call?: string) => void
  /** 挂起 isMaximized 的应答，之后用 releaseMaximized / rejectMaximized 放行 */
  holdMaximized: () => void
  releaseMaximized: (value: boolean) => void
  rejectMaximized: () => void
  setMaximized: (value: boolean) => void
}

/** 假窗口：记录调用顺序，可注入最大化形态、挂起的形态查询与失败点。 */
function createFakeWindow(): FakeWindow {
  const calls: string[] = []
  let failing: string | undefined
  let maximized = false
  let holding = false
  let fulfill: ((value: boolean) => void) | undefined
  let fail: ((error: unknown) => void) | undefined
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
    releaseMaximized: (value) => {
      fulfill?.(value)
    },
    rejectMaximized: () => {
      fail?.(new Error('失败: isMaximized'))
    },
    setMaximized: (value) => {
      maximized = value
    },
    appWindow: {
      isMaximized: () => holding
        ? new Promise<boolean>((resolve, reject) => {
            fulfill = resolve
            fail = reject
          })
        : Promise.resolve(maximized),
      maximize: () => {
        record('maximize')
        return Promise.resolve()
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

describe('createPreviewFullscreenDriver', () => {
  it('普通窗口进入全屏只设窗口全屏，退出只取消窗口全屏', async () => {
    const { appWindow, calls } = createFakeWindow()
    const driver = createPreviewFullscreenDriver(appWindow)

    driver.notify(true)
    await flushQueue()
    driver.notify(false)
    await flushQueue()

    expect(calls).toEqual(['setFullscreen(true)', 'setFullscreen(false)'])
  })

  it('最大化窗口进入全屏时补正三步，退出时还原最大化', async () => {
    const { appWindow, calls, setMaximized } = createFakeWindow()
    setMaximized(true)
    const driver = createPreviewFullscreenDriver(appWindow)

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

  it('重复的同形态事件不重复执行动作', async () => {
    const { appWindow, calls } = createFakeWindow()
    const driver = createPreviewFullscreenDriver(appWindow)

    driver.notify(true)
    driver.notify(true)
    await flushQueue()
    driver.notify(false)
    driver.notify(false)
    await flushQueue()

    expect(calls).toEqual(['setFullscreen(true)', 'setFullscreen(false)'])
  })

  it('同一轮里进出全屏时窗口不动作', async () => {
    const { appWindow, calls, setMaximized } = createFakeWindow()
    setMaximized(true)
    const driver = createPreviewFullscreenDriver(appWindow)

    // 两次事件之间没让出微任务：排队的收敛执行时元素已退出全屏，窗口不必跟着动
    driver.notify(true)
    driver.notify(false)
    await flushQueue()

    expect(calls).toEqual([])
  })

  it('队列里的动作按顺序执行，前一个没跑完不会开始下一个', async () => {
    const { appWindow, calls, holdMaximized, releaseMaximized, setMaximized } = createFakeWindow()
    setMaximized(true)
    holdMaximized()
    const driver = createPreviewFullscreenDriver(appWindow)

    driver.notify(true)
    await flushQueue()
    driver.notify(false)
    releaseMaximized(true)
    await flushQueue()

    expect(calls).toEqual([
      'setFullscreen(false)',
      'unmaximize',
      'setFullscreen(true)',
      'setFullscreen(false)',
      'maximize',
    ])
  })

  it('进入全屏前先问窗口形态，没问出来之前不动窗口', async () => {
    const { appWindow, calls, holdMaximized, releaseMaximized } = createFakeWindow()
    holdMaximized()
    const driver = createPreviewFullscreenDriver(appWindow)

    driver.notify(true)
    await flushQueue()
    expect(calls).toEqual([])

    releaseMaximized(true)
    await flushQueue()

    expect(calls).toEqual(['setFullscreen(false)', 'unmaximize', 'setFullscreen(true)'])
  })

  it('形态查询失败时按非最大化进全屏并上报错误', async () => {
    const { appWindow, calls, holdMaximized, rejectMaximized } = createFakeWindow()
    holdMaximized()
    const onError = vi.fn()
    const driver = createPreviewFullscreenDriver(appWindow, onError)

    driver.notify(true)
    await flushQueue()
    rejectMaximized()
    await flushQueue()

    expect(calls).toEqual(['setFullscreen(true)'])
    expect(onError).toHaveBeenCalledOnce()
  })

  it('补正中途失败时保留还原最大化所有权，卸载时兜底', async () => {
    const { appWindow, calls, failOn, setMaximized } = createFakeWindow()
    setMaximized(true)
    const onError = vi.fn()
    const driver = createPreviewFullscreenDriver(appWindow, onError)

    failOn('unmaximize')
    driver.notify(true)
    await flushQueue()
    expect(calls).toEqual(['setFullscreen(false)', 'unmaximize'])
    expect(onError).toHaveBeenCalledOnce()

    failOn(undefined)
    await driver.dispose()

    expect(calls).toEqual(['setFullscreen(false)', 'unmaximize', 'setFullscreen(false)', 'maximize'])
  })

  it('还原最大化失败时保留所有权，卸载时再试一次', async () => {
    const { appWindow, calls, failOn, setMaximized } = createFakeWindow()
    setMaximized(true)
    const onError = vi.fn()
    const driver = createPreviewFullscreenDriver(appWindow, onError)

    driver.notify(true)
    await flushQueue()
    failOn('maximize')
    driver.notify(false)
    await flushQueue()
    expect(onError).toHaveBeenCalledOnce()

    failOn(undefined)
    await driver.dispose()

    expect(calls).toEqual([
      'setFullscreen(false)',
      'unmaximize',
      'setFullscreen(true)',
      'setFullscreen(false)',
      'maximize',
      'setFullscreen(false)',
      'maximize',
    ])
  })

  it('卸载时仍处于全屏则退出窗口全屏', async () => {
    const { appWindow, calls } = createFakeWindow()
    const driver = createPreviewFullscreenDriver(appWindow)

    driver.notify(true)
    await flushQueue()
    await driver.dispose()

    expect(calls).toEqual(['setFullscreen(true)', 'setFullscreen(false)'])
  })

  it('没动过窗口时卸载不碰窗口', async () => {
    const { appWindow, calls } = createFakeWindow()
    const driver = createPreviewFullscreenDriver(appWindow)

    driver.notify(false)
    await driver.dispose()

    expect(calls).toEqual([])
  })

  it('卸载时还没轮到的进入动作不再执行', async () => {
    const { appWindow, calls } = createFakeWindow()
    const driver = createPreviewFullscreenDriver(appWindow)

    driver.notify(true)
    await driver.dispose()

    expect(calls).toEqual([])
  })

  it('卸载后不再响应全屏事件', async () => {
    const { appWindow, calls } = createFakeWindow()
    const driver = createPreviewFullscreenDriver(appWindow)

    await driver.dispose()
    driver.notify(true)
    await flushQueue()

    expect(calls).toEqual([])
  })
})
