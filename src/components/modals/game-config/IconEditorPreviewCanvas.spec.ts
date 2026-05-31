import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderInBrowser } from '~/__tests__/browser-render'
import { createDefaultIconEditorState } from '~/features/modals/game-config/icon-editor/icon-editor-state'

import IconEditorPreviewCanvas from './IconEditorPreviewCanvas.vue'

const { renderIconCanvasMock } = vi.hoisted(() => ({
  renderIconCanvasMock: vi.fn(() => document.createElement('canvas')),
}))

vi.mock('~/features/modals/game-config/icon-editor/icon-editor-render', async () => {
  const actual = await vi.importActual<typeof import('~/features/modals/game-config/icon-editor/icon-editor-render')>(
    '~/features/modals/game-config/icon-editor/icon-editor-render',
  )

  return {
    ...actual,
    renderIconCanvas: renderIconCanvasMock,
  }
})

describe('IconEditorPreviewCanvas', () => {
  let nextFrameId: number
  let scheduledFrames: FrameRequestCallback[]

  beforeEach(() => {
    nextFrameId = 0
    scheduledFrames = []
    renderIconCanvasMock.mockClear()
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
    expect(renderIconCanvasMock).not.toHaveBeenCalled()

    scheduledFrames.shift()?.(performance.now())
    expect(renderIconCanvasMock).toHaveBeenCalledOnce()

    state.foregroundScale = 1.25
    state.foregroundOffsetRatio = { x: 0.1, y: 0.2 }
    await nextTick()

    expect(scheduledFrames).toHaveLength(1)

    scheduledFrames.shift()?.(performance.now())
    expect(renderIconCanvasMock).toHaveBeenCalledTimes(2)

    await result.unmount()
  })
})
