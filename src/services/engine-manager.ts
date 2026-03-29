import { join } from '@tauri-apps/api/path'
import { exists, readTextFile } from '@tauri-apps/plugin-fs'
import sanitize from 'sanitize-filename'

import { fsCmds } from '~/commands/fs'
import { db } from '~/database/db'
import { Engine } from '~/database/model'
import { engineIconPath, engineManifestPath } from '~/services/platform/app-paths'
import { EngineMetadata, EnginePreviewAssets } from '~/services/types'
import { useResourceStore } from '~/stores/resource'
import { useStorageSettingsStore } from '~/stores/storage-settings'
import { AppError } from '~/types/errors'

interface RegisterEngineOptions {
  metadata?: EngineMetadata
  previewAssets?: EnginePreviewAssets
  status?: Engine['status']
}

/**
 * 验证引擎
 * @param enginePath 引擎路径
 * @returns 是否为有效的引擎
 */
async function validateEngine(enginePath: string): Promise<boolean> {
  return await fsCmds.validateDirectoryStructure(
    enginePath,
    ['assets', 'game', 'icons'],
    ['index.html', 'manifest.json', 'webgal-serviceworker.js'],
  )
}

/**
 * 获取引擎元数据
 * @param enginePath 引擎路径
 * @returns 引擎元数据，仅包含语义字段
 */
async function getEngineMetadata(enginePath: string): Promise<EngineMetadata> {
  const manifestPath = await engineManifestPath(enginePath)
  const metaContent = await readTextFile(manifestPath)
  const { name, description } = JSON.parse(metaContent)

  return {
    name,
    description,
  }
}

/**
 * 获取引擎预览资源快照
 * @param enginePath 引擎路径
 * @returns 图标路径
 */
async function getEnginePreviewAssets(enginePath: string): Promise<EnginePreviewAssets> {
  const iconPath = await engineIconPath(enginePath)

  return {
    icon: {
      path: iconPath,
    },
  }
}

function withEnginePreviewCacheVersion(
  previewAssets: EnginePreviewAssets,
  cacheVersion: number = Date.now(),
): EnginePreviewAssets {
  return {
    icon: {
      ...previewAssets.icon,
      cacheVersion,
    },
  }
}

async function getEngineSnapshot(enginePath: string): Promise<Pick<Engine, 'metadata' | 'previewAssets'>> {
  const cacheVersion = Date.now()
  const [metadata, previewAssets] = await Promise.all([
    getEngineMetadata(enginePath),
    getEnginePreviewAssets(enginePath),
  ])

  return {
    metadata,
    previewAssets: withEnginePreviewCacheVersion(previewAssets, cacheVersion),
  }
}

/**
 * 注册引擎到数据库
 * @param enginePath 引擎路径
 * @param options 注册选项；未提供的快照字段会自动补齐
 * @returns 引擎ID
 */
async function registerEngine(
  enginePath: string,
  options: RegisterEngineOptions = {},
): Promise<string> {
  const { status = 'created' } = options
  let { metadata, previewAssets } = options

  if (!metadata && !previewAssets) {
    const snapshot = await getEngineSnapshot(enginePath)
    metadata = snapshot.metadata
    previewAssets = snapshot.previewAssets
  } else {
    metadata ??= await getEngineMetadata(enginePath)
    previewAssets ??= withEnginePreviewCacheVersion(await getEnginePreviewAssets(enginePath))
  }

  return await db.engines.add({
    id: crypto.randomUUID(),
    path: enginePath,
    createdAt: Date.now(),
    status,
    metadata,
    previewAssets,
  })
}

function sanitizeEngineDirectoryName(engineName: string): string {
  const sanitizedName = sanitize(engineName ?? '', { replacement: '_' }).trim()

  if (!sanitizedName) {
    throw new AppError('IO_ERROR', '引擎名称无效')
  }

  return sanitizedName
}

