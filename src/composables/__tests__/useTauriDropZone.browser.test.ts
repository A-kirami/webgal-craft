import { PhysicalPosition } from '@tauri-apps/api/dpi'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, ref } from 'vue'

import { useTauriDropZone } from '../useTauriDropZone'

import type { Event as TauriEvent } from '@tauri-apps/api/event'
import type { DragDropEvent } from '@tauri-apps/api/webview'

const { webviewMockState } = vi.hoisted(() => ({
  webviewMockState: {
    handler: undefined as ((event: TauriEvent<DragDropEvent>) => void) | undefined,
    unlisten: vi.fn(),
  },
}))

vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: vi.fn(async (handler: (event: TauriEvent<DragDropEvent>) => void) => {
      webviewMockState.handler = handler
      return webviewMockState.unlisten
    }),
  }),
}))

const originalDevicePixelRatio = Object.getOwnPropertyDescriptor(globalThis, 'devicePixelRatio')
const standardDpiPath = '/games/standard-dpi'
const highDpiPath = '/games/high-dpi'
const outsidePath = '/games/outside'

function setDevicePixelRatio(value: number): void {
  Object.defineProperty(globalThis, 'devicePixelRatio', {
    configurable: true,
    value,
  })
}

async function renderDropZone() {
  const onDrop = vi.fn()
  const Harness = defineComponent({
    setup() {
      const target = ref<HTMLElement>()
      useTauriDropZone(target, onDrop)

      return () => h('div', {
        ref: target,
        style: {
          height: '50px',
          left: '50px',
          position: 'fixed',
          top: '50px',
          width: '50px',
          zIndex: '2147483647',
        },
      })
    },
  })

  const result = render(Harness)
  await vi.waitFor(() => expect(webviewMockState.handler).toBeTypeOf('function'))

  return { onDrop, result }
}

function emitDrop(paths: string[], position: PhysicalPosition): void {
  webviewMockState.handler?.({
    event: 'tauri://drag-drop',
    id: 1,
    payload: {
      paths,
      position,
      type: 'drop',
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  webviewMockState.handler = undefined
})

afterEach(() => {
  if (originalDevicePixelRatio) {
    Object.defineProperty(globalThis, 'devicePixelRatio', originalDevicePixelRatio)
  } else {
    Reflect.deleteProperty(globalThis, 'devicePixelRatio')
  }
})

describe('useTauriDropZone', () => {
  it('在 1x DPI 下使用原生坐标命中放置区域', async () => {
    setDevicePixelRatio(1)
    const { onDrop, result } = await renderDropZone()

    emitDrop([standardDpiPath], new PhysicalPosition(75, 75))

    expect(onDrop).toHaveBeenCalledWith([standardDpiPath])
    result.unmount()
  })

  it('在高 DPI 下将物理坐标转换为 CSS 坐标后命中放置区域', async () => {
    setDevicePixelRatio(2)
    const { onDrop, result } = await renderDropZone()

    emitDrop([highDpiPath], new PhysicalPosition(150, 150))

    expect(onDrop).toHaveBeenCalledWith([highDpiPath])
    result.unmount()
  })

  it('高 DPI 坐标换算后位于区域外时不触发放置', async () => {
    setDevicePixelRatio(2)
    const { onDrop, result } = await renderDropZone()

    emitDrop([outsidePath], new PhysicalPosition(250, 250))

    expect(onDrop).not.toHaveBeenCalled()
    result.unmount()
  })
})
