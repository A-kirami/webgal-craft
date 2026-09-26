import { describe, expect, it } from 'vitest'

import {
  applyPreviewFullscreenAction,
  previewFullscreenTransition,
} from '../preview-fullscreen'

import type {
  PreviewFullscreenStatus,
  PreviewFullscreenWindow,
} from '../preview-fullscreen'

const IDLE: PreviewFullscreenStatus = { mirrored: false, corrected: false }

/** 假窗口：只记录调用顺序。 */
function createFakeWindow(): {
  calls: string[]
  appWindow: PreviewFullscreenWindow
} {
  const calls: string[] = []
  return {
    calls,
    appWindow: {
      isMaximized: () => Promise.resolve(false),
      maximize: () => {
        calls.push('maximize')
        return Promise.resolve()
      },
      setFullscreen: (value: boolean) => {
        calls.push(`setFullscreen(${value})`)
        return Promise.resolve()
      },
      unmaximize: () => {
        calls.push('unmaximize')
        return Promise.resolve()
      },
    },
  }
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
