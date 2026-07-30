import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  commitMock,
  gameImportMock,
  materializer,
  prepareMock,
  publishMock,
  registerMock,
  rollbackMock,
  selectAndStageMock,
} = vi.hoisted(() => ({
  commitMock: vi.fn(),
  gameImportMock: vi.fn(),
  materializer: {
    cancel: vi.fn(),
    commit: vi.fn(),
    listRecoverableSessions: vi.fn(),
    publish: vi.fn(),
    rollback: vi.fn(),
    selectAndStage: vi.fn(),
  },
  prepareMock: vi.fn(),
  publishMock: vi.fn(),
  registerMock: vi.fn(),
  rollbackMock: vi.fn(),
  selectAndStageMock: vi.fn(),
}))

vi.mock('~/services/platform/runtime', () => ({
  isAndroidRuntime: () => true,
}))

vi.mock('~/features/resource-import/android-directory-materializer', () => ({
  androidDirectoryMaterializer: materializer,
}))

vi.mock('~/features/resource-import/desktop-directory-picker', () => ({
  desktopDirectoryPicker: {
    selectDirectory: vi.fn(),
  },
}))

vi.mock('~/services/game-manager', () => ({
  gameManager: {
    importGame: gameImportMock,
    prepareManagedImport: prepareMock,
    registerManagedImport: registerMock,
  },
}))

vi.mock('~/services/engine-manager', () => ({
  engineManager: {
    prepareManagedImport: vi.fn(),
    registerManagedImport: vi.fn(),
  },
}))

vi.mock('~/services/template-manager', () => ({
  templateManager: {
    prepareManagedImport: vi.fn(),
    registerManagedImport: vi.fn(),
  },
}))

import { createGameImportWorkflow } from '../resource-import-workflows'

describe('资源导入工作流', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
    materializer.selectAndStage = selectAndStageMock
    materializer.publish = publishMock
    materializer.commit = commitMock
    materializer.rollback = rollbackMock
    materializer.cancel = vi.fn()
    selectAndStageMock.mockResolvedValue({
      kind: 'staged',
      sessionId: 'session-1',
      stagingPath: '/games/.import-staging/session-1',
    })
    publishMock.mockResolvedValue({ finalPath: '/games/imported-game' })
    commitMock.mockResolvedValue(undefined)
    rollbackMock.mockResolvedValue(undefined)
    prepareMock.mockResolvedValue({
      kind: 'ready',
      prepared: { finalRelativePath: 'game-id', plan: {} },
    })
    registerMock.mockResolvedValue({ id: 'game-1' })
  })

  function createWorkflow(afterManagedCommit?: (id: string) => unknown) {
    return createGameImportWorkflow({
      android: true,
      afterManagedCommit,
      resolveDependencies: vi.fn(),
      selectTitle: 'Select game',
    })
  }

  it('commits after Dexie registration and never copies staged content again', async () => {
    const afterCommit = vi.fn()

    await expect(createWorkflow(afterCommit).importFromPicker()).resolves.toEqual({
      alreadyRegistered: false,
    })

    expect(selectAndStageMock).toHaveBeenCalledWith('game', expect.objectContaining({
      operation: { kind: 'import' },
      onProgress: expect.any(Function),
    }))
    expect(prepareMock).toHaveBeenCalledWith('/games/.import-staging/session-1')
    expect(publishMock).toHaveBeenCalledWith('session-1', 'game-id')
    expect(registerMock).toHaveBeenCalledWith('/games/imported-game', expect.any(Object), expect.anything())
    expect(commitMock).toHaveBeenCalledWith('session-1', 'game-1')
    expect(afterCommit).toHaveBeenCalledWith('game-1')
    expect(rollbackMock).not.toHaveBeenCalled()
  })

  it('treats picker cancellation as a silent outcome', async () => {
    selectAndStageMock.mockResolvedValue({ kind: 'cancelled' })

    await expect(createWorkflow().importFromPicker()).resolves.toBeUndefined()
    expect(prepareMock).not.toHaveBeenCalled()
    expect(publishMock).not.toHaveBeenCalled()
  })

  it('rolls back an unpublished session when registration fails', async () => {
    registerMock.mockRejectedValue(new Error('registration failed'))

    await expect(createWorkflow().importFromPicker()).rejects.toThrow('registration failed')
    expect(rollbackMock).toHaveBeenCalledWith('session-1')
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('does not roll back after registration when post-commit navigation fails', async () => {
    const afterCommit = vi.fn().mockRejectedValue(new Error('navigation failed'))

    await expect(createWorkflow(afterCommit).importFromPicker()).rejects.toThrow('navigation failed')
    expect(commitMock).toHaveBeenCalledWith('session-1', 'game-1')
    expect(rollbackMock).not.toHaveBeenCalled()
  })
})
