import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  commitPendingFileWrite,
  hasPendingFileWrite,
  matchesPendingFileWrite,
  registerPendingFileWrite,
  rollbackPendingFileWrite,
} from '../file-write-echo-registry'

describe('fileWriteEchoRegistry', () => {
  let pendingWrites: ReturnType<typeof registerPendingFileWrite>[] = []

  beforeEach(() => {
    pendingWrites = []
    vi.useRealTimers()
  })

  afterEach(() => {
    for (const pendingWrite of pendingWrites) {
      rollbackPendingFileWrite(pendingWrite)
    }
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('同一次写入在过期前可重复命中多次回响', () => {
    const bytes = new Uint8Array([1, 2, 3])

    pendingWrites.push(registerPendingFileWrite(String.raw`C:\project\game\scene-a.txt`, bytes))

    expect(hasPendingFileWrite('C:/project/game/scene-a.txt')).toBe(true)
    expect(matchesPendingFileWrite('C:/project/game/scene-a.txt', bytes)).toBe(true)
    expect(matchesPendingFileWrite('C:/project/game/scene-a.txt', bytes)).toBe(true)
  })

  it('同路径新写入成功后会淘汰旧快照', () => {
    const oldBytes = new Uint8Array([1, 2, 3])
    const newBytes = new Uint8Array([4, 5, 6])

    pendingWrites.push(registerPendingFileWrite('/project/game/scene-a.txt', oldBytes))
    const latestWrite = registerPendingFileWrite('/project/game/scene-a.txt', newBytes)
    pendingWrites.push(latestWrite)

    commitPendingFileWrite(latestWrite)

    expect(matchesPendingFileWrite('/project/game/scene-a.txt', oldBytes)).toBe(false)
    expect(matchesPendingFileWrite('/project/game/scene-a.txt', newBytes)).toBe(true)
    expect(matchesPendingFileWrite('/project/game/scene-a.txt', newBytes)).toBe(true)
  })

  it('回滚后不再命中已登记的写入', () => {
    const bytes = new Uint8Array([4, 5, 6])
    const handle = registerPendingFileWrite('/project/game/scene-b.txt', bytes)
    pendingWrites.push(handle)

    rollbackPendingFileWrite(handle)

    expect(hasPendingFileWrite('/project/game/scene-b.txt')).toBe(false)
    expect(matchesPendingFileWrite('/project/game/scene-b.txt', bytes)).toBe(false)
  })

  it('过期后会自动清理未消费的写入', () => {
    vi.useFakeTimers()
    const bytes = new Uint8Array([7, 8, 9])

    pendingWrites.push(registerPendingFileWrite('/project/game/scene-c.txt', bytes))
    vi.advanceTimersByTime(30 * 1000 + 1)

    expect(hasPendingFileWrite('/project/game/scene-c.txt')).toBe(false)
    expect(matchesPendingFileWrite('/project/game/scene-c.txt', bytes)).toBe(false)
  })
})
