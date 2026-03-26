import { describe, expect, it, vi } from 'vitest'
import { effectScope, reactive } from 'vue'

import { useVisualEditorAnimation } from '../useVisualEditorAnimation'

import type { AnimationFrame } from '~/domain/stage/types'

interface VisualAnimationState {
  frames: AnimationFrame[]
  path: string
}

interface KeyboardEventStub {
  ctrlKey: boolean
  defaultPrevented: boolean
  key: string
  metaKey: boolean
  preventDefault: () => void
  shiftKey: boolean
}

function createKeyboardEventStub(key: string, overrides: Partial<KeyboardEventStub> = {}): KeyboardEvent {
  const event: KeyboardEventStub = {
    ctrlKey: true,
    defaultPrevented: false,
    key,
    metaKey: false,
    preventDefault() {
      event.defaultPrevented = true
    },
    shiftKey: false,
    ...overrides,
  }

  return event as KeyboardEvent
}

function createState(path: string): VisualAnimationState {
  return reactive({
    frames: [{
      duration: 200,
    }],
    path,
  })
}

function createFixture(options: {
  activeElement?: () => Element | null
  isCurrentProjectionActive?: () => boolean
  path?: string
} = {}) {
  const state = createState(options.path ?? '/game/animation/opening.json')
  const applyAnimationFrameDelete = vi.fn()
  const applyAnimationFrameInsert = vi.fn()
  const applyAnimationFrameUpdate = vi.fn()
  const canRedo = vi.fn(() => false)
  const canUndo = vi.fn(() => true)
  const redoDocument = vi.fn(() => ({ applied: false }))
  const scheduleAutoSaveIfEnabled = vi.fn()
  const undoDocument = vi.fn(() => ({ applied: true }))

  const scope = effectScope()
  const controller = scope.run(() => useVisualEditorAnimation({
    activeElement: options.activeElement,
    applyAnimationFrameDelete,
    applyAnimationFrameInsert,
    applyAnimationFrameUpdate,
    canRedo,
    canUndo,
    isCurrentProjectionActive: options.isCurrentProjectionActive ?? (() => true),
    redoDocument,
    scheduleAutoSaveIfEnabled,
    state: () => state,
    undoDocument,
  }))

  if (!controller) {
    throw new TypeError('预期返回可视化动画编辑器 controller')
  }

  return {
    controller,
    scheduleAutoSaveIfEnabled,
    scope,
    undoDocument,
  }
}

describe('useVisualEditorAnimation 行为', () => {
  it('当前活跃页是动画可视化时会响应撤销快捷键', () => {
    const { controller, scheduleAutoSaveIfEnabled, scope, undoDocument } = createFixture()
    const event = createKeyboardEventStub('z')

    controller.handleHistoryShortcutKeydown(event)

    expect(undoDocument).toHaveBeenCalledTimes(1)
    expect(undoDocument).toHaveBeenCalledWith('/game/animation/opening.json')
    expect(scheduleAutoSaveIfEnabled).toHaveBeenCalledWith('/game/animation/opening.json')
    expect(event.defaultPrevented).toBe(true)

    scope.stop()
  })

  it('焦点位于对话框等浮层内时不会响应历史快捷键', () => {
    const overlayButton = {
      closest: (selector: string) => selector.includes('[role="dialog"]') ? {} : undefined,
      isContentEditable: false,
      tagName: 'BUTTON',
    } as unknown as Element

    const { controller, scheduleAutoSaveIfEnabled, scope, undoDocument } = createFixture({
      activeElement: () => overlayButton,
    })
    const event = createKeyboardEventStub('z')

    controller.handleHistoryShortcutKeydown(event)

    expect(undoDocument).not.toHaveBeenCalled()
    expect(scheduleAutoSaveIfEnabled).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)

    scope.stop()
  })

  it('非当前活跃动画页时不会响应历史快捷键', () => {
    const { controller, scheduleAutoSaveIfEnabled, scope, undoDocument } = createFixture({
      isCurrentProjectionActive: () => false,
    })
    const event = createKeyboardEventStub('z')

    controller.handleHistoryShortcutKeydown(event)

    expect(undoDocument).not.toHaveBeenCalled()
    expect(scheduleAutoSaveIfEnabled).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)

    scope.stop()
  })
})
