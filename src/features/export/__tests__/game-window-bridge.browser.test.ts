import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import windowBridge from '../../../../src-tauri/game-runtime/window-bridge.js?raw'

const runtimeGlobal = globalThis as typeof globalThis & {
  __TAURI_INTERNALS__?: { invoke: ReturnType<typeof vi.fn> }
}

describe('导出游戏窗口桥接', () => {
  const originalClose = Object.getOwnPropertyDescriptor(globalThis, 'close')!
  const originalFullscreen = Object.getOwnPropertyDescriptor(Document.prototype, 'fullscreenElement')!
  const originalRequest = Object.getOwnPropertyDescriptor(Element.prototype, 'requestFullscreen')!
  const originalExit = Object.getOwnPropertyDescriptor(Document.prototype, 'exitFullscreen')!
  const originalAddEventListener = window.addEventListener
  const listeners = new Set<EventListenerOrEventListenerObject>()
  let elementFullscreen: Element | undefined
  const invoke = vi.fn<(command: string, args?: { active: boolean }) => Promise<void>>()
  const browserRequest = vi.fn<() => Promise<void>>()
  const browserExit = vi.fn(async () => {
    elementFullscreen = undefined
  })

  beforeEach(() => {
    invoke.mockReset().mockResolvedValue(undefined)
    browserRequest.mockReset().mockResolvedValue(undefined)
    browserExit.mockClear()
    elementFullscreen = undefined
    runtimeGlobal.__TAURI_INTERNALS__ = { invoke }
    Object.defineProperty(Document.prototype, 'fullscreenElement', { configurable: true, get: () => elementFullscreen })
    Object.defineProperty(Element.prototype, 'requestFullscreen', { configurable: true, writable: true, value: browserRequest })
    Object.defineProperty(Document.prototype, 'exitFullscreen', { configurable: true, value: browserExit })
    vi.spyOn(globalThis, 'addEventListener').mockImplementation((type, listener, options) => {
      if (type === 'webgal:window-fullscreen') {
        listeners.add(listener)
      }
      originalAddEventListener.call(globalThis, type, listener, options)
    })
  })

  afterEach(() => {
    for (const listener of listeners) {
      globalThis.removeEventListener('webgal:window-fullscreen', listener)
    }
    listeners.clear()
    Object.defineProperty(globalThis, 'close', originalClose)
    Object.defineProperty(Document.prototype, 'fullscreenElement', originalFullscreen)
    Object.defineProperty(Element.prototype, 'requestFullscreen', originalRequest)
    Object.defineProperty(Document.prototype, 'exitFullscreen', originalExit)
    Reflect.deleteProperty(document, 'fullscreenElement')
    Reflect.deleteProperty(document, 'exitFullscreen')
    delete runtimeGlobal.__TAURI_INTERNALS__
    vi.restoreAllMocks()
  })

  function installBridge(initialFullscreen = false): void {
    new Function(windowBridge.replace('__WEBGAL_INITIAL_FULLSCREEN__', String(initialFullscreen)))()
  }

  function nativeFullscreen(active: boolean): void {
    globalThis.dispatchEvent(new CustomEvent('webgal:window-fullscreen', { detail: active }))
  }

  it('退出游戏只调用原生退出命令', () => {
    installBridge()
    window.close()
    expect(invoke).toHaveBeenCalledExactlyOnceWith('exit_game')
  })

  it('根元素全屏请求等待真实窗口状态后完成，系统切换和重复事件保持一致', async () => {
    installBridge()
    const changes = vi.fn()
    document.addEventListener('fullscreenchange', changes)
    try {
      let completed = false
      const entered = document.documentElement.requestFullscreen().then(() => {
        completed = true
      })
      await Promise.resolve()
      expect(invoke).toHaveBeenLastCalledWith('set_window_fullscreen', { active: true })
      expect(completed).toBe(false)
      expect(document.fullscreenElement).toBeNull()
      nativeFullscreen(true)
      await entered
      expect(document.fullscreenElement).toBe(document.documentElement)
      nativeFullscreen(true)
      expect(changes).toHaveBeenCalledOnce()
      const exited = document.exitFullscreen()
      expect(invoke).toHaveBeenLastCalledWith('set_window_fullscreen', { active: false })
      nativeFullscreen(false)
      await exited
      expect(document.fullscreenElement).toBeNull()
      nativeFullscreen(true)
      expect(document.fullscreenElement).toBe(document.documentElement)
      expect(changes).toHaveBeenCalledTimes(3)
    } finally {
      document.removeEventListener('fullscreenchange', changes)
    }
  })

  it('启动全屏不需要异步查询或重复进入窗口全屏', async () => {
    installBridge(true)
    expect(document.fullscreenElement).toBe(document.documentElement)
    await document.documentElement.requestFullscreen()
    expect(invoke).not.toHaveBeenCalled()
    const exited = document.exitFullscreen()
    nativeFullscreen(false)
    await exited
    expect(document.fullscreenElement).toBeNull()
  })

  it('视频等非根元素继续使用浏览器的元素全屏实现', async () => {
    installBridge()
    const video = document.createElement('video')
    browserRequest.mockImplementationOnce(async () => {
      elementFullscreen = video
    })
    await video.requestFullscreen()
    expect(browserRequest).toHaveBeenCalledOnce()
    expect(browserRequest.mock.contexts[0]).toBe(video)
    expect(document.fullscreenElement).toBe(video)
    await document.exitFullscreen()
    expect(browserExit).toHaveBeenCalledOnce()
    expect(document.fullscreenElement).toBeNull()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('原生切换失败时传播错误且不提前改变全屏状态', async () => {
    const error = new Error('native fullscreen failed')
    invoke.mockRejectedValueOnce(error)
    installBridge()
    await expect(document.documentElement.requestFullscreen()).rejects.toBe(error)
    expect(document.fullscreenElement).toBeNull()
  })
})
