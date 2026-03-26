import { describe, expect, it } from 'vitest'

import {
  MIN_SPAN_PX,
  MIN_START_SPAN_PX,
  resolveAnimationTimelineAnchoredScrollLeft,
  resolveAnimationTimelineContainerWidth,
  resolveZeroDurationSpanLayoutPercents,
} from '../animation-timeline-layout'

describe('resolveAnimationTimelineContainerWidth 计算逻辑', () => {
  it('当最小片段总宽度超过基础容器宽度时扩展时间轴容器', () => {
    const containerWidth = resolveAnimationTimelineContainerWidth(120, 1, [
      { isHold: true },
      { isHold: false },
      { isHold: false },
      { isHold: false },
    ])

    expect(containerWidth).toBe(MIN_START_SPAN_PX + (MIN_SPAN_PX * 3))
  })

  it('在缩放后的基础宽度更大时保留缩放宽度', () => {
    const containerWidth = resolveAnimationTimelineContainerWidth(200, 2, [
      { isHold: true },
      { isHold: false },
    ])

    expect(containerWidth).toBe(400)
  })
})

describe('resolveZeroDurationSpanLayoutPercents 计算逻辑', () => {
  it('总时长为 0 时仍保证首帧和后续帧的最小像素宽度', () => {
    const containerWidth = 160
    const layout = resolveZeroDurationSpanLayoutPercents(containerWidth, [
      { isHold: true },
      { isHold: false },
      { isHold: false },
    ])

    expect(layout).toHaveLength(3)
    expect((layout[0]?.width ?? 0) / 100 * containerWidth).toBeGreaterThanOrEqual(MIN_START_SPAN_PX)
    expect((layout[1]?.width ?? 0) / 100 * containerWidth).toBeGreaterThanOrEqual(MIN_SPAN_PX)
    expect((layout[2]?.width ?? 0) / 100 * containerWidth).toBeGreaterThanOrEqual(MIN_SPAN_PX)
    expect(layout[1]?.left).toBeCloseTo(layout[0]?.width ?? 0)
    expect(layout.reduce((sum, item) => sum + item.width, 0)).toBeCloseTo(100)
  })
})

describe('resolveAnimationTimelineAnchoredScrollLeft 计算逻辑', () => {
  it('内容宽度被最小宽度钳制时按真实内容宽度保持滚动锚点', () => {
    const nextScrollLeft = resolveAnimationTimelineAnchoredScrollLeft({
      contentPosition: 80,
      cursorX: 20,
      nextZoom: 1.5,
      previousZoom: 1,
      spans: [
        { isHold: true },
        { isHold: false },
        { isHold: false },
        { isHold: false },
      ],
      viewportWidth: 100,
    })

    expect(nextScrollLeft).toBe(60)
  })
})
