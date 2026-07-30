import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestGame } from '~/__tests__/factories'

const { cleanupMock, exportZipMock, openMock, publishMock, shareMock } = vi.hoisted(() => ({
  cleanupMock: vi.fn(),
  exportZipMock: vi.fn(),
  openMock: vi.fn(),
  publishMock: vi.fn(),
  shareMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  error: vi.fn(),
}))

vi.mock('~/commands/export', () => ({
  exportCmds: {
    cleanupAndroidWebExport: cleanupMock,
  },
}))

vi.mock('~/services/export-manager', () => ({
  exportManager: {
    exportAndroidWebZip: exportZipMock,
  },
}))

import { createAndroidWebExportWorkflow } from '../android-web-export-workflow'

describe('Android Web 导出工作流', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    cleanupMock.mockResolvedValue(undefined)
    exportZipMock.mockResolvedValue(undefined)
    publishMock.mockResolvedValue({
      kind: 'published',
      contentUri: 'content://media/external/downloads/42',
      displayPath: 'Downloads/WebGALCraft/exports/Demo-web.zip',
    })
  })

  function createWorkflow() {
    return createAndroidWebExportWorkflow({
      publisher: {
        openPublished: openMock,
        publishZipToDownloads: publishMock,
        sharePublished: shareMock,
      },
    })
  }

  it('先生成私有 ZIP 再发布到 Downloads 并清理 session', async () => {
    const game = createTestGame({ engineId: 'engine-1' })

    await expect(createWorkflow().exportGame({
      game,
      gameName: 'Demo/Game',
    })).resolves.toEqual({
      kind: 'published',
      contentUri: 'content://media/external/downloads/42',
      displayPath: 'Downloads/WebGALCraft/exports/Demo-web.zip',
    })

    const exportSessionId = exportZipMock.mock.calls[0][0].exportSessionId
    expect(exportZipMock).toHaveBeenCalledWith(expect.objectContaining({
      exportSessionId,
      game,
      gameName: 'Demo/Game',
    }))
    expect(publishMock).toHaveBeenCalledWith({
      exportSessionId,
      suggestedFileName: 'Demo_Game-web.zip',
    })
    expect(cleanupMock).toHaveBeenCalledWith(exportSessionId)
  })

  it('发布前失败时仍清理私有 staging', async () => {
    exportZipMock.mockRejectedValue(new Error('export failed'))

    await expect(createWorkflow().exportGame({
      game: createTestGame({ engineId: 'engine-1' }),
      gameName: 'Demo',
    })).rejects.toThrow('export failed')

    expect(publishMock).not.toHaveBeenCalled()
    expect(cleanupMock).toHaveBeenCalledOnce()
  })

  it('公共文件发布后清理失败仍返回发布结果', async () => {
    cleanupMock.mockRejectedValue(new Error('cleanup failed'))

    await expect(createWorkflow().exportGame({
      game: createTestGame({ engineId: 'engine-1' }),
      gameName: 'Demo',
    })).resolves.toMatchObject({ kind: 'published' })
  })

  it('打开和分享只透传发布器返回的 content URI', async () => {
    const workflow = createWorkflow()
    const uri = 'content://media/external/downloads/42'

    await workflow.openPublished(uri)
    await workflow.sharePublished(uri)

    expect(openMock).toHaveBeenCalledWith(uri)
    expect(shareMock).toHaveBeenCalledWith(uri)
  })
})
