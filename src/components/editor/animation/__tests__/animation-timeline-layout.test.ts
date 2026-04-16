import { describe, expect, it } from 'vitest'

import {
  MIN_SPAN_PX,
  MIN_START_SPAN_PX,
  resolveAnimationTimelineAnchoredScrollLeft,
  resolveAnimationTimelineContainerWidth,
  resolveAnimationTimelineResizeMsPerPixel,
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

  it('默认不引入末端缓冲区，缩放锚点按时间轨道宽度计算', () => {
    const nextScrollLeft = resolveAnimationTimelineAnchoredScrollLeft({
      contentPosition: 80,
      cursorX: 20,
      nextZoom: 2,
      previousZoom: 1,
      spans: [
        { isHold: true },
        { isHold: false },
      ],
      viewportWidth: 200,
    })

    expect(nextScrollLeft).toBe(140)
  })
})

describe('resolveAnimationTimelineResizeMsPerPixel 计算逻辑', () => {
  it('零时长帧使用至少 1ms/px 的拖拽比例，确保可以从 0ms 拉出', () => {
    expect(resolveAnimationTimelineResizeMsPerPixel(0, 64)).toBe(1)
  })

  it('当时间块因最小宽度被撑开时，拖拽比例仍保持至少 1ms/px，避免重新拖拽后卡在任意小正数', () => {
    expect(resolveAnimationTimelineResizeMsPerPixel(9, 32)).toBe(1)
    expect(resolveAnimationTimelineResizeMsPerPixel(32, 32)).toBe(1)
    expect(resolveAnimationTimelineResizeMsPerPixel(9, 32.25)).toBeGreaterThanOrEqual(1)
  })

  it('当时间块未被最小宽度撑开时，仍按真实时长与宽度比例计算', () => {
    expect(resolveAnimationTimelineResizeMsPerPixel(120, 32)).toBe(3.75)
  })
})
