import { remove } from '@tauri-apps/plugin-fs'

import { GameError, GameMetadata } from './types'

/**
 * 验证游戏目录
 * @param gamePath 游戏路径
 * @returns 是否为有效的游戏目录
 * @throws {GameError} 当验证失败时抛出
 */
async function validateGame(gamePath: string) {
  try {
    return await fsCmds.validateDirectoryStructure(
      gamePath,
      ['assets', 'game', 'icons'],
      ['index.html', 'manifest.json', 'webgal-serviceworker.js'],
    )
  } catch (error) {
    throw new GameError(
      '验证游戏失败',
      'GAME_VALIDATE_ERROR',
      { gamePath, originalError: error },
    )
  }
}

/**
 * 获取游戏元数据
 * @param gamePath 游戏路径
 * @returns 游戏元数据，包含名称、图标和封面
 * @throws {GameError} 当获取失败时抛出
 */
async function getGameMetadata(gamePath: string): Promise<GameMetadata> {
  try {
    const gameConfig = await gameCmds.getGameConfig(gamePath)
    const iconPath = await gameIconPath(gamePath)
    const coverPath = await gameCoverPath(gamePath, gameConfig.titleImg)

    return {
      name: gameConfig.gameName,
      icon: iconPath,
      cover: coverPath,
    }
  } catch (error) {
    throw new GameError(
      '获取游戏元数据失败',
      'GAME_METADATA_ERROR',
      { gamePath, originalError: error },
    )
  }
}

/**
 * 注册游戏到数据库
 * @param gamePath 游戏路径
 * @param metadata 游戏元数据（可选，未提供时自动获取）
 * @param creating 是否正在创建
 * @returns 游戏ID
 * @throws {GameError} 当注册失败时抛出
 */
async function registerGame(gamePath: string, metadata?: GameMetadata, creating?: boolean): Promise<string> {
  try {
    metadata ??= await getGameMetadata(gamePath)
    return await db.games.add({
      id: crypto.randomUUID(),
      path: gamePath,
      createdAt: Date.now(),
      lastModified: Date.now(),
      status: creating ? 'creating' : 'created',
      metadata,
    })
  } catch (error) {
    throw new GameError(
      '注册游戏失败',
      'GAME_REGISTER_ERROR',
      { gamePath, originalError: error },
    )
  }
}

/**
 * 创建新游戏
 * @param gameName 游戏名称
 * @param gamePath 游戏保存路径
 * @param enginePath 使用的游戏引擎路径
 * @returns 游戏ID
 * @throws {GameError} 当创建失败时抛出
 */
async function createGame(gameName: string, gamePath: string, enginePath: string): Promise<string> {
  const resourceStore = useResourceStore()
  try {
    logger.info(`[游戏 ${gameName}] 开始创建`)

    // 1. 先注册到数据库，包含初始元数据
    const id = await registerGame(gamePath, {
      name: gameName,
      icon: '',
      cover: '',
    }, true)
    logger.info(`[游戏 ${gameName}] 注册到数据库`)

    // 2. 复制引擎文件
    logger.info(`[游戏 ${gameName}] 复制引擎文件: ${enginePath} 到 ${gamePath}`)
    await fsCmds.copyDirectoryWithProgress(enginePath, gamePath, (progress) => {
      resourceStore.updateProgress(id, progress)
    })
    logger.info(`[游戏 ${gameName}] 复制引擎文件完成`)

    // 3. 设置游戏配置
    await gameCmds.setGameConfig(gamePath, { gameName })
    logger.info(`[游戏 ${gameName}] 设置游戏配置`)

    resourceStore.finishProgress(id)

    const metadata = await getGameMetadata(gamePath)
    await db.games.update(id, {
      status: 'created',
      metadata,
    })

    logger.info(`[游戏 ${gameName}] 创建游戏完成`)
    return id
  } catch (error) {
    throw new GameError(
      '创建游戏失败',
      'GAME_CREATE_ERROR',
      { gameName, gamePath, enginePath, originalError: error },
    )
  }
}

/**
 * 删除游戏
 * @param game 游戏
 * @param removeFiles 是否同时删除游戏文件
 * @throws {GameError} 当删除失败时抛出
 */
async function deleteGame(game: Game, removeFiles: boolean = false): Promise<void> {
  try {
    await db.games.delete(game.id)
    if (removeFiles) {
      await remove(game.path, { recursive: true })
    }
  } catch (error) {
    throw new GameError(
      '删除游戏失败',
      'GAME_DELETE_ERROR',
      { game, originalError: error },
    )
  }
}

/**
 * 重命名游戏
 * @param id 游戏ID
 * @param newName 新名称
 * @throws {GameError} 当重命名失败时抛出
 */
async function renameGame(id: string, newName: string): Promise<void> {
  try {
    const game = await db.games.get(id)
    if (!game) {
      throw new GameError('游戏不存在', 'GAME_NOT_FOUND', { id })
    }
    await gameCmds.setGameConfig(game.path, { gameName: newName })

    await updateGameLastModified(id)
  } catch (error) {
    throw new GameError(
      '重命名游戏失败',
      'GAME_RENAME_ERROR',
      { id, newName, originalError: error },
    )
  }
}

/**
 * 导入游戏
 * @param gamePath 游戏路径
 * @returns 游戏ID
 * @throws {GameError} 当导入失败时抛出
 */
async function importGame(gamePath: string): Promise<string> {
  const isValid = await validateGame(gamePath)

  if (!isValid) {
    logger.error(`[游戏导入] 无效的游戏文件夹: ${gamePath}`)
    throw new GameError(
      '无效的游戏文件夹',
      'GAME_IMPORT_ERROR',
      { path: gamePath },
    )
  }

  return await registerGame(gamePath)
}

/**
 * 运行游戏预览
 * @param gamePath 游戏路径
 */
async function runGamePreview(gamePath: string) {
  const id = await serverCmds.addStaticSite(gamePath)
  return `http://localhost:8899/game/${id}/`
}

/**
 * 停止游戏预览
 * @param gamePath 游戏路径
 */
async function stopGamePreview(gameId: string) {
  await serverCmds.removeStaticSite(gameId)
}

/**
 * 更新游戏的 lastModified 字段
 * @param gameId 游戏ID
 * @throws {GameError} 当更新失败时抛出
 */
async function updateGameLastModified(gameId: string): Promise<void> {
  try {
    await db.games.update(gameId, {
      lastModified: Date.now(),
    })
  } catch (error) {
    throw new GameError(
      '更新游戏最后修改时间失败',
      'GAME_UPDATE_ERROR',
      { gameId, originalError: error },
    )
  }
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
  registerGame,
  createGame,
  deleteGame,
  renameGame,
  importGame,
  runGamePreview,
  stopGamePreview,
  updateGameLastModified,
  updateCurrentGameLastModified,
}
