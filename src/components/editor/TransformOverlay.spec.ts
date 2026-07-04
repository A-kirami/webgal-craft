import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { renderInBrowser } from '~/__tests__/browser-render'
import { useShortcutContextRegistry } from '~/features/editor/shortcut/shortcut-context-registry'

import TransformOverlay from './TransformOverlay.vue'

import type { DisplayTransform } from '~/features/editor/transform-overlay/model'
import type { ReferenceBox } from '~/types/editorPreviewProtocol'

const referenceBox: ReferenceBox = {
  originX: 640,
  originY: 360,
  width: 200,
  height: 100,
  anchorX: 0.5,
  anchorY: 0.5,
  stageWidth: 1280,
  stageHeight: 720,
}

const displayTransform: DisplayTransform = {
  position: { x: 10, y: 20 },
  scale: { x: 1, y: 1 },
  rotation: 0,
}

function renderTransformOverlay(options: {
  box?: ReferenceBox
  displayTransform?: DisplayTransform
  onCancel?: ReturnType<typeof vi.fn>
  onCommit?: ReturnType<typeof vi.fn>
  onPreview?: ReturnType<typeof vi.fn>
} = {}) {
  return renderInBrowser(TransformOverlay, {
    props: {
      'box': options.box ?? referenceBox,
      'canvasHeight': 720,
      'canvasPlacement': { left: 0, scale: 1, top: 0 },
      'canvasWidth': 1280,
      'displayTransform': options.displayTransform ?? displayTransform,
      'onCancel:displayTransform': options.onCancel,
      'onCommit:displayTransform': options.onCommit,
      'onPreview:displayTransform': options.onPreview,
    },
  })
}

function dispatchKeydown(key: string, options: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key,
    ...options,
  })
  globalThis.dispatchEvent(event)
  return event
}

function findMoveHandle(): HTMLButtonElement | null {
  return document.querySelector('[aria-label="edit.previewPanel.transformOverlay.move"]')
}

describe('TransformOverlay', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('方向键会按舞台坐标微调位置', async () => {
    const onCommit = vi.fn()
    const onPreview = vi.fn()
    renderTransformOverlay({ onCommit, onPreview })

    const event = dispatchKeydown('ArrowRight')
    await nextTick()

    expect(event.defaultPrevented).toBe(true)
    expect(onPreview).not.toHaveBeenCalled()
    expect(onCommit).toHaveBeenCalledWith({
      ...displayTransform,
      position: { x: 11, y: 20 },
    })
  })

  it('输入控件聚焦时方向键不会抢占表单操作', async () => {
    const onUpdate = vi.fn()
    renderTransformOverlay({ onCommit: onUpdate, onPreview: onUpdate })

    const input = document.createElement('input')
    document.body.append(input)
    input.focus()

    dispatchKeydown('ArrowRight')
    await nextTick()

    expect(onUpdate).not.toHaveBeenCalled()
    input.remove()
  })

  it('变换控件聚焦时会声明浮层快捷键上下文', async () => {
    renderTransformOverlay()

    const moveHandle = findMoveHandle()
    expect(moveHandle).not.toBeNull()

    moveHandle!.focus()
    await nextTick()

    expect(useShortcutContextRegistry().resolveContext().panelFocus).toBe('transformOverlay')
  })

  it('Escape 会取消正在进行的拖拽而不是提交变换', async () => {
    const onCancel = vi.fn()
    const onCommit = vi.fn()
    const onPreview = vi.fn()
    renderTransformOverlay({ onCancel, onCommit, onPreview })

    const moveHandle = findMoveHandle()
    expect(moveHandle).not.toBeNull()

    moveHandle!.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      button: 0,
      buttons: 1,
      clientX: 640,
      clientY: 360,
      pointerId: 1,
    }))
    await nextTick()

    const event = dispatchKeydown('Escape')
    await nextTick()

    expect(event.defaultPrevented).toBe(true)
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onPreview).not.toHaveBeenCalled()
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('pointercancel 会取消正在进行的拖拽而不是提交变换', async () => {
    const onCancel = vi.fn()
    const onCommit = vi.fn()
    const onPreview = vi.fn()
    renderTransformOverlay({ onCancel, onCommit, onPreview })

    const moveHandle = findMoveHandle()
    expect(moveHandle).not.toBeNull()

    moveHandle!.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      button: 0,
      buttons: 1,
      clientX: 640,
      clientY: 360,
      pointerId: 1,
    }))
    await nextTick()

    globalThis.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      button: 0,
      buttons: 0,
      clientX: 640,
      clientY: 360,
      pointerId: 1,
    }))
    await nextTick()

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onPreview).not.toHaveBeenCalled()
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('window blur 会取消正在进行的拖拽而不是提交变换', async () => {
    const onCancel = vi.fn()
    const onCommit = vi.fn()
    const onPreview = vi.fn()
    renderTransformOverlay({ onCancel, onCommit, onPreview })

    const moveHandle = findMoveHandle()
    expect(moveHandle).not.toBeNull()

    moveHandle!.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      button: 0,
      buttons: 1,
      clientX: 640,
      clientY: 360,
      pointerId: 1,
    }))
    await nextTick()

    globalThis.dispatchEvent(new Event('blur'))
    await nextTick()

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onPreview).not.toHaveBeenCalled()
    expect(onCommit).not.toHaveBeenCalled()
  })
})
