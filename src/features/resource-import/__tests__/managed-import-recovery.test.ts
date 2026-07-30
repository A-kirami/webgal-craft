import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AbsPath } from '~/domain/path'

import { recoverManagedImportSessions } from '../managed-import-recovery'

import type { DirectoryMaterializer, RecoverableImportSession } from '../directory-materializer'

vi.mock('@tauri-apps/plugin-log', () => ({
  error: vi.fn(),
}))

function createSession(
  overrides: Partial<RecoverableImportSession> = {},
): RecoverableImportSession {
  return {
    sessionId: 'session-1',
    resourceKind: 'game',
    operation: { kind: 'import' },
    status: 'staged',
    stagingPath: AbsPath.from('/games/.import-staging/session-1'),
    updatedAt: 1,
    ...overrides,
  }
}

function createMaterializer(sessions: RecoverableImportSession[]): DirectoryMaterializer {
  return {
    cancel: vi.fn(),
    commit: vi.fn(),
    listRecoverableSessions: vi.fn(async () => sessions),
    publish: vi.fn(),
    rollback: vi.fn(),
    selectAndStage: vi.fn(),
  }
}

describe('managed import recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each(['selecting', 'copying', 'staged', 'prepared'] as const)(
    '%s session 只清理 staging',
    async (status) => {
      const materializer = createMaterializer([createSession({ status })])
      const findRegisteredResource = vi.fn()

      await recoverManagedImportSessions({
        android: true,
        findRegisteredResource,
        materializer,
      })

      expect(materializer.rollback).toHaveBeenCalledWith('session-1')
      expect(materializer.commit).not.toHaveBeenCalled()
      expect(findRegisteredResource).not.toHaveBeenCalled()
    },
  )

  it('published session 仅在对应资源表路径已注册时补 commit', async () => {
    const materializer = createMaterializer([createSession({
      finalPath: AbsPath.from('/engines/WebGAL/4.6.2'),
      resourceKind: 'engine',
      status: 'published',
    })])
    const findRegisteredResource = vi.fn(async () => ({ id: 'engine-record' }))

    await recoverManagedImportSessions({
      android: true,
      findRegisteredResource,
      materializer,
    })

    expect(findRegisteredResource).toHaveBeenCalledWith(
      'engine',
      '/engines/webgal/4.6.2',
    )
    expect(materializer.commit).toHaveBeenCalledWith('session-1', 'engine-record')
    expect(materializer.rollback).not.toHaveBeenCalled()
  })

  it('其他资源表存在相同路径不能误判为已提交', async () => {
    const materializer = createMaterializer([createSession({
      finalPath: AbsPath.from('/templates/Shared'),
      resourceKind: 'template',
      status: 'published',
    })])
    const findRegisteredResource = vi.fn(async (kind: string) => {
      return kind === 'game' ? { id: 'wrong-game' } : undefined
    })

    await recoverManagedImportSessions({
      android: true,
      findRegisteredResource,
      materializer,
    })

    expect(findRegisteredResource).toHaveBeenCalledOnce()
    expect(findRegisteredResource).toHaveBeenCalledWith('template', '/templates/shared')
    expect(materializer.rollback).toHaveBeenCalledWith('session-1')
    expect(materializer.commit).not.toHaveBeenCalled()
  })

  it('relink session 仅接受既有 game ID 指向 final path', async () => {
    const materializer = createMaterializer([createSession({
      finalPath: AbsPath.from('/games/relinked'),
      operation: { kind: 'relink', existingGameId: 'game-1' },
      status: 'published',
    })])
    const findRegisteredResource = vi.fn(async () => ({ id: 'game-2' }))

    await recoverManagedImportSessions({
      android: true,
      findRegisteredResource,
      materializer,
    })

    expect(materializer.rollback).toHaveBeenCalledWith('session-1')
    expect(materializer.commit).not.toHaveBeenCalled()
  })

  it('单个 session 恢复失败时继续处理其余 session', async () => {
    const materializer = createMaterializer([
      createSession({ sessionId: 'failed-session' }),
      createSession({ sessionId: 'next-session' }),
    ])
    vi.mocked(materializer.rollback)
      .mockRejectedValueOnce(new Error('cleanup failed'))
      .mockResolvedValueOnce(undefined)

    await recoverManagedImportSessions({
      android: true,
      findRegisteredResource: vi.fn(),
      materializer,
    })

    expect(materializer.rollback).toHaveBeenNthCalledWith(1, 'failed-session')
    expect(materializer.rollback).toHaveBeenNthCalledWith(2, 'next-session')
  })

  it('desktop 不访问 Android session', async () => {
    const materializer = createMaterializer([createSession()])

    await recoverManagedImportSessions({ android: false, materializer })

    expect(materializer.listRecoverableSessions).not.toHaveBeenCalled()
  })
})
