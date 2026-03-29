import { exists } from '@tauri-apps/plugin-fs'

import { fsCmds } from '~/commands/fs'
import { gameCmds } from '~/commands/game'
import { db } from '~/database/db'
import { Game } from '~/database/model'
import { gameCoverPath, gameIconPath } from '~/services/platform/app-paths'
import { GameMetadata, GamePreviewAssets } from '~/services/types'
import { useResourceStore } from '~/stores/resource'
import { useWorkspaceStore } from '~/stores/workspace'
import { AppError } from '~/types/errors'

interface RegisterGameOptions {
  metadata?: GameMetadata
  previewAssets?: GamePreviewAssets
  status?: Game['status']
}

/**
 * 验证游戏目录
 * @param gamePath 游戏路径
 * @returns 是否为有效的游戏目录
 */
async function validateGame(gamePath: string) {
  return await fsCmds.validateDirectoryStructure(
    gamePath,
    ['assets', 'game', 'icons'],
    ['index.html', 'manifest.json', 'webgal-serviceworker.js'],
  )
}

/**
 * 获取游戏元数据
 * @param gamePath 游戏路径
 * @returns 游戏元数据，仅包含语义字段
 */
async function getGameMetadata(gamePath: string): Promise<GameMetadata> {
  const gameConfig = await gameCmds.getGameConfig(gamePath)

  return {
    name: gameConfig.gameName,
  }
}

/**
 * 获取游戏预览资源快照
 * @param gamePath 游戏路径
 * @returns 封面和图标的路径
 */
async function resolveGamePreviewAssets(gamePath: string, titleImage: string): Promise<GamePreviewAssets> {
  const [iconPath, coverPath] = await Promise.all([
    gameIconPath(gamePath),
    gameCoverPath(gamePath, titleImage),
  ])

  return {
    icon: {
      path: iconPath,
    },
    cover: {
      path: coverPath,
    },
  }
}

function withGamePreviewCacheVersion(
  previewAssets: GamePreviewAssets,
  cacheVersion: number = Date.now(),
): GamePreviewAssets {
  return {
    icon: {
      ...previewAssets.icon,
      cacheVersion,
    },
    cover: {
      ...previewAssets.cover,
      cacheVersion,
    },
  }
}

async function getGamePreviewAssets(gamePath: string): Promise<GamePreviewAssets> {
  const gameConfig = await gameCmds.getGameConfig(gamePath)
  return await resolveGamePreviewAssets(gamePath, gameConfig.titleImg)
}

async function getGameSnapshot(gamePath: string): Promise<Pick<Game, 'metadata' | 'previewAssets'>> {
  const gameConfig = await gameCmds.getGameConfig(gamePath)
  const cacheVersion = Date.now()
  const metadata = {
    name: gameConfig.gameName,
  }
  const previewAssets = withGamePreviewCacheVersion(
    await resolveGamePreviewAssets(gamePath, gameConfig.titleImg),
    cacheVersion,
  )

  return {
    metadata,
    previewAssets,
  }
}

function applyCurrentGamePatch(gameId: string, patch: Partial<Pick<Game, 'lastModified' | 'metadata' | 'previewAssets'>>) {
  const workspaceStore = useWorkspaceStore()
  if (!workspaceStore.currentGame || workspaceStore.currentGame.id !== gameId) {
    return
  }

  const { currentGame } = workspaceStore
  workspaceStore.currentGame = {
    ...currentGame,
    ...patch,
    metadata: patch.metadata
      ? {
          ...currentGame.metadata,
          ...patch.metadata,
        }
      : currentGame.metadata,
    previewAssets: patch.previewAssets
      ? {
          ...currentGame.previewAssets,
          ...patch.previewAssets,
        }
      : currentGame.previewAssets,
  }
}

/**
 * 注册游戏到数据库
 * @param gamePath 游戏路径
 * @param options 注册选项；未提供的快照字段会自动补齐
 * @returns 游戏ID
 */
async function registerGame(
  gamePath: string,
  options: RegisterGameOptions = {},
): Promise<string> {
  const { status = 'created' } = options
  let { metadata, previewAssets } = options

  if (!metadata && !previewAssets) {
    const snapshot = await getGameSnapshot(gamePath)
    metadata = snapshot.metadata
    previewAssets = snapshot.previewAssets
  } else {
    metadata ??= await getGameMetadata(gamePath)
    previewAssets ??= withGamePreviewCacheVersion(await getGamePreviewAssets(gamePath))
  }

  return await db.games.add({
    id: crypto.randomUUID(),
    path: gamePath,
    createdAt: Date.now(),
    lastModified: Date.now(),
    status,
    metadata,
    previewAssets,
  })
}

/**
 * 创建新游戏
 * @param gameName 游戏名称
 * @param gamePath 游戏保存路径
 * @param enginePath 使用的游戏引擎路径
 * @returns 游戏ID
 */
