import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  hasPendingFileWrite,
  matchesPendingFileWrite,
  registerPendingFileWrite,
  rollbackPendingFileWrite,
} from '../file-write-echo-registry'

describe('fileWriteEchoRegistry', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('同一次写入在过期前可重复命中多次回响', () => {
    const bytes = new Uint8Array([1, 2, 3])

    registerPendingFileWrite(String.raw`C:\project\game\scene-a.txt`, bytes)

    expect(hasPendingFileWrite('C:/project/game/scene-a.txt')).toBe(true)
    expect(matchesPendingFileWrite('C:/project/game/scene-a.txt', bytes)).toBe(true)
    expect(matchesPendingFileWrite('C:/project/game/scene-a.txt', bytes)).toBe(true)
  })

  it('回滚后不再命中已登记的写入', () => {
    const bytes = new Uint8Array([4, 5, 6])
    const handle = registerPendingFileWrite('/project/game/scene-b.txt', bytes)

    rollbackPendingFileWrite(handle)

    expect(hasPendingFileWrite('/project/game/scene-b.txt')).toBe(false)
    expect(matchesPendingFileWrite('/project/game/scene-b.txt', bytes)).toBe(false)
  })

  it('过期后会自动清理未消费的写入', () => {
    vi.useFakeTimers()
    const bytes = new Uint8Array([7, 8, 9])

    registerPendingFileWrite('/project/game/scene-c.txt', bytes)
    vi.advanceTimersByTime(30 * 1000 + 1)

    expect(hasPendingFileWrite('/project/game/scene-c.txt')).toBe(false)
    expect(matchesPendingFileWrite('/project/game/scene-c.txt', bytes)).toBe(false)
  })
})
