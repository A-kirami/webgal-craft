import { describe, expect, it, vi } from 'vitest'
import { effectScope, reactive } from 'vue'

import { useVisualEditorAnimation } from '../useVisualEditorAnimation'

import type { AnimationFrame } from '~/domain/stage/types'

interface VisualAnimationState {
  frames: AnimationFrame[]
  path: string
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
  path?: string
  redoApplied?: boolean
  undoApplied?: boolean
} = {}) {
  const state = createState(options.path ?? '/game/animation/opening.json')
  const scope = effectScope()
  const applyAnimationFrameDelete = vi.fn()
  const applyAnimationFrameInsert = vi.fn()
  const applyAnimationFrameUpdate = vi.fn()
  const canRedo = vi.fn(() => false)
  const canUndo = vi.fn(() => true)
  const redoDocument = vi.fn(() => ({ applied: options.redoApplied ?? false }))
  const scheduleAutoSaveIfEnabled = vi.fn()
  const undoDocument = vi.fn(() => ({ applied: options.undoApplied ?? true }))

  const controller = scope.run(() => useVisualEditorAnimation({
    applyAnimationFrameDelete,
    applyAnimationFrameInsert,
    applyAnimationFrameUpdate,
    canRedo,
    canUndo,
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
    redoDocument,
    scheduleAutoSaveIfEnabled,
    scope,
    undoDocument,
  }
}

describe('useVisualEditorAnimation 行为', () => {
  it('撤销成功时会请求自动保存', () => {
    const { controller, scheduleAutoSaveIfEnabled, scope, undoDocument } = createFixture()

    controller.handleUndo()

    expect(undoDocument).toHaveBeenCalledTimes(1)
    expect(undoDocument).toHaveBeenCalledWith('/game/animation/opening.json')
    expect(scheduleAutoSaveIfEnabled).toHaveBeenCalledWith('/game/animation/opening.json')

    scope.stop()
  })

  it('撤销未生效时不会请求自动保存', () => {
    const { controller, scheduleAutoSaveIfEnabled, scope, undoDocument } = createFixture({
      undoApplied: false,
    })

    controller.handleUndo()

    expect(undoDocument).toHaveBeenCalledTimes(1)
    expect(scheduleAutoSaveIfEnabled).not.toHaveBeenCalled()

    scope.stop()
  })

  it('重做成功时会请求自动保存', () => {
    const { controller, redoDocument, scheduleAutoSaveIfEnabled, scope } = createFixture({
      redoApplied: true,
    })

    controller.handleRedo()

    expect(redoDocument).toHaveBeenCalledTimes(1)
    expect(redoDocument).toHaveBeenCalledWith('/game/animation/opening.json')
    expect(scheduleAutoSaveIfEnabled).toHaveBeenCalledWith('/game/animation/opening.json')

    scope.stop()
  })

  it('重做未生效时不会请求自动保存', () => {
    const { controller, redoDocument, scheduleAutoSaveIfEnabled, scope } = createFixture({
      redoApplied: false,
    })

    controller.handleRedo()

    expect(redoDocument).toHaveBeenCalledTimes(1)
    expect(redoDocument).toHaveBeenCalledWith('/game/animation/opening.json')
    expect(scheduleAutoSaveIfEnabled).not.toHaveBeenCalled()

    scope.stop()
  })
})
