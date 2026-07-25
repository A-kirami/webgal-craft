import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'

import { formatExportElapsedSeconds, useExportElapsedTimer } from '../useExportElapsedTimer'

describe('useExportElapsedTimer', () => {
  it.each([
    ['zh-Hans', 2, '2'],
    ['en-US', 2.34, '2.3'],
    ['de-DE', 2.34, '2,3'],
  ])('按 %s 格式化 %s 秒', (locale, seconds, expected) => {
    expect(formatExportElapsedSeconds(seconds, locale)).toBe(expected)
  })

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('使用单调时钟刷新、冻结并重置导出耗时', async () => {
    let now = 100
    const scope = effectScope()
    const timer = scope.run(() => useExportElapsedTimer({
      now: () => now,
      updateIntervalMs: 1000,
    }))!

    timer.start()
    expect(timer.elapsedMs.value).toBe(0)

    now = 3300
    await vi.advanceTimersByTimeAsync(1000)
    expect(timer.elapsedMs.value).toBe(3200)

    timer.stop()
    now = 8000
    await vi.advanceTimersByTimeAsync(2000)
    expect(timer.elapsedMs.value).toBe(3200)

    timer.reset()
    expect(timer.elapsedMs.value).toBeUndefined()
    scope.stop()
  })
})
