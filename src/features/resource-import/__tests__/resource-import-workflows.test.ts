import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  commitMock,
  gameImportMock,
  loggerErrorMock,
  materializer,
  prepareMock,
  publishMock,
  registerMock,
  rollbackMock,
  selectAndStageMock,
  templatePrepareMock,
  templateRegisterMock,
} = vi.hoisted(() => ({
  commitMock: vi.fn(),
  gameImportMock: vi.fn(),
  loggerErrorMock: vi.fn(),
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
  templatePrepareMock: vi.fn(),
  templateRegisterMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  error: loggerErrorMock,
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
    prepareManagedImport: templatePrepareMock,
    registerManagedImport: templateRegisterMock,
  },
}))

import { createGameImportWorkflow, createTemplateImportWorkflow } from '../resource-import-workflows'

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

  function createTemplateWorkflow() {
    return createTemplateImportWorkflow({
      android: true,
      selectTitle: 'Select template',
    })
  }

  it('Dexie 注册后提交 session 且不会再次复制暂存内容', async () => {
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
    expect(registerMock.mock.invocationCallOrder[0]).toBeLessThan(commitMock.mock.invocationCallOrder[0])
    expect(rollbackMock).not.toHaveBeenCalled()
  })

  it('目录选择取消时静默结束', async () => {
    selectAndStageMock.mockResolvedValue({ kind: 'cancelled' })

    await expect(createWorkflow().importFromPicker()).resolves.toBeUndefined()
    expect(prepareMock).not.toHaveBeenCalled()
    expect(publishMock).not.toHaveBeenCalled()
  })

  it('资源注册失败时回滚未提交的 session', async () => {
    registerMock.mockRejectedValue(new Error('registration failed'))

    await expect(createWorkflow().importFromPicker()).rejects.toThrow('registration failed')
    expect(rollbackMock).toHaveBeenCalledWith('session-1')
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('重复资源回滚失败时只尝试一次并返回已注册结果', async () => {
    prepareMock.mockResolvedValue({ kind: 'duplicate', existingId: 'game-existing' })
    rollbackMock.mockRejectedValue(new Error('cleanup failed'))

    await expect(createWorkflow().importFromPicker()).resolves.toEqual({
      alreadyRegistered: true,
    })

    expect(rollbackMock).toHaveBeenCalledOnce()
    expect(loggerErrorMock).toHaveBeenCalledWith(expect.stringContaining('cleanup failed'))
  })

  it('重复资源回滚失败时仍返回重复资源错误', async () => {
    templatePrepareMock.mockResolvedValue({ kind: 'duplicate', existingId: 'template-existing' })
    rollbackMock.mockRejectedValue(new Error('cleanup failed'))

    await expect(createTemplateWorkflow().importFromPicker()).rejects.toThrow('资源已存在')

    expect(rollbackMock).toHaveBeenCalledOnce()
    expect(loggerErrorMock).toHaveBeenCalledWith(expect.stringContaining('cleanup failed'))
  })

  it('注册提交后完成回调失败时保留成功结果且不会回滚资源', async () => {
    const afterCommit = vi.fn().mockRejectedValue(new Error('navigation failed'))

    await expect(createWorkflow(afterCommit).importFromPicker()).resolves.toEqual({
      alreadyRegistered: false,
    })
    expect(commitMock).toHaveBeenCalledWith('session-1', 'game-1')
    expect(commitMock.mock.invocationCallOrder[0]).toBeLessThan(afterCommit.mock.invocationCallOrder[0])
    expect(rollbackMock).not.toHaveBeenCalled()
    expect(loggerErrorMock).toHaveBeenCalledWith(expect.stringContaining('navigation failed'))
  })
})
