import '~/__tests__/setup'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestGame } from '~/__tests__/factories'
import { AbsPath } from '~/domain/path'
import { exportManager } from '~/services/export-manager'

import type { ExportProgress } from '~/services/export-manager'

const {
  exportWebCommandMock,
  exportAndroidWebZipCommandMock,
  exportPcCommandMock,
  ensurePcRuntimeCommandMock,
  listenMock,
  resolvePreviewSiteMock,
  unlistenMock,
} = vi.hoisted(() => ({
  exportWebCommandMock: vi.fn(),
  exportAndroidWebZipCommandMock: vi.fn(),
  exportPcCommandMock: vi.fn(),
  ensurePcRuntimeCommandMock: vi.fn(),
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
    exportAndroidWebZip: exportAndroidWebZipCommandMock,
    ensurePcRuntime: ensurePcRuntimeCommandMock,
    exportPc: exportPcCommandMock,
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
    exportAndroidWebZipCommandMock.mockResolvedValue(undefined)
    exportPcCommandMock.mockResolvedValue(undefined)
    ensurePcRuntimeCommandMock.mockResolvedValue(AbsPath.from('/cache/neutralinojs-win_x64.exe'))
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

  it('PC 导出把窗口配置、运行时和独立平台进度传给命令', async () => {
    const onProgress = vi.fn()
    const pending = exportManager.exportPc({
      game: createTestGame({ engineId: 'engine-1' }),
      gameName: ' Demo/Game ',
      onProgress,
      outputRoot: AbsPath.from('/exports'),
      runtimePath: AbsPath.from('/cache/neutralinojs-win_x64.exe'),
      targetArch: 'x64',
      targetOs: 'windows',
      windowConfig: {
        fullScreen: false,
        height: 720,
        minHeight: 600,
        minWidth: 800,
        resizable: true,
        width: 1280,
      },
    })

    await vi.waitFor(() => expect(exportPcCommandMock).toHaveBeenCalledOnce())
    const params = exportPcCommandMock.mock.calls[0][0]
    progressHandler?.({
      payload: {
        exportId: params.exportId,
        percentage: 80,
        platform: 'windows-x64',
        step: 'export.progress.packingResources',
      },
    })

    await expect(pending).resolves.toBe('/exports/Demo_Game/windows-x64')
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      platform: 'windows-x64',
      step: 'export.progress.packingResources',
    }))
    expect(exportPcCommandMock).toHaveBeenCalledWith({
      enginePath: '/engines/webgal',
      exportId: expect.any(String),
      gameName: 'Demo/Game',
      gamePath: '/games/demo',
      outputPath: '/exports/Demo_Game/windows-x64',
      replaceExisting: false,
      runtimePath: '/cache/neutralinojs-win_x64.exe',
      targetArch: 'x64',
      targetOs: 'windows',
      templatePath: '/templates/default',
      windowConfig: {
        fullScreen: false,
        height: 720,
        minHeight: 600,
        minWidth: 800,
        resizable: true,
        width: 1280,
      },
    })
    expect(unlistenMock).toHaveBeenCalledOnce()
  })

  it('按目标操作系统和架构确保运行时', async () => {
    await expect(exportManager.ensurePcRuntime('macos', 'arm64', 'https://proxy.example/')).resolves.toBe('/cache/neutralinojs-win_x64.exe')
    expect(ensurePcRuntimeCommandMock).toHaveBeenCalledWith({
      proxyPrefix: 'https://proxy.example/',
      targetArch: 'arm64',
      targetOs: 'macos',
    })
  })

  it('Android 导出把站点写入受控 session 且复用进度事件', async () => {
    const onProgress = vi.fn()
    const pending = exportManager.exportAndroidWebZip({
      exportSessionId: 'session-1',
      game: createTestGame({ engineId: 'engine-1' }),
      gameName: 'Demo',
      onProgress,
    })

    await vi.waitFor(() => expect(exportAndroidWebZipCommandMock).toHaveBeenCalledOnce())
    const params = exportAndroidWebZipCommandMock.mock.calls[0][0]
    progressHandler?.({
      payload: {
        exportId: params.exportId,
        percentage: 96,
        platform: 'web',
        step: 'export.progress.compressing',
      },
    })

    await expect(pending).resolves.toBeUndefined()
    expect(exportAndroidWebZipCommandMock).toHaveBeenCalledWith({
      enginePath: '/engines/webgal',
      exportId: expect.any(String),
      exportSessionId: 'session-1',
      gameName: 'Demo',
      gamePath: '/games/demo',
      templatePath: '/templates/default',
    })
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      percentage: 96,
      step: 'export.progress.compressing',
    }))
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
