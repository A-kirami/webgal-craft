import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderInBrowser } from '~/__tests__/browser-render'
import { createDefaultIconEditorState } from '~/features/modals/game-config/icon-editor/icon-editor-state'

import IconEditorPreviewCanvas from './IconEditorPreviewCanvas.vue'

const { renderIconCanvasMock, renderIconPreviewCanvasMock } = vi.hoisted(() => ({
  renderIconCanvasMock: vi.fn(() => document.createElement('canvas')),
  renderIconPreviewCanvasMock: vi.fn(() => document.createElement('canvas')),
}))

vi.mock('~/features/modals/game-config/icon-editor/icon-editor-render', async () => {
  const actual = await vi.importActual<typeof import('~/features/modals/game-config/icon-editor/icon-editor-render')>(
    '~/features/modals/game-config/icon-editor/icon-editor-render',
  )

  return {
    ...actual,
    renderIconCanvas: renderIconCanvasMock,
    renderIconPreviewCanvas: renderIconPreviewCanvasMock,
  }
})

describe('IconEditorPreviewCanvas', () => {
  let nextFrameId: number
  let scheduledFrames: FrameRequestCallback[]

  beforeEach(() => {
    nextFrameId = 0
    scheduledFrames = []
    renderIconCanvasMock.mockClear()
    renderIconPreviewCanvasMock.mockClear()
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      scheduledFrames.push(callback)
      nextFrameId += 1
      return nextFrameId
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('同一帧内多次状态变化只会触发一次预览重绘', async () => {
    const state = reactive(createDefaultIconEditorState())
    const Harness = defineComponent({
      setup() {
        return () => h(IconEditorPreviewCanvas, {
          kind: 'web',
          label: 'preview',
          state,
        })
      },
    })
    const result = await renderInBrowser(Harness)

    expect(scheduledFrames).toHaveLength(1)
    expect(renderIconPreviewCanvasMock).not.toHaveBeenCalled()

    scheduledFrames.shift()?.(performance.now())
    expect(renderIconPreviewCanvasMock).toHaveBeenCalledOnce()

    state.foregroundScale = 1.25
    state.foregroundOffsetRatio = { x: 0.1, y: 0.2 }
    await nextTick()

    expect(scheduledFrames).toHaveLength(1)

    scheduledFrames.shift()?.(performance.now())
    expect(renderIconPreviewCanvasMock).toHaveBeenCalledTimes(2)

    await result.unmount()
  })

  it('按预览显示尺寸组合画布，不按导出分辨率重算', async () => {
    const state = reactive(createDefaultIconEditorState())
    const Harness = defineComponent({
      setup() {
        return () => h(IconEditorPreviewCanvas, {
          kind: 'web',
          label: 'preview',
          state,
        })
      },
    })
    await renderInBrowser(Harness)

    scheduledFrames.shift()?.(performance.now())

    expect(renderIconPreviewCanvasMock).toHaveBeenCalledWith(state, expect.objectContaining({
      kind: 'web',
      size: 192,
      sourceSize: 384,
    }))
  })

  it('版本号变化触发重绘而不重建画布', async () => {
    const state = reactive(createDefaultIconEditorState())
    const version = ref(0)
    const Harness = defineComponent({
      setup() {
        return () => h(IconEditorPreviewCanvas, {
          kind: 'web',
          label: 'preview',
          state,
          version: version.value,
        })
      },
    })
    const result = await renderInBrowser(Harness)

    scheduledFrames.shift()?.(performance.now())
    expect(renderIconPreviewCanvasMock).toHaveBeenCalledOnce()
    const canvas = result.container.querySelector('canvas')

    // 载入还原这类改动不经过响应式 state，靠版本号触发重绘；画布节点必须复用，否则每次更新都重建
    version.value = 1
    await nextTick()
    scheduledFrames.shift()?.(performance.now())

    expect(renderIconPreviewCanvasMock).toHaveBeenCalledTimes(2)
    expect(result.container.querySelector('canvas')).toBe(canvas)
  })
})
