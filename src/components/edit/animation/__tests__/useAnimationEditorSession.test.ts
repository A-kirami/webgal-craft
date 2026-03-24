import { describe, expect, it } from 'vitest'
import { effectScope, nextTick, reactive } from 'vue'

import { useAnimationEditorSession } from '../useAnimationEditorSession'

import type { AnimationFrame } from '~/types/stage'

function createFrames() {
  return reactive<AnimationFrame[]>([
    { duration: 120, position: { x: 10 } },
    { duration: 240, ease: 'easeOut', alpha: 0.5 },
  ])
}

function createSessionFixture() {
  const frames = createFrames()
  const scope = effectScope()
  const session = scope.run(() => useAnimationEditorSession(() => frames))
  if (!session) {
    throw new TypeError('预期返回动画编辑器会话')
  }

  return { frames, scope, session }
}

describe('useAnimationEditorSession', () => {
  it('根据帧列表派生关键帧和当前选中帧状态', () => {
    const { scope, session } = createSessionFixture()

    expect(session.keyframes).toEqual([
      {
        cumulativeTime: 120,
        duration: 120,
        id: 1,
      },
      {
        cumulativeTime: 360,
        duration: 240,
        ease: 'easeOut',
        id: 2,
      },
    ])
    expect(session.selectedFrameId).toBe(1)
    expect(session.selectedFrameState).toEqual({
      duration: '120',
      ease: '',
      id: 1,
      isEaseDisabled: true,
      isStartFrame: true,
      transform: { position: { x: 10 } },
    })

    scope.stop()
  })

  it('派生选中帧状态时使用时长和变换草稿', () => {
    const { scope, session } = createSessionFixture()

    session.selectedFrameId = 2
    session.setSelectedFrameDurationDraft(2, 80)
    session.setSelectedFrameTransformDraft({ alpha: 1, position: { y: 32 } })

    expect(session.keyframes).toEqual([
      {
        cumulativeTime: 120,
        duration: 120,
        id: 1,
      },
      {
        cumulativeTime: 200,
        duration: 80,
        ease: 'easeOut',
        id: 2,
      },
    ])
    expect(session.totalDuration).toBe(200)
    expect(session.selectedFrameState).toEqual({
      duration: '80',
      ease: 'easeOut',
      id: 2,
      isEaseDisabled: false,
      isStartFrame: false,
      transform: { alpha: 1, position: { y: 32 } },
    })

    session.resetSelectedFrameDrafts()
    expect(session.selectedFrameState).toEqual({
      duration: '240',
      ease: 'easeOut',
      id: 2,
      isEaseDisabled: false,
      isStartFrame: false,
      transform: { alpha: 0.5 },
    })

    scope.stop()
  })

  it('选中帧消失时回退到第一帧', async () => {
    const { frames, scope, session } = createSessionFixture()

    session.selectedFrameId = 2
    frames.splice(1, 1)
    await nextTick()

    expect(session.selectedFrameId).toBe(1)
    expect(session.selectedFrameState).toEqual({
      duration: '120',
      ease: '',
      id: 1,
      isEaseDisabled: true,
      isStartFrame: true,
      transform: { position: { x: 10 } },
    })

    scope.stop()
  })
})
