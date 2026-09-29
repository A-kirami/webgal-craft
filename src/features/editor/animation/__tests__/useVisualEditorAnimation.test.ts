import { describe, expect, it, vi } from 'vitest'
import { effectScope, reactive } from 'vue'

import { AbsPath } from '~/domain/path'

import { useVisualEditorAnimation } from '../useVisualEditorAnimation'

import type { AnimationFrame } from '~/domain/stage/types'

interface VisualAnimationState {
  frames: AnimationFrame[]
  path: AbsPath
}

function createState(path: AbsPath, frames: AnimationFrame[] = [{ duration: 200 }]): VisualAnimationState {
  return reactive({
    frames,
    path,
  })
}

function createFixture(options: {
  frames?: AnimationFrame[]
  path?: AbsPath
  redoApplied?: boolean
  undoApplied?: boolean
} = {}) {
  const state = createState(options.path ?? AbsPath.from('/game/animation/opening.json'), options.frames)
  const scope = effectScope()
  const applyAnimationFrameDelete = vi.fn()
  const applyAnimationFrameInsert = vi.fn()
  const applyAnimationFrameReorder = vi.fn()
  const applyAnimationFrameUpdate = vi.fn()
  const canRedo = vi.fn(() => false)
  const canUndo = vi.fn(() => true)
  const redoDocument = vi.fn(() => ({ applied: options.redoApplied ?? false }))
  const scheduleAutoSaveIfEnabled = vi.fn()
  const undoDocument = vi.fn(() => ({ applied: options.undoApplied ?? true }))

  const controller = scope.run(() => useVisualEditorAnimation({
    applyAnimationFrameDelete,
    applyAnimationFrameInsert,
    applyAnimationFrameReorder,
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
    applyAnimationFrameDelete,
    applyAnimationFrameInsert,
    applyAnimationFrameReorder,
    applyAnimationFrameUpdate,
    controller,
    redoDocument,
    scheduleAutoSaveIfEnabled,
    scope,
    undoDocument,
  }
}

describe('useVisualEditorAnimation', () => {
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

  it('原始时长为 0 的帧在拖拽草稿后回到 0ms 时会清掉草稿而不产生无效写回', () => {
    const { applyAnimationFrameUpdate, controller, scheduleAutoSaveIfEnabled, scope } = createFixture({
      frames: [{ duration: 0 }],
    })

    controller.handleTimelineResizeDuration({
      duration: 32,
      flush: false,
      id: 1,
    })

    expect(controller.session.selectedFrameDurationDraft).toEqual({
      duration: 32,
      frameId: 1,
    })

    controller.handleTimelineResizeDuration({
      duration: 0,
      flush: false,
      id: 1,
    })

    expect(controller.session.selectedFrameDurationDraft).toEqual({
      duration: 0,
      frameId: 1,
    })

    controller.handleTimelineResizeDuration({
      duration: 0,
      flush: true,
      id: 1,
    })

    expect(controller.session.selectedFrameDurationDraft).toBeUndefined()
    expect(applyAnimationFrameUpdate).not.toHaveBeenCalled()
    expect(scheduleAutoSaveIfEnabled).not.toHaveBeenCalled()
    expect(controller.session.selectedFrameId).toBe(1)
    scope.stop()
  })

  it('复制后粘贴会在选中帧之后插入剪贴板里的帧', () => {
    const { applyAnimationFrameInsert, controller, scheduleAutoSaveIfEnabled, scope } = createFixture({
      frames: [{ duration: 200 }, { duration: 300 }],
    })

    controller.session.selectedFrameId = 2
    controller.handleCopyFrame()
    controller.handlePasteFrame()

    expect(applyAnimationFrameInsert).toHaveBeenCalledTimes(1)
    expect(applyAnimationFrameInsert).toHaveBeenCalledWith(
      '/game/animation/opening.json',
      1,
      { duration: 300 },
    )
    expect(scheduleAutoSaveIfEnabled).toHaveBeenCalledWith('/game/animation/opening.json')

    scope.stop()
  })

  it('剪贴板为空时粘贴不会写入帧', () => {
    const { applyAnimationFrameInsert, controller, scope } = createFixture({
      frames: [{ duration: 200 }, { duration: 300 }],
    })

    controller.handlePasteFrame()

    expect(applyAnimationFrameInsert).not.toHaveBeenCalled()

    scope.stop()
  })

  it('剪切会复制选中帧并删除它', () => {
    const { applyAnimationFrameDelete, applyAnimationFrameInsert, controller, scope } = createFixture({
      frames: [{ duration: 200 }, { duration: 300 }],
    })

    controller.session.selectedFrameId = 2
    controller.handleCutFrame()
    controller.handlePasteFrame()

    expect(applyAnimationFrameDelete).toHaveBeenCalledWith('/game/animation/opening.json', 1)
    expect(applyAnimationFrameInsert).toHaveBeenCalledWith(
      '/game/animation/opening.json',
      0,
      { duration: 300 },
    )

    scope.stop()
  })

  it('创建副本会在选中帧之后插入克隆并选中副本', () => {
    const { applyAnimationFrameInsert, controller, scope } = createFixture({
      frames: [{ duration: 200 }, { duration: 300 }],
    })

    controller.session.selectedFrameId = 1
    controller.handleDuplicateFrame()

    expect(applyAnimationFrameInsert).toHaveBeenCalledWith(
      '/game/animation/opening.json',
      0,
      { duration: 200 },
    )
    expect(controller.session.selectedFrameId).toBe(2)

    scope.stop()
  })

  it('前移与后移帧会请求重排并保持选中该帧', () => {
    const { applyAnimationFrameReorder, controller, scheduleAutoSaveIfEnabled, scope } = createFixture({
      frames: [{ duration: 200 }, { duration: 300 }, { duration: 400 }],
    })

    controller.session.selectedFrameId = 3
    controller.handleMoveFrame(-1)

    expect(applyAnimationFrameReorder).toHaveBeenCalledWith('/game/animation/opening.json', 2, 1)
    expect(controller.session.selectedFrameId).toBe(2)
    expect(scheduleAutoSaveIfEnabled).toHaveBeenCalledWith('/game/animation/opening.json')

    scope.stop()
  })

  it('选中帧已在边界时前移与后移不会请求重排', () => {
    const { applyAnimationFrameReorder, controller, scope } = createFixture({
      frames: [{ duration: 200 }, { duration: 300 }],
    })

    controller.session.selectedFrameId = 1
    controller.handleMoveFrame(-1)
    controller.session.selectedFrameId = 2
    controller.handleMoveFrame(1)

    expect(applyAnimationFrameReorder).not.toHaveBeenCalled()

    scope.stop()
  })

  it('选中第一帧与最后一帧会更新选中帧', () => {
    const { controller, scope } = createFixture({
      frames: [{ duration: 200 }, { duration: 300 }, { duration: 400 }],
    })

    controller.handleSelectLastFrame()
    expect(controller.session.selectedFrameId).toBe(3)

    controller.handleSelectFirstFrame()
    expect(controller.session.selectedFrameId).toBe(1)

    scope.stop()
  })

  it('水平翻转会按变换 patch 写入选中帧', () => {
    const { applyAnimationFrameUpdate, controller, scope } = createFixture({
      frames: [{ duration: 200 }],
    })

    controller.handleFlipScaleAxis('x')

    expect(applyAnimationFrameUpdate).toHaveBeenCalledWith(
      '/game/animation/opening.json',
      0,
      { scale: { x: -1 } },
    )

    scope.stop()
  })
})
