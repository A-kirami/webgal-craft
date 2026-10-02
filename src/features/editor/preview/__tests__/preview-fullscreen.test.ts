import { describe, expect, it, vi } from 'vitest'

import { createPreviewFullscreenDriver } from '../preview-fullscreen'

import type { PreviewFullscreenSession, PreviewFullscreenWindowLike } from '../preview-fullscreen'
import type { PreviewWindowShape } from '~/commands/preview-fullscreen'

const NORMAL: PreviewWindowShape = { fullscreen: false, maximized: false }
const MAXIMIZED: PreviewWindowShape = { fullscreen: false, maximized: true }
const FULLSCREEN: PreviewWindowShape = { fullscreen: true, maximized: false }

/** 形态的可读名，用于断言会话收到的形态 */
function shapeName(shape: PreviewWindowShape): string {
  if (shape.fullscreen) {
    return 'fullscreen'
  }

  return shape.maximized ? 'maximized' : 'normal'
}

interface FakeWindow {
  appWindow: PreviewFullscreenWindowLike
  /** 形态查询次数：用来断言元素全屏期间不再采样 */
  readCount: () => number
  /** 模拟窗口形态变化引发的 resize 事件 */
  resize: () => void
  setShape: (shape: PreviewWindowShape) => void
  /** 挂起形态查询，之后用 releaseShapeReads 放行 */
  holdShapeReads: () => void
  releaseShapeReads: () => void
}

function createFakeWindow(initialShape: PreviewWindowShape = NORMAL): FakeWindow {
  let shape = initialShape
  let resizeHandler: (() => void) | undefined
  let holding = false
  let reads = 0
  const heldResolvers: (() => void)[] = []
  const read = (value: boolean): Promise<boolean> => {
    reads++

    return holding
      ? new Promise<boolean>((resolve) => {
          heldResolvers.push(() => resolve(value))
        })
      : Promise.resolve(value)
  }

  return {
    appWindow: {
      isFullscreen: () => read(shape.fullscreen),
      isMaximized: () => read(shape.maximized),
      onResized: (handler) => {
        resizeHandler = handler

        return Promise.resolve(() => {
          resizeHandler = undefined
        })
      },
    },
    readCount: () => reads,
    resize: () => resizeHandler?.(),
    setShape: (nextShape) => {
      shape = nextShape
    },
    holdShapeReads: () => {
      holding = true
    },
    releaseShapeReads: () => {
      holding = false
      for (const resolve of heldResolvers.splice(0)) {
        resolve()
      }
    },
  }
}

interface FakeSession {
  calls: string[]
  exitShape: PreviewWindowShape
  session: PreviewFullscreenSession
  /** 挂起 enter，之后用 releaseEnter 放行 */
  holdEnter: () => void
  releaseEnter: () => void
}

function createFakeSession(exitShape: PreviewWindowShape = NORMAL): FakeSession {
  const calls: string[] = []
  let holding = false
  const heldResolvers: (() => void)[] = []
  const fake: FakeSession = {
    calls,
    exitShape,
    holdEnter: () => {
      holding = true
    },
    releaseEnter: () => {
      holding = false
      for (const resolve of heldResolvers.splice(0)) {
        resolve()
      }
    },
    session: {
      enter: async (resting) => {
        calls.push(`enter(${shapeName(resting)})`)

        if (holding) {
          await new Promise<void>((resolve) => {
            heldResolvers.push(resolve)
          })
        }
      },
      exit: async () => {
        calls.push('exit')

        return fake.exitShape
      },
    },
  }

  return fake
}

