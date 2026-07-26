import '~/__tests__/setup'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestGame } from '~/__tests__/factories'
import { AbsPath } from '~/domain/path'
import { exportManager } from '~/services/export-manager'

import type { ExportProgress } from '~/services/export-manager'

const {
  exportWebCommandMock,
  listenMock,
  resolvePreviewSiteMock,
  unlistenMock,
} = vi.hoisted(() => ({
  exportWebCommandMock: vi.fn(),
  listenMock: vi.fn(),
  resolvePreviewSiteMock: vi.fn(),
  unlistenMock: vi.fn(),
}))

let progressHandler: ((event: { payload: ExportProgress }) => void) | undefined

vi.mock('@tauri-apps/api/event', () => ({
  listen: listenMock,
}))

vi.mock('~/commands/export', () => ({
  exportCmds: {
    exportWeb: exportWebCommandMock,
  },
}))

vi.mock('~/services/game-manager', () => ({
  gameManager: {
    resolvePreviewSite: resolvePreviewSiteMock,
  },
}))

describe('exportManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    progressHandler = undefined
    listenMock.mockImplementation((_eventName, handler) => {
      progressHandler = handler
      return Promise.resolve(unlistenMock)
    })
    resolvePreviewSiteMock.mockResolvedValue({
      enginePath: AbsPath.from('/engines/webgal'),
      projectPath: AbsPath.from('/games/demo'),
      templatePath: AbsPath.from('/templates/default'),
    })
    exportWebCommandMock.mockResolvedValue(undefined)
  })

  it('会生成安全目录名并把当前站点三层路径传给导出命令', async () => {
    const onProgress = vi.fn()
    const game = createTestGame({ engineId: 'engine-1' })
    let resolveCommand: (() => void) | undefined
    exportWebCommandMock.mockImplementation(() => new Promise<void>((resolve) => {
      resolveCommand = resolve
    }))

    const pending = exportManager.exportWeb({
      game,
      gameName: ' Demo/Game ',
      onProgress,
      outputRoot: AbsPath.from('/exports'),
    })

    await vi.waitFor(() => {
      expect(exportWebCommandMock).toHaveBeenCalledOnce()
    })
    const params = exportWebCommandMock.mock.calls[0][0]

    progressHandler?.({
      payload: {
        exportId: 'another-export',
        percentage: 50,
        platform: 'web',
        step: 'ignored',
      },
    })
    progressHandler?.({
      payload: {
        exportId: params.exportId,
        percentage: 120,
        platform: 'web',
        step: 'export.progress.copyingGame',
      },
    })

    expect(onProgress).toHaveBeenCalledOnce()
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      percentage: 100,
      step: 'export.progress.copyingGame',
    }))
    resolveCommand?.()

    await expect(pending).resolves.toBe('/exports/Demo_Game/web')
    expect(exportWebCommandMock).toHaveBeenCalledWith({
      enginePath: '/engines/webgal',
      exportId: expect.any(String),
      gameName: 'Demo/Game',
      gamePath: '/games/demo',
      outputPath: '/exports/Demo_Game/web',
      replaceExisting: false,
      templatePath: '/templates/default',
    })
    expect(unlistenMock).toHaveBeenCalledOnce()
  })

  it('命令失败时仍会释放进度监听', async () => {
    exportWebCommandMock.mockRejectedValue(new Error('disk full'))

    await expect(exportManager.exportWeb({
      game: createTestGame({ engineId: 'engine-1' }),
      gameName: 'Demo',
      outputRoot: AbsPath.from('/exports'),
    })).rejects.toThrow('disk full')

    expect(unlistenMock).toHaveBeenCalledOnce()
  })

  it('没有可用引擎时在注册监听和调用命令前失败', async () => {
    resolvePreviewSiteMock.mockResolvedValue({
      projectPath: AbsPath.from('/games/demo'),
    })

    await expect(exportManager.exportWeb({
      game: createTestGame({ engineId: undefined }),
      gameName: 'Demo',
      outputRoot: AbsPath.from('/exports'),
    })).rejects.toMatchObject({ code: 'ENGINE_EDITOR_INCOMPATIBLE' })

    expect(listenMock).not.toHaveBeenCalled()
    expect(exportWebCommandMock).not.toHaveBeenCalled()
  })

  it.each(['..', ' '.repeat(3)])('游戏名称 %j 无法生成目录时在解析站点前失败', async (gameName) => {
    await expect(exportManager.exportWeb({
      game: createTestGame({ engineId: 'engine-1' }),
      gameName,
      outputRoot: AbsPath.from('/exports'),
    })).rejects.toMatchObject({ code: 'INVALID_CONFIG' })

    expect(resolvePreviewSiteMock).not.toHaveBeenCalled()
    expect(listenMock).not.toHaveBeenCalled()
    expect(exportWebCommandMock).not.toHaveBeenCalled()
  })
})
