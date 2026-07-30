import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AbsPath } from '~/domain/path'

const {
  commitMock,
  desktopSelectMock,
  materializer,
  prepareMock,
  publishMock,
  registerMock,
  relinkMock,
  rollbackMock,
  selectAndStageMock,
} = vi.hoisted(() => ({
  commitMock: vi.fn(),
  desktopSelectMock: vi.fn(),
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
  relinkMock: vi.fn(),
  rollbackMock: vi.fn(),
  selectAndStageMock: vi.fn(),
}))

vi.mock('~/services/platform/runtime', () => ({
  isAndroidRuntime: () => true,
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  error: vi.fn(),
}))

vi.mock('~/features/resource-import/android-directory-materializer', () => ({
  androidDirectoryMaterializer: materializer,
}))

vi.mock('~/features/resource-import/desktop-directory-picker', () => ({
  desktopDirectoryPicker: {
    selectDirectory: desktopSelectMock,
  },
}))

vi.mock('~/services/game-manager', () => ({
  gameManager: {
    prepareManagedRelink: prepareMock,
    registerManagedRelink: registerMock,
    relinkGame: relinkMock,
  },
}))

import { createGameRecoveryWorkflow } from '../game-recovery-workflow'

describe('游戏恢复工作流', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
    materializer.selectAndStage = selectAndStageMock
    materializer.publish = publishMock
    materializer.commit = commitMock
    materializer.rollback = rollbackMock
    selectAndStageMock.mockResolvedValue({
      kind: 'staged',
      sessionId: 'session-1',
      stagingPath: AbsPath.from('/games/.import-staging/session-1'),
    })
    prepareMock.mockResolvedValue({
      kind: 'ready',
      prepared: { finalRelativePath: 'managed-game', plan: {} },
    })
    publishMock.mockResolvedValue({ finalPath: AbsPath.from('/games/managed-game') })
    registerMock.mockResolvedValue({ id: 'game-1', path: '/games/managed-game' })
    commitMock.mockResolvedValue(undefined)
    rollbackMock.mockResolvedValue(undefined)
  })

  it('Android 物化替代工程并更新既有游戏记录', async () => {
    const workflow = createGameRecoveryWorkflow({
      android: true,
      materializer,
      selectTitle: 'Select replacement',
    })

    await expect(workflow.relinkFromPicker('game-1')).resolves.toEqual({
      id: 'game-1',
      path: '/games/managed-game',
    })

    expect(selectAndStageMock).toHaveBeenCalledWith('game', expect.objectContaining({
      operation: { kind: 'relink', existingGameId: 'game-1' },
      onProgress: expect.any(Function),
    }))
    expect(prepareMock).toHaveBeenCalledWith('game-1', '/games/.import-staging/session-1')
    expect(publishMock).toHaveBeenCalledWith('session-1', 'managed-game')
    expect(registerMock).toHaveBeenCalledWith('game-1', '/games/managed-game', expect.any(Object))
    expect(commitMock).toHaveBeenCalledWith('session-1', 'game-1')
    expect(rollbackMock).not.toHaveBeenCalled()
  })

  it('更新游戏记录前失败会回滚本次 session', async () => {
    registerMock.mockRejectedValue(new Error('record update failed'))
    const workflow = createGameRecoveryWorkflow({
      android: true,
      materializer,
      selectTitle: 'Select replacement',
    })

    await expect(workflow.relinkFromPicker('game-1')).rejects.toThrow('record update failed')

    expect(rollbackMock).toHaveBeenCalledWith('session-1')
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('记录更新后 native commit 失败时保留目录和恢复 session', async () => {
    commitMock.mockRejectedValue(new Error('commit failed'))
    const workflow = createGameRecoveryWorkflow({
      android: true,
      materializer,
      selectTitle: 'Select replacement',
    })

    await expect(workflow.relinkFromPicker('game-1')).resolves.toEqual({
      id: 'game-1',
      path: '/games/managed-game',
    })

    expect(rollbackMock).not.toHaveBeenCalled()
  })

  it('desktop 保持选择本地目录并原地 relink', async () => {
    desktopSelectMock.mockResolvedValue(AbsPath.from('/external/game'))
    relinkMock.mockResolvedValue({ id: 'game-1', path: '/external/game' })
    const workflow = createGameRecoveryWorkflow({
      android: false,
      materializer,
      selectTitle: 'Select replacement',
    })

    await expect(workflow.relinkFromPicker('game-1')).resolves.toEqual({
      id: 'game-1',
      path: '/external/game',
    })

    expect(desktopSelectMock).toHaveBeenCalledWith('Select replacement')
    expect(relinkMock).toHaveBeenCalledWith('game-1', '/external/game')
    expect(selectAndStageMock).not.toHaveBeenCalled()
  })
})
