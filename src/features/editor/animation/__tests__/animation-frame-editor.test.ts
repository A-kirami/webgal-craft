import { describe, expect, it } from 'vitest'

import {
  deleteAnimationFrameAtSelection,
  insertAnimationFrameAfterSelection,
  normalizeAnimationFrameDurationInput,
  normalizeAnimationFrameEaseInput,
  resolveAnimationTimelineDurationChange,
  updateAnimationFrameAt,
} from '../animation-frame-editor'

import type { AnimationFrame } from '~/domain/stage/types'

describe('动画帧编辑辅助函数', () => {
  it('在选中帧后插入新帧并返回新的选中帧 id', () => {
    const frames = reactive<AnimationFrame[]>([
      { duration: 120, alpha: 0.2 },
      { duration: 240, alpha: 0.8 },
    ])

    const result = insertAnimationFrameAfterSelection(frames, 0, { duration: 0 })

    expect(result).toEqual({
      nextFrames: [
        { duration: 120, alpha: 0.2 },
        { duration: 0 },
        { duration: 240, alpha: 0.8 },
      ],
      selectedFrameId: 2,
    })
    expect(result.nextFrames).not.toBe(frames)
    expect(result.nextFrames[0]).not.toBe(frames[0])
    expect(result.nextFrames[2]).not.toBe(frames[1])
  })

  it('未选中帧时会把新帧追加到末尾', () => {
    expect(insertAnimationFrameAfterSelection([
      { duration: 120 },
    ], -1, { duration: 0 })).toEqual({
      nextFrames: [
        { duration: 120 },
        { duration: 0 },
      ],
      selectedFrameId: 2,
    })
  })

  it('删除选中帧时会返回剩余帧和新的选中帧 id', () => {
    expect(deleteAnimationFrameAtSelection([
      { duration: 120, alpha: 0.2 },
      { duration: 240, alpha: 0.8 },
      { duration: 360, alpha: 1 },
    ], 1)).toEqual({
      nextFrames: [
        { duration: 120, alpha: 0.2 },
        { duration: 360, alpha: 1 },
      ],
      selectedFrameId: 2,
    })

    expect(deleteAnimationFrameAtSelection([{ duration: 120 }], -1)).toBeUndefined()
  })

  it('更新指定帧时会克隆原数组并仅合并目标 patch', () => {
    const frames = reactive<AnimationFrame[]>([
      { duration: 120, alpha: 0.2 },
      { duration: 240, alpha: 0.8, ease: 'linear' },
    ])

    const result = updateAnimationFrameAt(frames, 1, { duration: 300, ease: 'easeOut' })

    expect(result).toEqual([
      { duration: 120, alpha: 0.2 },
      { duration: 300, alpha: 0.8, ease: 'easeOut' },
    ])
    expect(result?.[0]).not.toBe(frames[0])
    expect(result?.[1]).not.toBe(frames[1])
    expect(updateAnimationFrameAt(frames, 9, { duration: 10 })).toBeUndefined()
    expect(updateAnimationFrameAt(frames, 0, {})).toBeUndefined()
  })

  it('规范化 duration 输入时会把空字符串视为 0，并拒绝非法值', () => {
    expect(normalizeAnimationFrameDurationInput(' 240 ')).toBe(240)
    expect(normalizeAnimationFrameDurationInput('')).toBe(0)
    expect(normalizeAnimationFrameDurationInput('abc')).toBeUndefined()
    expect(normalizeAnimationFrameDurationInput('-1')).toBeUndefined()
  })

  it('解析时间轴调整时会四舍五入、钳制到非负值，并忽略失效帧', () => {
    expect(resolveAnimationTimelineDurationChange([
      { duration: 120 },
      { duration: 240 },
    ], {
      duration: 199.6,
      id: 2,
    })).toEqual({
      duration: 200,
      frameId: 2,
      frameIndex: 1,
    })

    expect(resolveAnimationTimelineDurationChange([
      { duration: 120 },
    ], {
      duration: -5.2,
      id: 1,
    })).toEqual({
      duration: 0,
      frameId: 1,
      frameIndex: 0,
    })

    expect(resolveAnimationTimelineDurationChange([
      { duration: 120 },
    ], {
      duration: 320,
      id: 9,
    })).toBeUndefined()
  })

  it('规范化 ease 输入时会裁剪空白并把空字符串转成 undefined', () => {
    expect(normalizeAnimationFrameEaseInput(' easeOut ')).toBe('easeOut')
    expect(normalizeAnimationFrameEaseInput('   ')).toBeUndefined()
  })
})
