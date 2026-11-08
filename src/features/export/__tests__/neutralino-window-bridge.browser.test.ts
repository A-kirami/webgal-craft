import { afterEach, describe, expect, it, vi } from 'vitest'

import windowBridge from '../../../../src-tauri/resources/webgalcraft-neutralino-window.js?raw'

interface NeutralinoStub {
  app: {
    exit: () => Promise<void>
  }
  events: {
    on: (event: string, listener: () => void | Promise<void>) => void
  }
  init: () => void
  window: {
    exitFullScreen: () => Promise<void>
    isFullScreen: () => Promise<boolean>
    setFullScreen: () => Promise<void>
  }
}

const neutralinoGlobal = globalThis as typeof globalThis & { Neutralino?: NeutralinoStub }

describe('Neutralino 窗口桥接', () => {
  const originalClose = Object.getOwnPropertyDescriptor(globalThis, 'close')
  const originalFullscreenElement = Object.getOwnPropertyDescriptor(document, 'fullscreenElement')
  const originalFullscreenEnabled = Object.getOwnPropertyDescriptor(document, 'fullscreenEnabled')
  const originalExitFullscreen = Object.getOwnPropertyDescriptor(document, 'exitFullscreen')
  const originalRequestFullscreen = Object.getOwnPropertyDescriptor(Element.prototype, 'requestFullscreen')

  afterEach(() => {
    restoreProperty(globalThis, 'close', originalClose)
    restoreProperty(document, 'fullscreenElement', originalFullscreenElement)
    restoreProperty(document, 'fullscreenEnabled', originalFullscreenEnabled)
    restoreProperty(document, 'exitFullscreen', originalExitFullscreen)
    restoreProperty(Element.prototype, 'requestFullscreen', originalRequestFullscreen)
    delete neutralinoGlobal.Neutralino
    vi.restoreAllMocks()
  })

  it('将 Web Fullscreen API 映射到 Neutralino 窗口并同步状态事件', async () => {
    let readyListener: (() => void | Promise<void>) | undefined
    let nativeFullscreen = true
    const setFullScreen = vi.fn(async () => {
      nativeFullscreen = true
    })
    const exitFullScreen = vi.fn(async () => {
      nativeFullscreen = false
    })
    const isFullScreen = vi.fn(async () => nativeFullscreen)
    const init = vi.fn(() => undefined)
    neutralinoGlobal.Neutralino = {
      app: { exit: vi.fn(async () => undefined) },
      events: {
        on: vi.fn((event, listener) => {
          expect(event).toBe('ready')
          readyListener = listener
        }),
      },
      init,
      window: { exitFullScreen, isFullScreen, setFullScreen },
    }
    const fullscreenChanges = vi.fn(() => undefined)
    document.addEventListener('fullscreenchange', fullscreenChanges)

    new Function(windowBridge)()
    expect(init).toHaveBeenCalledOnce()

    await readyListener?.()
    expect(document.fullscreenElement).toBe(document.documentElement)
    expect(fullscreenChanges).toHaveBeenCalledTimes(1)

    await document.exitFullscreen()
    expect(exitFullScreen).toHaveBeenCalledOnce()
    expect(document.fullscreenElement).toBeNull()

    await document.documentElement.requestFullscreen()
    expect(setFullScreen).toHaveBeenCalledOnce()
    expect(document.fullscreenElement).toBe(document.documentElement)
    expect(fullscreenChanges).toHaveBeenCalledTimes(3)

    document.removeEventListener('fullscreenchange', fullscreenChanges)
  })

  it('原生全屏调用失败时不伪造 Web Fullscreen 状态', async () => {
    const nativeError = new Error('native fullscreen failed')
    const setFullScreen = vi.fn(async () => {
      throw nativeError
    })
    neutralinoGlobal.Neutralino = {
      app: { exit: vi.fn(async () => undefined) },
      events: { on: vi.fn(() => undefined) },
      init: vi.fn(() => undefined),
      window: {
        exitFullScreen: vi.fn(async () => undefined),
        isFullScreen: vi.fn(async () => false),
        setFullScreen,
      },
    }
    const fullscreenChanges = vi.fn(() => undefined)
    document.addEventListener('fullscreenchange', fullscreenChanges)

    new Function(windowBridge)()

    await expect(document.documentElement.requestFullscreen()).rejects.toBe(nativeError)
    expect(document.fullscreenElement).toBeNull()
    expect(fullscreenChanges).not.toHaveBeenCalled()

    document.removeEventListener('fullscreenchange', fullscreenChanges)
  })

  it('将游戏的 window.close 调用映射到原生应用退出', () => {
    const exit = vi.fn(async () => undefined)
    neutralinoGlobal.Neutralino = {
      app: { exit },
      events: { on: vi.fn(() => undefined) },
      init: vi.fn(() => undefined),
      window: {
        exitFullScreen: vi.fn(async () => undefined),
        isFullScreen: vi.fn(async () => false),
        setFullScreen: vi.fn(async () => undefined),
      },
    }

    new Function(windowBridge)()
    window.close()

    expect(exit).toHaveBeenCalledExactlyOnceWith()
  })
})

function restoreProperty(
  target: object,
  property: PropertyKey,
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) {
    Object.defineProperty(target, property, descriptor)
  } else {
    Reflect.deleteProperty(target, property)
  }
}
