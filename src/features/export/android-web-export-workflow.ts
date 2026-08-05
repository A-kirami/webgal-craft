import sanitize from 'sanitize-filename'

import { exportCmds } from '~/commands/export'
import { exportManager } from '~/services/export-manager'
import { isAndroidRuntime } from '~/services/platform/runtime'

import { androidExportPublisher } from './android-export-publisher'

import type { AndroidExportPublisher, PublishedAndroidExport } from './android-export-publisher'
import type { Game } from '~/database/model'
import type { ExportProgress } from '~/services/export-manager'

interface AndroidWebExportWorkflowOptions {
  publisher?: AndroidExportPublisher
}

export interface AndroidWebExportWorkflow {
  exportGame: (input: {
    game: Pick<Game, 'engineId' | 'path'>
    gameName: string
    onProgress?: (progress: ExportProgress) => void
  }) => Promise<PublishedAndroidExport>
  openPublished: (contentUri: string) => Promise<void>
  sharePublished: (contentUri: string) => Promise<void>
}

function suggestedZipFileName(gameName: string): string {
  const safeName = sanitize(gameName.trim(), { replacement: '_' })
  return `${safeName}-web.zip`
}

export function createAndroidWebExportWorkflow(
  options: AndroidWebExportWorkflowOptions = {},
): AndroidWebExportWorkflow {
  const publisher = options.publisher ?? androidExportPublisher

  async function exportGame(input: {
    game: Pick<Game, 'engineId' | 'path'>
    gameName: string
    onProgress?: (progress: ExportProgress) => void
  }): Promise<PublishedAndroidExport> {
    const exportSessionId = crypto.randomUUID()
    let published: PublishedAndroidExport | undefined
    try {
      await exportManager.exportAndroidWebZip({
        exportSessionId,
        game: input.game,
        gameName: input.gameName,
        onProgress: input.onProgress,
      })
      published = await publisher.publishZipToDownloads({
        exportSessionId,
        suggestedFileName: suggestedZipFileName(input.gameName),
      })
      return published
    } finally {
      try {
        await exportCmds.cleanupAndroidWebExport(exportSessionId)
      } catch (error) {
        const outcome = published ? '已发布' : '未发布'
        logger.error(`清理 Android Web 导出 staging 失败 (${outcome}): session=${exportSessionId}, error=${error}`)
      }
    }
  }

  return {
    exportGame,
    openPublished: publisher.openPublished,
    sharePublished: publisher.sharePublished,
  }
}

export async function cleanupRecoverableAndroidWebExports(
  android: boolean = isAndroidRuntime(),
): Promise<void> {
  if (!android) {
    return
  }
  try {
    await exportCmds.cleanupRecoverableAndroidWebExports()
  } catch (error) {
    logger.error(`清理遗留 Android Web 导出 staging 失败: ${error}`)
  }
}
