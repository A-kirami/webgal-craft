import { describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive } from 'vue'

import { useStatementAnimationEditorPanel } from '../useStatementAnimationEditorPanel'

import type { AnimationFrame } from '~/domain/stage/types'

function createFrames(): AnimationFrame[] {
  return [
    {
      duration: 120,
      position: { x: 10 },
    },
    {
      duration: 180,
      alpha: 0.5,
    },
    {
      duration: 240,
      position: { x: 30 },
    },
  ]
}

function createFixture(framesFactory: () => AnimationFrame[] = createFrames) {
  const frames = reactive<AnimationFrame[]>(framesFactory())
  const emitFrames = vi.fn((nextFrames: AnimationFrame[]) => {
    frames.splice(0, frames.length, ...nextFrames)
  })
  const scope = effectScope()
  const controller = scope.run(() => useStatementAnimationEditorPanel({
    emitFrames,
    frames: () => frames,
  }))

  if (!controller) {
    throw new TypeError('预期返回动画编辑器面板 controller')
  }

  return {
    controller,
    emitFrames,
    frames,
    scope,
  }
}

describe('useStatementAnimationEditorPanel', () => {
  it('删除当前帧前会先清空草稿，避免旧草稿挂到重排后的帧上', async () => {
    const { controller, emitFrames, scope } = createFixture()

    controller.session.selectedFrameId = 2
    controller.handleTransformUpdate({
      flush: false,
      value: { alpha: 1 },
    })

    expect(controller.session.selectedFrameState?.transform).toEqual({ alpha: 1 })

    controller.handleDeleteFrame()
    await nextTick()

    expect(emitFrames).toHaveBeenCalledTimes(1)
    expect(controller.session.selectedFrameId).toBe(2)
    expect(controller.session.selectedFrameState?.transform).toEqual({
      position: { x: 30 },
    })

    scope.stop()
  })

  it('时间轴返回无效帧时不会写回帧列表', () => {
    const { controller, emitFrames, scope } = createFixture()

    controller.handleTimelineResizeDuration({
      duration: 320,
      flush: true,
      id: 99,
    })

    expect(emitFrames).not.toHaveBeenCalled()

    scope.stop()
  })

  it('撤销与重做按整份帧回放已提交的改动', () => {
    const { controller, frames, scope } = createFixture()

    controller.session.selectedFrameId = 2
    controller.handleDurationUpdate('300')
    expect(frames[1]?.duration).toBe(300)

    controller.handleUndo()
    expect(frames[1]?.duration).toBe(180)

    controller.handleRedo()
    expect(frames[1]?.duration).toBe(300)

    scope.stop()
  })

  it('新增或删除帧后可以撤销回原列表', () => {
    const { controller, frames, scope } = createFixture()

    controller.session.selectedFrameId = 3
    controller.handleDeleteFrame()
    expect(frames).toHaveLength(2)

    controller.handleUndo()
    expect(frames).toHaveLength(3)

    controller.handleAddFrame()
    expect(frames).toHaveLength(4)

    controller.handleUndo()
    expect(frames).toHaveLength(3)

    scope.stop()
  })

  it('撤销后再提交新改动会清空重做栈', () => {
    const { controller, frames, scope } = createFixture()

    controller.session.selectedFrameId = 1
    controller.handleDurationUpdate('300')
    controller.handleUndo()
    expect(frames[0]?.duration).toBe(120)

    controller.handleDurationUpdate('400')
    controller.handleRedo()

    expect(frames[0]?.duration).toBe(400)

    scope.stop()
  })

  it('没有历史时撤销与重做不会写回帧列表', () => {
    const { controller, emitFrames, scope } = createFixture()

    controller.handleUndo()
    controller.handleRedo()

    expect(emitFrames).not.toHaveBeenCalled()

    scope.stop()
  })
})
