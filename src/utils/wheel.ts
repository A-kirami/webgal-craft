/**
 * 将垂直滚轮事件转换为水平滚动，用于水平滚动区域。
 */
export function handleWheelToHorizontalScroll(event: WheelEvent) {
  const el = event.currentTarget as HTMLElement
  // 只处理垂直滚动，忽略已经是水平滚动的情况
  if (!el || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) {
    return
  }

  const previousLeft = el.scrollLeft
  el.scrollLeft += event.deltaY
  // 仅在实际发生水平滚动时阻止默认行为，避免吞掉边界处的垂直滚动
  if (el.scrollLeft !== previousLeft) {
    event.preventDefault()
  }
}