async function createGame(gameName: string, gamePath: string, enginePath: string): Promise<string> {
  const resourceStore = useResourceStore()
  const targetExisted = await exists(gamePath)

  logger.info(`[游戏 ${gameName}] 开始创建`)

  // 1. 先注册到数据库，包含初始元数据
  const id = await registerGame(gamePath, {
    metadata: {
      name: gameName,
    },
    previewAssets: {
      icon: {
        path: '',
      },
      cover: {
        path: '',
      },
    },
    status: 'creating',
  })
  logger.info(`[游戏 ${gameName}] 注册到数据库`)

  // 2. 复制引擎文件
  logger.info(`[游戏 ${gameName}] 复制引擎文件: ${enginePath} 到 ${gamePath}`)
  try {
    await fsCmds.copyDirectoryWithProgress(enginePath, gamePath, (progress) => {
      resourceStore.updateProgress(id, progress)
    })
    logger.info(`[游戏 ${gameName}] 复制引擎文件完成`)

    // 3. 设置游戏配置
    await gameCmds.setGameConfig(gamePath, { gameName })
    logger.info(`[游戏 ${gameName}] 设置游戏配置`)

    const snapshot = await getGameSnapshot(gamePath)
    await db.games.update(id, {
      status: 'created',
      ...snapshot,
    })

    resourceStore.finishProgress(id)
    logger.info(`[游戏 ${gameName}] 创建游戏完成`)
    return id
  } catch (error) {
    resourceStore.finishProgress(id)

    try {
      await db.games.delete(id)
    } catch (rollbackError) {
      logger.error(`[游戏 ${gameName}] 回滚数据库记录失败: ${rollbackError}`)
    }

    // 仅清理本次创建生成出来的目录，避免误删用户原本选中的现有目录。
    if (!targetExisted && await exists(gamePath)) {
      try {
        await fsCmds.deleteFile(gamePath, true)
      } catch (cleanupError) {
        logger.error(`[游戏 ${gameName}] 清理失败: ${cleanupError}`)
      }
    }

    throw error
  }
}

/**
 * 删除游戏
 * @param game 游戏
 * @param removeFiles 是否同时删除游戏文件
 */
async function deleteGame(game: Game, removeFiles: boolean = false): Promise<void> {
  if (removeFiles) {
    await fsCmds.deleteFile(game.path)
  }
  await db.games.delete(game.id)
}

/**
 * 重命名游戏
 * @param id 游戏ID
 * @param newName 新名称
 */
async function renameGame(id: string, newName: string): Promise<void> {
  const game = await db.games.get(id)
  if (!game) {
    throw new AppError('IO_ERROR', '游戏不存在')
  }

  await gameCmds.setGameConfig(game.path, { gameName: newName })

  const patch = {
    lastModified: Date.now(),
    metadata: {
      name: newName,
    },
  }
  await db.games.update(id, patch)
  applyCurrentGamePatch(id, patch)
}

/**
 * 导入游戏
 * @param gamePath 游戏路径
 * @returns 游戏ID
 */
async function importGame(gamePath: string): Promise<string> {
  const isValid = await validateGame(gamePath)

  if (!isValid) {
    logger.error(`[游戏导入] 无效的游戏文件夹: ${gamePath}`)
    throw new AppError('INVALID_STRUCTURE', '无效的游戏文件夹')
  }

  return await registerGame(gamePath)
}

/**
 * 更新游戏的 lastModified 字段
 * @param gameId 游戏ID
 */
async function updateGameLastModified(gameId: string): Promise<void> {
  const cacheVersion = Date.now()
  const patch: Partial<Pick<Game, 'lastModified' | 'previewAssets'>> = {
    lastModified: cacheVersion,
  }

  const game = await db.games.get(gameId)
  if (!game) {
    return
  }

  try {
    patch.previewAssets = withGamePreviewCacheVersion(
      await getGamePreviewAssets(game.path),
      cacheVersion,
    )
  } catch (error) {
    if (game.previewAssets) {
      patch.previewAssets = withGamePreviewCacheVersion(game.previewAssets, cacheVersion)
    }
    logger.warn(`刷新游戏预览资源快照失败: ${error}`)
  }

  await db.games.update(gameId, patch)
  applyCurrentGamePatch(gameId, patch)
}

/**
 * 更新当前游戏的 lastModified 字段
 * @returns Promise<void>
 */
let lastModifiedTimer: ReturnType<typeof setTimeout> | undefined

/**
 * 更新当前游戏的 lastModified 字段（防抖，500ms）
 *
 * 多次快速调用时仅执行最后一次，适用于批量文件操作（如粘贴多个文件）。
 */
function updateCurrentGameLastModified(): void {
  const workspaceStore = useWorkspaceStore()
  const gameId = workspaceStore.currentGame?.id
  if (!gameId) {
    return
  }

  clearTimeout(lastModifiedTimer)
  lastModifiedTimer = setTimeout(async () => {
    try {
      await updateGameLastModified(gameId)
    } catch (error) {
      logger.error(`更新游戏 lastModified 失败: ${error}`)
    }
  }, 500)
}

/**
 * 游戏管理器对象，提供游戏相关的管理功能
 */
export const gameManager = {
  validateGame,
  getGameMetadata,
  getGamePreviewAssets,
  getGameSnapshot,
  registerGame,
  createGame,
  deleteGame,
  renameGame,
  importGame,
  updateGameLastModified,
  updateCurrentGameLastModified,
}