/** 让队列里的会话命令跑完。 */
function flushQueue(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

describe('createPreviewFullscreenDriver', () => {
  it('进入元素全屏时把进入前的窗口形态交给会话', async () => {
    const { appWindow } = createFakeWindow(MAXIMIZED)
    const { calls, session } = createFakeSession()
    const driver = createPreviewFullscreenDriver(appWindow, session)
    await flushQueue()

    driver.notify(true)
    await flushQueue()

    expect(calls).toEqual(['enter(maximized)'])
  })

  it('退出元素全屏时结束会话，并把还原后的形态当成下次进入前的形态', async () => {
    const { appWindow } = createFakeWindow(NORMAL)
    const { calls, session } = createFakeSession(FULLSCREEN)
    const driver = createPreviewFullscreenDriver(appWindow, session)
    await flushQueue()

    driver.notify(true)
    await flushQueue()
    driver.notify(false)
    await flushQueue()
    driver.notify(true)
    await flushQueue()

    expect(calls).toEqual(['enter(normal)', 'exit', 'enter(fullscreen)'])
  })

  it('元素全屏期间不再采样，镜像造成的窗口全屏不会被当成窗口本来的形态', async () => {
    const { appWindow, readCount, resize, setShape } = createFakeWindow(NORMAL)
    const { calls, session } = createFakeSession()
    const driver = createPreviewFullscreenDriver(appWindow, session)
    await flushQueue()
    const readsBeforeFullscreen = readCount()

    driver.notify(true)
    await flushQueue()
    setShape(FULLSCREEN)
    resize()
    await flushQueue()

    expect(readCount()).toBe(readsBeforeFullscreen)
    driver.notify(false)
    await flushQueue()

    expect(calls).toEqual(['enter(normal)', 'exit'])
  })

  it('resize 采样先于进入事件落定时，镜像造成的窗口全屏不会被保留', async () => {
    const { appWindow, resize, setShape } = createFakeWindow(NORMAL)
    const { calls, session } = createFakeSession()
    const driver = createPreviewFullscreenDriver(appWindow, session)
    await flushQueue()

    // 元素全屏开始时宿主会把窗口设成全屏并触发 resize，采样可能先于 fullscreenchange 落定
    setShape(FULLSCREEN)
    resize()
    await flushQueue()

    driver.notify(true)
    await flushQueue()
    driver.notify(false)
    await flushQueue()

    // 窗口本来不是全屏：退出时按非全屏还原，镜像造成的全屏不算窗口本来的形态
    expect(calls).toEqual(['enter(normal)', 'exit'])
  })

  it('元素全屏之外的窗口变化会重新采样', async () => {
    const { appWindow, resize, setShape } = createFakeWindow(NORMAL)
    const { calls, session } = createFakeSession()
    const driver = createPreviewFullscreenDriver(appWindow, session)
    await flushQueue()

    setShape(MAXIMIZED)
    resize()
    await flushQueue()
    driver.notify(true)
    await flushQueue()

    expect(calls).toEqual(['enter(maximized)'])
  })

  it('重复的同形态事件只开一次会话', async () => {
    const { appWindow } = createFakeWindow(NORMAL)
    const { calls, session } = createFakeSession()
    const driver = createPreviewFullscreenDriver(appWindow, session)
    await flushQueue()

    driver.notify(true)
    driver.notify(true)
    await flushQueue()
    driver.notify(false)
    driver.notify(false)
    await flushQueue()

    expect(calls).toEqual(['enter(normal)', 'exit'])
  })

  it('采样还没落定时进入全屏会等采样结果', async () => {
    const { appWindow, holdShapeReads, releaseShapeReads } = createFakeWindow(MAXIMIZED)
    holdShapeReads()
    const { calls, session } = createFakeSession()
    const driver = createPreviewFullscreenDriver(appWindow, session)

    driver.notify(true)
    await flushQueue()
    expect(calls).toEqual([])

    releaseShapeReads()
    await flushQueue()

    expect(calls).toEqual(['enter(maximized)'])
  })

  it('采样在途时退出全屏，排队的进入动作不再执行', async () => {
    const { appWindow, holdShapeReads, releaseShapeReads } = createFakeWindow(MAXIMIZED)
    holdShapeReads()
    const { calls, session } = createFakeSession()
    const driver = createPreviewFullscreenDriver(appWindow, session)

    driver.notify(true)
    await flushQueue()
    driver.notify(false)
    releaseShapeReads()
    await flushQueue()

    expect(calls).toEqual(['exit'])
  })

  it('会话串行执行，前一个没跑完不会开始下一个', async () => {
    const { appWindow } = createFakeWindow(NORMAL)
    const { calls, holdEnter, releaseEnter, session } = createFakeSession()
    holdEnter()
    const driver = createPreviewFullscreenDriver(appWindow, session)
    await flushQueue()

    driver.notify(true)
    await flushQueue()
    driver.notify(false)
    await flushQueue()
    expect(calls).toEqual(['enter(normal)'])

    releaseEnter()
    await flushQueue()

    expect(calls).toEqual(['enter(normal)', 'exit'])
  })

  it('会话失败时上报错误，后续事件继续处理', async () => {
    const { appWindow } = createFakeWindow(NORMAL)
    const { calls, session } = createFakeSession()
    session.enter = async () => {
      throw new Error('失败: enter')
    }
    const onError = vi.fn()
    const driver = createPreviewFullscreenDriver(appWindow, session, onError)
    await flushQueue()

    driver.notify(true)
    await flushQueue()
    expect(onError).toHaveBeenCalledOnce()

    driver.notify(false)
    await flushQueue()

    expect(calls).toEqual(['exit'])
  })

  it('卸载时结束进行中的会话', async () => {
    const { appWindow } = createFakeWindow(NORMAL)
    const { calls, session } = createFakeSession()
    const driver = createPreviewFullscreenDriver(appWindow, session)
    await flushQueue()

    driver.notify(true)
    await flushQueue()
    await driver.dispose()

    expect(calls).toEqual(['enter(normal)', 'exit'])
  })

  it('卸载后不再响应事件，也不再采样', async () => {
    const { appWindow, readCount, resize } = createFakeWindow(NORMAL)
    const { calls, session } = createFakeSession()
    const driver = createPreviewFullscreenDriver(appWindow, session)
    await flushQueue()

    await driver.dispose()
    const readsAfterDispose = readCount()

    driver.notify(true)
    resize()
    await flushQueue()

    expect(calls).toEqual([])
    expect(readCount()).toBe(readsAfterDispose)
  })
})
