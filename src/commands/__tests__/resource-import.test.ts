import { beforeEach, describe, expect, it, vi } from 'vitest'

const { channels, safeInvokeMock } = vi.hoisted(() => ({
  channels: [] as { emit: (value: unknown) => void }[],
  safeInvokeMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  Channel: class Channel<T> {
    constructor(handler: (value: T) => void) {
      channels.push({ emit: value => handler(value as T) })
    }
  },
}))

vi.mock('~/utils/invoke', () => ({
  safeInvoke: safeInvokeMock,
}))

import { resourceImportCmds } from '../resource-import'

describe('resourceImportCmds', () => {
  beforeEach(() => {
    channels.length = 0
    safeInvokeMock.mockReset()
  })

  it('通过 native 命令创建托管副本并转发进度', async () => {
    safeInvokeMock.mockResolvedValue({
      kind: 'staged',
      sessionId: 'session-1',
      stagingPath: '/data/user/0/app/files/documents/WebGALCraft/games/.import-staging/session-1',
    })
    const onProgress = vi.fn()

    const promise = resourceImportCmds.selectAndStage('game', {
      operation: { kind: 'import' },
      onProgress,
    })
    channels[0]!.emit({ sessionId: 'session-1', phase: 'copying' })

    await expect(promise).resolves.toEqual({
      kind: 'staged',
      sessionId: 'session-1',
      stagingPath: '/data/user/0/app/files/documents/WebGALCraft/games/.import-staging/session-1',
    })
    expect(safeInvokeMock).toHaveBeenCalledWith('android_resource_import_select_and_stage', {
      kind: 'game',
      operation: { kind: 'import' },
      onProgress: expect.any(Object),
    })
    expect(onProgress).toHaveBeenCalledWith({ sessionId: 'session-1', phase: 'copying' })
  })

  it('仅通过 session 身份发布、提交与回滚', async () => {
    safeInvokeMock.mockResolvedValueOnce({
      finalPath: '/data/user/0/app/files/documents/WebGALCraft/engines/WebGAL/4.6.2',
    })
    safeInvokeMock.mockResolvedValue(undefined)

    await expect(resourceImportCmds.publish('session-1', 'WebGAL/4.6.2')).resolves.toEqual({
      finalPath: '/data/user/0/app/files/documents/WebGALCraft/engines/WebGAL/4.6.2',
    })
    await resourceImportCmds.commit('session-1', 'engine-1')
    await resourceImportCmds.rollback('session-2')

    expect(safeInvokeMock).toHaveBeenNthCalledWith(1, 'android_resource_import_publish', {
      sessionId: 'session-1',
      finalRelativePath: 'WebGAL/4.6.2',
    })
    expect(safeInvokeMock).toHaveBeenNthCalledWith(2, 'android_resource_import_commit', {
      sessionId: 'session-1',
      resourceId: 'engine-1',
    })
    expect(safeInvokeMock).toHaveBeenNthCalledWith(3, 'android_resource_import_rollback', {
      sessionId: 'session-2',
    })
  })

  it('将 picker 取消映射为不包含 URI 的结果', async () => {
    safeInvokeMock.mockResolvedValue({ kind: 'cancelled' })

    await expect(resourceImportCmds.selectAndStage('template'))
      .resolves.toEqual({ kind: 'cancelled' })
  })

  it('拒绝 native 返回的不完整暂存结果', async () => {
    safeInvokeMock.mockResolvedValue({ kind: 'staged', sessionId: 'session-1' })

    await expect(resourceImportCmds.selectAndStage('game'))
      .rejects.toThrow('incomplete staging result')
  })

  it('在命令边界统一转换 roots 与恢复 session 的绝对路径', async () => {
    safeInvokeMock
      .mockResolvedValueOnce({
        engine: '/private/engines',
        export: '/private/exports',
        game: '/private/games',
        template: '/private/templates',
      })
      .mockResolvedValueOnce([{
        finalPath: '/private/games/game-1',
        operation: { kind: 'import' },
        resourceKind: 'game',
        sessionId: 'session-1',
        stagingPath: '/private/games/.import-staging/session-1',
        status: 'published',
        updatedAt: 1,
      }])

    await expect(resourceImportCmds.resolveRoots()).resolves.toEqual({
      engine: '/private/engines',
      export: '/private/exports',
      game: '/private/games',
      template: '/private/templates',
    })
    await expect(resourceImportCmds.listRecoverableSessions()).resolves.toEqual([expect.objectContaining({
      finalPath: '/private/games/game-1',
      stagingPath: '/private/games/.import-staging/session-1',
    })])
  })

  it('拒绝缺少 existingGameId 的 relink session', async () => {
    safeInvokeMock.mockResolvedValue([{
      operation: { kind: 'relink' },
      resourceKind: 'game',
      sessionId: 'session-1',
      status: 'staged',
      updatedAt: 1,
    }])

    await expect(resourceImportCmds.listRecoverableSessions())
      .rejects.toThrow('invalid relink operation')
  })

  it('拒绝未知 operation kind 的 session', async () => {
    safeInvokeMock.mockResolvedValue([{
      operation: { kind: 'unknown' },
      resourceKind: 'game',
      sessionId: 'session-1',
      status: 'staged',
      updatedAt: 1,
    }])

    await expect(resourceImportCmds.listRecoverableSessions())
      .rejects.toThrow('unknown operation kind: unknown')
  })
})
