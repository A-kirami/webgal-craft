export interface AnimationTimelineWidthSpan {
  isHold: boolean
}

export const MIN_SPAN_PX = 32
export const MIN_START_SPAN_PX = 64

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
    return sum + (span.isHold ? MIN_START_SPAN_PX : MIN_SPAN_PX)
  }, 0)

  return Math.max(scaledWidth, minimumWidth)
}
