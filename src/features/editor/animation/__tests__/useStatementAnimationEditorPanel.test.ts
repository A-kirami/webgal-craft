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

describe('useStatementAnimationEditorPanel 行为', () => {
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
})
