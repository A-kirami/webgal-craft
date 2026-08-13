import { afterEach, describe, expect, it, vi } from 'vitest'

import fullscreenBridge from '../../../../src-tauri/resources/webgalcraft-neutralino-fullscreen.js?raw'

interface NeutralinoStub {
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

describe('Neutralino 全屏桥接', () => {
  const originalFullscreenElement = Object.getOwnPropertyDescriptor(document, 'fullscreenElement')
  const originalFullscreenEnabled = Object.getOwnPropertyDescriptor(document, 'fullscreenEnabled')
  const originalExitFullscreen = Object.getOwnPropertyDescriptor(document, 'exitFullscreen')
  const originalRequestFullscreen = Object.getOwnPropertyDescriptor(Element.prototype, 'requestFullscreen')

  afterEach(() => {
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

    new Function(fullscreenBridge)()
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

    new Function(fullscreenBridge)()

    await expect(document.documentElement.requestFullscreen()).rejects.toBe(nativeError)
    expect(document.fullscreenElement).toBeNull()
    expect(fullscreenChanges).not.toHaveBeenCalled()

    document.removeEventListener('fullscreenchange', fullscreenChanges)
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
