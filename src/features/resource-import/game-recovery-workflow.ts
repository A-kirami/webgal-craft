import { gameManager } from '~/services/game-manager'
import { isAndroidRuntime } from '~/services/platform/runtime'
import { useManagedImportStore } from '~/stores/managed-import'
import { AppError } from '~/types/errors'

import { androidDirectoryMaterializer } from './android-directory-materializer'
import { desktopDirectoryPicker } from './desktop-directory-picker'

import type { Game } from '~/database/model'
import type { DirectoryMaterializer } from '~/types/managed-import'

interface GameRecoveryWorkflowOptions {
  selectTitle: string
  android?: boolean
  materializer?: DirectoryMaterializer
}

export interface GameRecoveryWorkflow {
  relinkFromPicker: (gameId: string) => Promise<Game | undefined>
}

export function createGameRecoveryWorkflow(options: GameRecoveryWorkflowOptions): GameRecoveryWorkflow {
  const store = useManagedImportStore()
  const materializer = options.materializer ?? androidDirectoryMaterializer
  const android = options.android ?? isAndroidRuntime()

  async function relinkManaged(gameId: string): Promise<Game | undefined> {
    if (!store.begin('game')) {
      throw new AppError('IO_ERROR', '已有目录导入正在进行', {
        details: { reason: 'IMPORT_BUSY' },
      })
    }

    let sessionId: string | undefined
    let recordUpdated = false
    try {
      const staged = await materializer.selectAndStage('game', {
        operation: { kind: 'relink', existingGameId: gameId },
        onProgress: store.updateProgress,
      })
      if (staged.kind === 'cancelled') {
        return
      }

      sessionId = staged.sessionId
      store.updatePhase('validating')
      const preparation = await gameManager.prepareManagedRelink(gameId, staged.stagingPath)
      if (preparation.kind === 'duplicate') {
        throw new AppError('DUPLICATE_RESOURCE', '该目录已绑定到其他游戏记录')
      }

      store.updatePhase('publishing')
      const { finalPath } = await materializer.publish(
        sessionId,
        preparation.prepared.finalRelativePath,
      )
      store.updatePhase('registering')
      const updated = await gameManager.registerManagedRelink(
        gameId,
        finalPath,
        preparation.prepared,
      )
      recordUpdated = true

      try {
        await materializer.commit(sessionId, updated.id)
      } catch (error) {
        logger.error(`游戏重定位 native commit 失败，保留 session 供恢复: session=${sessionId}, error=${error}`)
      }
      return updated
    } catch (error) {
      if (sessionId && !recordUpdated) {
        try {
          await materializer.rollback(sessionId)
        } catch (cleanupError) {
          logger.error(`游戏重定位回滚失败: session=${sessionId}, error=${cleanupError}`)
        }
      }
      throw error
    } finally {
      store.finish()
    }
  }

  async function relinkFromPicker(gameId: string): Promise<Game | undefined> {
    if (android) {
      return relinkManaged(gameId)
    }

    const selected = await desktopDirectoryPicker.selectDirectory(options.selectTitle)
    return selected ? gameManager.relinkGame(gameId, selected) : undefined
  }

  return { relinkFromPicker }
}
