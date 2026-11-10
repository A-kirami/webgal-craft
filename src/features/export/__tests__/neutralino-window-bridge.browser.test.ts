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
    const listeners = new Map<string, () => void | Promise<void>>()
    let nativeFullscreen = true
    const setFullScreen = vi.fn(async () => {
      nativeFullscreen = true
      await listeners.get('windowFullScreenEnter')?.()
    })
    const exitFullScreen = vi.fn(async () => {
      nativeFullscreen = false
      await listeners.get('windowFullScreenExit')?.()
    })
    const isFullScreen = vi.fn(async () => nativeFullscreen)
    const init = vi.fn(() => undefined)
    neutralinoGlobal.Neutralino = {
      app: { exit: vi.fn(async () => undefined) },
      events: {
        on: vi.fn((event, listener) => {
          listeners.set(event, listener)
        }),
      },
      init,
      window: { exitFullScreen, isFullScreen, setFullScreen },
    }
    const fullscreenChanges = vi.fn(() => undefined)
    document.addEventListener('fullscreenchange', fullscreenChanges)

    new Function(windowBridge)()
    expect(init).toHaveBeenCalledOnce()

    await listeners.get('ready')!()
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

  it('同步原生窗口全屏变化并忽略重复事件', async () => {
    const listeners = new Map<string, () => void | Promise<void>>()
    neutralinoGlobal.Neutralino = {
      app: { exit: vi.fn(async () => undefined) },
      events: {
        on: (event, listener) => {
          listeners.set(event, listener)
        },
      },
      init: vi.fn(() => undefined),
      window: {
        exitFullScreen: vi.fn(async () => undefined),
        isFullScreen: vi.fn(async () => false),
        setFullScreen: vi.fn(async () => undefined),
      },
    }
    const fullscreenChanges = vi.fn(() => undefined)
    document.addEventListener('fullscreenchange', fullscreenChanges)

    try {
      new Function(windowBridge)()
      await listeners.get('ready')!()
      await document.documentElement.requestFullscreen()
      expect(document.fullscreenElement).toBeNull()

      await listeners.get('windowFullScreenEnter')!()
      expect(document.fullscreenElement).toBe(document.documentElement)
      await listeners.get('windowFullScreenEnter')!()
      expect(fullscreenChanges).toHaveBeenCalledOnce()

      await document.exitFullscreen()
      expect(document.fullscreenElement).toBe(document.documentElement)
      await listeners.get('windowFullScreenExit')!()
      expect(document.fullscreenElement).toBeNull()
      expect(fullscreenChanges).toHaveBeenCalledTimes(2)
    } finally {
      document.removeEventListener('fullscreenchange', fullscreenChanges)
    }
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
