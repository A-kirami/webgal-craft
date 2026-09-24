import { clamp } from '~/utils/math'

/** WheelEvent.deltaMode 的行模式取值。用字面量而不是 DOM_DELTA_* 常量，便于在 Node 环境直接测试。 */
const DELTA_MODE_LINE = 1

/** 像素模式下滚轮一格的上报量：Chromium 桌面端把一格滚轮折算为 100px。 */
const WHEEL_NOTCH_PIXELS = 100
/** 行模式下滚轮一格的行数：Firefox 等以行上报滚轮量，一格约 3 行。 */
const WHEEL_NOTCH_LINES = 3

/**
 * 把滚轮事件折算为格数。
 *
 * 触控板会以远小于一格的增量密集上报，直接按事件计步会一次跳过大量候选项，
 * 因此调用方需要按本函数的结果累计，凑满一格才步进一次。
 */
export function resolveWheelNotches(event: { deltaMode: number, deltaY: number }): number {
  return event.deltaMode === DELTA_MODE_LINE
    ? event.deltaY / WHEEL_NOTCH_LINES
    : event.deltaY / WHEEL_NOTCH_PIXELS
}

/**
 * 计算滚轮步进一格后的取值；已在两端时返回 undefined。
 * 当前值不在候选项中时，从滚动方向对应的一端进入列表。
 */
export function resolveWheelSelectValue(
  optionValues: readonly string[],
  currentValue: string,
  direction: 1 | -1,
): string | undefined {
  const currentIndex = optionValues.indexOf(currentValue)
  if (currentIndex === -1) {
    return direction > 0 ? optionValues[0] : optionValues.at(-1)
  }

  const nextIndex = clamp(currentIndex + direction, 0, optionValues.length - 1)
  return nextIndex === currentIndex ? undefined : optionValues[nextIndex]
}
