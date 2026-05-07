import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AbsPath } from '~/domain/path'

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

    pendingWrites.push(registerPendingFileWrite(AbsPath.from(String.raw`C:\project\game\scene-a.txt`), bytes))

    expect(hasPendingFileWrite(AbsPath.from('C:/project/game/scene-a.txt'))).toBe(true)
    expect(matchesPendingFileWrite(AbsPath.from('C:/project/game/scene-a.txt'), bytes)).toBe(true)
    expect(matchesPendingFileWrite(AbsPath.from('C:/project/game/scene-a.txt'), bytes)).toBe(true)
  })

  it('同路径新写入成功后会淘汰旧快照', () => {
    const oldBytes = new Uint8Array([1, 2, 3])
    const newBytes = new Uint8Array([4, 5, 6])
    const path = AbsPath.from('/project/game/scene-a.txt')

    pendingWrites.push(registerPendingFileWrite(path, oldBytes))
    const latestWrite = registerPendingFileWrite(path, newBytes)
    pendingWrites.push(latestWrite)

    commitPendingFileWrite(latestWrite)

    expect(matchesPendingFileWrite(path, oldBytes)).toBe(false)
    expect(matchesPendingFileWrite(path, newBytes)).toBe(true)
    expect(matchesPendingFileWrite(path, newBytes)).toBe(true)
  })

  it('回滚后不再命中已登记的写入', () => {
    const bytes = new Uint8Array([4, 5, 6])
    const path = AbsPath.from('/project/game/scene-b.txt')
    const handle = registerPendingFileWrite(path, bytes)
    pendingWrites.push(handle)

    rollbackPendingFileWrite(handle)

    expect(hasPendingFileWrite(path)).toBe(false)
    expect(matchesPendingFileWrite(path, bytes)).toBe(false)
  })

  it('过期后会自动清理未消费的写入', () => {
    vi.useFakeTimers()
    const bytes = new Uint8Array([7, 8, 9])
    const path = AbsPath.from('/project/game/scene-c.txt')

    pendingWrites.push(registerPendingFileWrite(path, bytes))
    vi.advanceTimersByTime(30 * 1000 + 1)

    expect(hasPendingFileWrite(path)).toBe(false)
    expect(matchesPendingFileWrite(path, bytes)).toBe(false)
  })
})
