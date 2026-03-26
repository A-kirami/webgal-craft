export interface AnimationTimelineWidthSpan {
  isHold: boolean
}

export interface AnimationTimelinePercentLayout {
  left: number
  width: number
}

export const MIN_SPAN_PX = 32
export const MIN_START_SPAN_PX = 64

function getAnimationTimelineMinimumSpanWidth(span: AnimationTimelineWidthSpan): number {
  return span.isHold ? MIN_START_SPAN_PX : MIN_SPAN_PX
}

export function resolveAnimationTimelineContainerWidth(
  viewportWidth: number,
  zoomLevel: number,
  spans: readonly AnimationTimelineWidthSpan[],
): number {
  if (viewportWidth <= 0) {
    return 0
  }

  const scaledWidth = Math.max(viewportWidth, viewportWidth * zoomLevel)
  const minimumWidth = spans.reduce((sum, span) => {
    return sum + getAnimationTimelineMinimumSpanWidth(span)
  }, 0)

  return Math.max(scaledWidth, minimumWidth)
}

export function resolveZeroDurationSpanLayoutPercents(
  containerWidth: number,
  spans: readonly AnimationTimelineWidthSpan[],
): AnimationTimelinePercentLayout[] {
  if (containerWidth <= 0 || spans.length === 0) {
    return []
  }

  const minimumWidth = spans.reduce((sum, span) => {
    return sum + getAnimationTimelineMinimumSpanWidth(span)
  }, 0)
  const extraWidthPerSpan = Math.max(containerWidth - minimumWidth, 0) / spans.length

  let leftPx = 0
  return spans.map((span) => {
    const widthPx = getAnimationTimelineMinimumSpanWidth(span) + extraWidthPerSpan
    const result = {
      left: (leftPx / containerWidth) * 100,
      width: (widthPx / containerWidth) * 100,
    } satisfies AnimationTimelinePercentLayout
    leftPx += widthPx
    return result
  })
}

export function resolveAnimationTimelineAnchoredScrollLeft(options: {
  contentPosition: number
  cursorX: number
  nextZoom: number
  previousZoom: number
  spans: readonly AnimationTimelineWidthSpan[]
  viewportWidth: number
}): number {
  const previousContentWidth = resolveAnimationTimelineContainerWidth(
    options.viewportWidth,
    options.previousZoom,
    options.spans,
  )
  if (previousContentWidth <= 0) {
    return 0
  }

  const nextContentWidth = resolveAnimationTimelineContainerWidth(
    options.viewportWidth,
    options.nextZoom,
    options.spans,
  )
  const widthRatio = nextContentWidth / previousContentWidth

  return (options.contentPosition * widthRatio) - options.cursorX
}
