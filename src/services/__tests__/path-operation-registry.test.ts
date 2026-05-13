import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AbsPath } from '~/domain/path'
import {
  clearPendingPathOperations,
  hasOverlappingPathOperation,
  lookupPathOperationByPath,
  pathOperationRegistry,
  registerPathOperation,
  releasePathOperation,
  updatePathOperationChannel,
} from '~/services/path-operation-registry'

describe('pathOperationRegistry', () => {
  beforeEach(() => {
    vi.useRealTimers()
    clearPendingPathOperations()
  })

  afterEach(() => {
    clearPendingPathOperations()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('精确路径、祖先路径和后代路径都会被视为进行中冲突', () => {
    registerPathOperation({
      sourcePath: AbsPath.from('/project/game/background'),
      targetPath: AbsPath.from('/project/game/background-next'),
    })

    expect(hasOverlappingPathOperation([
      AbsPath.from('/project/game/background'),
    ])).toBe(true)
    expect(hasOverlappingPathOperation([
      AbsPath.from('/project/game/background/bg.jpg'),
    ])).toBe(true)
    expect(hasOverlappingPathOperation([
      AbsPath.from('/project/game'),
    ])).toBe(true)
    expect(hasOverlappingPathOperation([
      AbsPath.from('/project/game/figure/hero.png'),
    ])).toBe(false)
  })

  it('native 通道按 watcher 回声计数释放', () => {
    const pendingId = registerPathOperation({
      sourcePath: AbsPath.from('/project/game/background/bg.jpg'),
      targetPath: AbsPath.from('/project/game/background/renamed.jpg'),
    })

    updatePathOperationChannel(pendingId, {
      echoMode: 'watcher',
      expectedEchoes: 2,
    })

    expect(pathOperationRegistry.consumeRenameEcho(
      AbsPath.from('/project/game/background/bg.jpg'),
      AbsPath.from('/project/game/background/renamed.jpg'),
    )).toBe(true)
    expect(hasOverlappingPathOperation([
      AbsPath.from('/project/game/background/bg.jpg'),
    ])).toBe(true)

    expect(pathOperationRegistry.consumeRenameEcho(
      AbsPath.from('/project/game/background/bg.jpg'),
      AbsPath.from('/project/game/background/renamed.jpg'),
    )).toBe(true)
    expect(hasOverlappingPathOperation([
      AbsPath.from('/project/game/background/bg.jpg'),
    ])).toBe(false)
  })

  it('synthetic 通道不等待 watcher 回声，由调用方立即释放', () => {
    const pendingId = registerPathOperation({
      sourcePath: AbsPath.from('/project/game/background/bg.jpg'),
      targetPath: AbsPath.from('/project/game/background/chapter1/bg.jpg'),
    })

    updatePathOperationChannel(pendingId, {
      echoMode: 'synthetic',
      expectedEchoes: 0,
    })

    expect(hasOverlappingPathOperation([
      AbsPath.from('/project/game/background/bg.jpg'),
    ])).toBe(true)

    releasePathOperation(pendingId)

    expect(hasOverlappingPathOperation([
      AbsPath.from('/project/game/background/bg.jpg'),
    ])).toBe(false)
  })

  it('目录 rename 的子路径 watcher 回声可以命中同一条 pending 记录', () => {
    const pendingId = registerPathOperation({
      sourcePath: AbsPath.from('/project/game/background/old'),
      targetPath: AbsPath.from('/project/game/background/new'),
    })

    updatePathOperationChannel(pendingId, {
      echoMode: 'watcher',
      expectedEchoes: 1,
    })

    expect(pathOperationRegistry.consumeRenameEcho(
      AbsPath.from('/project/game/background/old/chapter/bg.jpg'),
      AbsPath.from('/project/game/background/new/chapter/bg.jpg'),
    )).toBe(true)
    expect(lookupPathOperationByPath(
      AbsPath.from('/project/game/background/new/chapter/bg.jpg'),
    )).toBeUndefined()
  })

  it('目录 modify 回声可以命中同一条 pending 记录', () => {
    const pendingId = registerPathOperation({
      sourcePath: AbsPath.from('/project/game/background/old'),
      targetPath: AbsPath.from('/project/game/background/new'),
    })

    updatePathOperationChannel(pendingId, {
      echoMode: 'watcher',
      expectedEchoes: 1,
    })

    expect(lookupPathOperationByPath(
      AbsPath.from('/project/game/background/new/chapter/bg.jpg'),
    )?.id).toBe(pendingId)
  })
})
