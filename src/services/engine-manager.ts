import { basename, join } from '@tauri-apps/api/path'
import { remove } from '@tauri-apps/plugin-fs'

import { EngineMetadata, GameError } from './types'

/**
 * 验证引擎
 * @param enginePath 引擎路径
 * @returns 是否为有效的引擎
 * @throws {GameError} 当验证失败时抛出
 */
async function validateEngine(enginePath: string): Promise<boolean> {
  try {
    return await fsCmds.validateDirectoryStructure(
      enginePath,
      ['assets', 'game', 'icons'],
      ['index.html', 'manifest.json', 'webgal-serviceworker.js'],
    )
  } catch (error) {
    throw new GameError(
      '验证引擎失败',
      'ENGINE_VALIDATE_ERROR',
      { enginePath, originalError: error },
    )
  }
}

/**
 * 获取引擎元数据
 * @param enginePath 引擎路径
 * @returns 引擎元数据，包含名称、图标和描述
 * @throws {GameError} 当获取失败时抛出
 */
async function getEngineMetadata(enginePath: string): Promise<EngineMetadata> {
  try {
    const name = await basename(enginePath)
    const iconPath = await join(enginePath, 'icons', 'favicon.ico')

    return {
      name,
      icon: iconPath,
      description: '',
    }
  } catch (error) {
    throw new GameError(
      '获取引擎元数据失败',
      'ENGINE_METADATA_ERROR',
      { enginePath, originalError: error },
    )
  }
}

/**
 * 注册引擎到数据库
 * @param enginePath 引擎路径
 * @param metadata 引擎元数据（可选，未提供时自动获取）
 * @param creating 是否正在创建
 * @returns 引擎ID
 * @throws {GameError} 当注册失败时抛出
 */
async function registerEngine(enginePath: string, metadata?: EngineMetadata, creating?: boolean): Promise<string> {
  try {
    metadata ??= await getEngineMetadata(enginePath)
    return await db.engines.add({
      id: crypto.randomUUID(),
      path: enginePath,
      createdAt: Date.now(),
      status: creating ? 'creating' : 'created',
      metadata,
    })
  } catch (error) {
    throw new GameError(
      '注册引擎失败',
      'ENGINE_REGISTER_ERROR',
      { enginePath, originalError: error },
    )
  }
}

/**
 * 安装引擎
 * @param enginePath 引擎路径
 * @throws {GameError} 当安装失败时抛出
 */
async function installEngine(enginePath: string): Promise<void> {
  const resourceStore = useResourceStore()
  const settingsStore = useSettingsStore()
  try {
    const engineName = await basename(enginePath)
    const targetPath = await join(settingsStore.engineSavePath, engineName)

    logger.info(`[引擎 ${engineName}] 开始安装`)

    // 1. 先注册到数据库
    const id = await registerEngine(targetPath, {
      name: engineName,
      icon: '',
      description: '',
    }, true)
    logger.info(`[引擎 ${engineName}] 注册到数据库`)

    // 2. 再复制文件
    logger.info(`[引擎 ${engineName}] 复制引擎文件: ${enginePath} 到 ${targetPath}`)
    await fsCmds.copyDirectoryWithProgress(enginePath, targetPath, (progress) => {
      resourceStore.updateProgress(id, progress)
    })
    logger.info(`[引擎 ${engineName}] 复制引擎文件完成`)

    resourceStore.finishProgress(id)

    const metadata = await getEngineMetadata(targetPath)
    await db.engines.update(id, {
      status: 'created',
      metadata,
    })

    logger.info(`[引擎 ${engineName}] 安装引擎完成`)
  } catch (error) {
    throw new GameError(
      '安装引擎失败',
      'ENGINE_INSTALL_ERROR',
      { enginePath, originalError: error },
    )
  }
}

/**
 * 卸载引擎
 * @param engine 引擎
 * @throws {GameError} 当卸载失败时抛出
 */
async function uninstallEngine(engine: Engine): Promise<void> {
  await db.engines.delete(engine.id)
  await remove(engine.path, { recursive: true })
}

/**
 * 导入引擎
 * @param enginePath 引擎路径
 * @throws {GameError} 当导入失败时抛出
 */
async function importEngine(enginePath: string): Promise<void> {
  const isValid = await validateEngine(enginePath)

  if (!isValid) {
    logger.error(`[引擎导入] 无效的引擎文件夹: ${enginePath}`)
    throw new GameError(
      '无效的引擎文件夹',
      'ENGINE_IMPORT_ERROR',
      { path: enginePath },
    )
  }

  await installEngine(enginePath)
}

/**
 * 引擎管理器对象，提供游戏引擎相关的管理功能
 */
export const engineManager = {
  validateEngine,
  getEngineMetadata,
  registerEngine,
  installEngine,
  uninstallEngine,
  importEngine,
}
