import '~/__tests__/setup'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useManagedImportStore } from '~/stores/managed-import'

import { useManagedImportStatus } from '../useManagedImportStatus'

import type { ManagedImportProgress } from '~/types/managed-import'

const { androidCancelMock, cancelOfficialEngineInstallMock } = vi.hoisted(() => ({
  androidCancelMock: vi.fn(),
  cancelOfficialEngineInstallMock: vi.fn(),
}))

vi.mock('~/services/engine-manager', () => ({
  engineManager: {
    cancelOfficialEngineInstall: cancelOfficialEngineInstallMock,
  },
}))

vi.mock('../android-directory-materializer', () => ({
  androidDirectoryMaterializer: {
    cancel: androidCancelMock,
  },
}))

function beginOfficialEngineInstall(phase: ManagedImportProgress['phase']) {
  const store = useManagedImportStore()
  store.begin('engine', {
    kind: 'official-engine-install',
    engineName: 'WebGAL',
    engineVersion: '4.6.5',
  })
  store.updateProgress({
    sessionId: 'official-engine-4.6.5',
    resourceKind: 'engine',
    phase,
    copiedBytes: 0,
    copiedFiles: 0,
  })
}

describe('useManagedImportStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('官方引擎安装', () => {
    it('尚未收到进度时也允许取消，避免按钮中途出现造成布局抖动', async () => {
      const store = useManagedImportStore()
      store.begin('engine', {
        kind: 'official-engine-install',
        engineName: 'WebGAL',
        engineVersion: '4.6.5',
      })
      const status = useManagedImportStatus()

      expect(status.canCancel.value).toBe(true)

      await status.cancel()

      expect(cancelOfficialEngineInstallMock).toHaveBeenCalledWith('4.6.5')
    })

    it.each(['downloading', 'extracting'] as const)('%s 阶段允许取消', (phase) => {
      beginOfficialEngineInstall(phase)

      const status = useManagedImportStatus()

      expect(status.canCancel.value).toBe(true)
    })

    it.each(['validating', 'publishing', 'registering'] as const)('%s 阶段不允许取消', (phase) => {
      beginOfficialEngineInstall(phase)

      const status = useManagedImportStatus()

      expect(status.canCancel.value).toBe(false)
    })

    it('取消时按引擎版本调用下载取消命令', async () => {
      beginOfficialEngineInstall('downloading')
      const status = useManagedImportStatus()

      await status.cancel()

      expect(cancelOfficialEngineInstallMock).toHaveBeenCalledWith('4.6.5')
      expect(androidCancelMock).not.toHaveBeenCalled()
    })

    it('不可取消阶段调用 cancel 不触发任何取消', async () => {
      beginOfficialEngineInstall('validating')
      const status = useManagedImportStatus()

      await status.cancel()

      expect(cancelOfficialEngineInstallMock).not.toHaveBeenCalled()
      expect(androidCancelMock).not.toHaveBeenCalled()
    })
  })

  describe('目录导入', () => {
    it('copying 阶段允许取消并路由到 materializer', async () => {
      const store = useManagedImportStore()
      store.begin('game')
      store.updateProgress({
        sessionId: 'session-1',
        resourceKind: 'game',
        phase: 'copying',
        copiedBytes: 0,
        copiedFiles: 0,
      })
      const status = useManagedImportStatus()

      expect(status.canCancel.value).toBe(true)

      await status.cancel()

      expect(androidCancelMock).toHaveBeenCalledWith('session-1')
      expect(cancelOfficialEngineInstallMock).not.toHaveBeenCalled()
    })
  })
})