async function resolveInstalledEnginePath(engineSavePath: string, engineName: string): Promise<string> {
  return await join(engineSavePath, sanitizeEngineDirectoryName(engineName))
}

/**
 * 安装引擎
 * @param enginePath 引擎路径
 */
async function installEngine(enginePath: string): Promise<void> {
  const resourceStore = useResourceStore()
  const storageSettingsStore = useStorageSettingsStore()

  const metadata = await getEngineMetadata(enginePath)
  const engineName = metadata.name
  const targetPath = await resolveInstalledEnginePath(storageSettingsStore.engineSavePath, engineName)
  const targetExisted = await exists(targetPath)
  const targetPreviewAssets = {
    icon: {
      path: await engineIconPath(targetPath),
    },
  }

  logger.info(`[引擎 ${engineName}] 开始安装`)

  // 1. 先注册到数据库
  const id = await registerEngine(targetPath, {
    metadata,
    previewAssets: targetPreviewAssets,
    status: 'creating',
  })
  logger.info(`[引擎 ${engineName}] 注册到数据库`)

  // 2. 再复制文件
  logger.info(`[引擎 ${engineName}] 复制引擎文件: ${enginePath} 到 ${targetPath}`)
  try {
    await fsCmds.copyDirectoryWithProgress(enginePath, targetPath, (progress) => {
      resourceStore.updateProgress(id, progress)
    })
    logger.info(`[引擎 ${engineName}] 复制引擎文件完成`)

    const installedSnapshot = await getEngineSnapshot(targetPath)
    await db.engines.update(id, {
      status: 'created',
      ...installedSnapshot,
    })

    resourceStore.finishProgress(id)
    logger.info(`[引擎 ${engineName}] 安装引擎完成`)
  } catch (error) {
    resourceStore.finishProgress(id)

    try {
      await db.engines.delete(id)
    } catch (rollbackError) {
      logger.error(`[引擎 ${engineName}] 回滚数据库记录失败: ${rollbackError}`)
    }

    // 仅清理本次安装创建出来的目标目录，避免误删原本已存在的内容。
    if (!targetExisted && await exists(targetPath)) {
      try {
        await fsCmds.deleteFile(targetPath, true)
      } catch (cleanupError) {
        logger.error(`[引擎 ${engineName}] 清理失败: ${cleanupError}`)
      }
    }

    throw error
  }
}

/**
 * 卸载引擎
 * @param engine 引擎
 */
async function uninstallEngine(engine: Engine): Promise<void> {
  await fsCmds.deleteFile(engine.path)
  await db.engines.delete(engine.id)
}

/**
 * 导入引擎
 * @param enginePath 引擎路径
 */
async function importEngine(enginePath: string): Promise<void> {
  const storageSettingsStore = useStorageSettingsStore()
  const isValid = await validateEngine(enginePath)

  if (!isValid) {
    logger.error(`[引擎导入] 无效的引擎文件夹: ${enginePath}`)
    throw new AppError('INVALID_STRUCTURE', '无效的引擎文件夹')
  }

  const metadata = await getEngineMetadata(enginePath)
  const targetPath = await resolveInstalledEnginePath(storageSettingsStore.engineSavePath, metadata.name)

  if (enginePath === targetPath) {
    logger.info(`[引擎导入] 引擎已在目标位置，直接注册: ${enginePath}`)
    const previewAssets = withEnginePreviewCacheVersion(await getEnginePreviewAssets(enginePath))
    await registerEngine(enginePath, {
      metadata,
      previewAssets,
    })
  } else {
    await installEngine(enginePath)
  }
}

/**
 * 引擎管理器对象，提供游戏引擎相关的管理功能
 */
export const engineManager = {
  validateEngine,
  getEngineMetadata,
  getEnginePreviewAssets,
  getEngineSnapshot,
  registerEngine,
  installEngine,
  uninstallEngine,
  importEngine,
}
