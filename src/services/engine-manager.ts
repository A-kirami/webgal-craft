import { join } from '@tauri-apps/api/path'
import { exists } from '@tauri-apps/plugin-fs'
import sanitize from 'sanitize-filename'

import { engineCmds } from '~/commands/engine'
import { fsCmds } from '~/commands/fs'
import { db } from '~/database/db'
import { Engine, Game } from '~/database/model'
import { engineIconPath } from '~/services/platform/app-paths'
import { EngineMetadata, EnginePreviewAssets } from '~/services/types'
import { useResourceStore } from '~/stores/resource'
import { useStorageSettingsStore } from '~/stores/storage-settings'
import { EngineManifest, EngineManifestResult } from '~/types/engine'
import { AppError } from '~/types/errors'
import { EngineRef } from '~/types/project-config'

interface EngineSnapshot {
  engineId: string
  metadata: EngineMetadata
  name: string
  previewAssets: EnginePreviewAssets
  version?: string
}

interface RegisterEngineOptions extends EngineSnapshot {
  status?: Engine['status']
}

interface DeleteEngineCheckResult {
  associatedGames?: Game[]
  canDelete: boolean
  reason?: 'ENGINE_HAS_ASSOCIATED_GAMES'
}

function sanitizeEnginePathSegment(value: string, fieldName: '引擎名称' | '引擎版本'): string {
  const sanitized = sanitize(value ?? '', { replacement: '_' }).trim()
  if (!sanitized) {
    throw new AppError('IO_ERROR', `${fieldName}无效`)
  }

  return sanitized
}

function buildEngineMetadata(manifest: EngineManifest): EngineMetadata {
  return {
    type: manifest.engineType as EngineMetadata['type'],
    webgalVersion: manifest.webgalVersion,
    description: manifest.description ?? '',
    descriptions: manifest.descriptions,
    maintainer: manifest.maintainer,
    license: manifest.license,
    icon: manifest.icon ?? 'icons/favicon.ico',
    urls: manifest.urls,
    live2dSupport: manifest.live2dSupport,
    spineSupport: manifest.spineSupport,
  }
}

async function resolveEngineIconPreviewPath(
  enginePath: string,
  metadata: EngineMetadata,
): Promise<string> {
  if (!metadata.icon || metadata.icon === 'icons/favicon.ico') {
    return engineIconPath(enginePath)
  }

  return join(enginePath, metadata.icon)
}

async function classifyEngine(enginePath: string): Promise<EngineManifestResult> {
  return engineCmds.readEngineManifest(enginePath)
}

async function buildEngineSnapshot(enginePath: string, manifest: EngineManifest): Promise<EngineSnapshot> {
  const metadata = buildEngineMetadata(manifest)

  return {
    engineId: manifest.id,
    name: manifest.name,
    version: manifest.version,
    metadata,
    previewAssets: {
      icon: {
        path: await resolveEngineIconPreviewPath(enginePath, metadata),
      },
    },
  }
}

async function resolveEngineSnapshot(enginePath: string): Promise<EngineSnapshot> {
  const result = await classifyEngine(enginePath)
  if (result.status !== 'ok') {
    throw new AppError('IO_ERROR', '引擎缺少有效的 webgal-engine.json')
  }

  return buildEngineSnapshot(enginePath, result.manifest)
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

async function resolveManagedEnginePath(engine: Pick<EngineSnapshot, 'name' | 'version'>): Promise<string> {
  const storageSettingsStore = useStorageSettingsStore()
  const nameSegment = sanitizeEnginePathSegment(engine.name, '引擎名称')
  const versionSegment = sanitizeEnginePathSegment(engine.version ?? '', '引擎版本')
  return join(storageSettingsStore.engineSavePath, nameSegment, versionSegment)
}

async function validateEngine(enginePath: string): Promise<boolean> {
  return fsCmds.validateDirectoryStructure(
    enginePath,
    ['game/template'],
    ['index.html', 'game/config.txt'],
  )
}

async function getEnginePreviewAssets(enginePath: string): Promise<EnginePreviewAssets> {
  const snapshot = await resolveEngineSnapshot(enginePath)
  return snapshot.previewAssets
}

async function getEngineSnapshot(enginePath: string): Promise<Pick<Engine, 'engineId' | 'name' | 'version' | 'metadata' | 'previewAssets'>> {
  const snapshot = await resolveEngineSnapshot(enginePath)

  return {
    engineId: snapshot.engineId,
    name: snapshot.name,
    version: snapshot.version,
    metadata: snapshot.metadata,
    previewAssets: withEnginePreviewCacheVersion(snapshot.previewAssets),
  }
}

async function registerEngine(
  enginePath: string,
  options: RegisterEngineOptions,
): Promise<string> {
  const previewAssets = withEnginePreviewCacheVersion(options.previewAssets)

  return db.engines.add({
    id: crypto.randomUUID(),
    path: enginePath,
    engineId: options.engineId,
    name: options.name,
    version: options.version,
    createdAt: Date.now(),
    status: options.status ?? 'created',
    metadata: options.metadata,
    previewAssets,
  })
}

async function findEngineByRef(engineRef: EngineRef): Promise<Engine | undefined> {
  if (engineRef.version === undefined) {
    return undefined
  }

  return db.engines
    .where('[engineId+version]')
    .equals([engineRef.id, engineRef.version])
    .first()
}

async function findAssociatedGames(engineDbId: string) {
  return db.games.where('engineId').equals(engineDbId).toArray()
}

async function findEnginesByEngineId(engineId: string) {
  return db.engines.where('engineId').equals(engineId).toArray()
}

async function canDeleteEngine(id: string): Promise<DeleteEngineCheckResult> {
  const associatedGames = await findAssociatedGames(id)
  return buildDeleteCheckResult(associatedGames)
}

async function canDeleteEngineGroup(engineId: string): Promise<DeleteEngineCheckResult> {
  const engines = await findEnginesByEngineId(engineId)
  const gamesByEngine = await Promise.all(engines.map(engine => findAssociatedGames(engine.id)))
  const uniqueGames = [...new Map(gamesByEngine.flat().map(game => [game.id, game])).values()]
  return buildDeleteCheckResult(uniqueGames)
}

function buildDeleteCheckResult(associatedGames: Game[]): DeleteEngineCheckResult {
  if (associatedGames.length > 0) {
    return { canDelete: false, reason: 'ENGINE_HAS_ASSOCIATED_GAMES', associatedGames }
  }
  return { canDelete: true }
}

async function validateAllEngines(): Promise<void> {
  const engines = await db.engines.toArray()
  await Promise.all(engines
    .filter(engine => engine.status !== 'creating' && engine.status !== 'error')
    .map(async (engine) => {
      try {
        const structureValid = await validateEngine(engine.path)
        const classification = structureValid ? await classifyEngine(engine.path) : undefined
        const nextStatus = classification?.status === 'ok' ? 'created' : 'unavailable'
        if (engine.status !== nextStatus) {
          await db.engines.update(engine.id, { status: nextStatus })
        }
      } catch (error) {
        logger.warn(`引擎校验异常: ${error}`)
      }
    }))
}

async function assertEngineImportable(enginePath: string): Promise<EngineSnapshot> {
  if (!(await validateEngine(enginePath))) {
    logger.error(`[引擎导入] 无效的引擎文件夹: ${enginePath}`)
    throw new AppError('INVALID_STRUCTURE', '无效的引擎文件夹')
  }

  const existingByPath = await db.engines.where('path').equals(enginePath).first()
  if (existingByPath) {
    throw new AppError('IO_ERROR', '该引擎已导入')
  }

  const classification = await classifyEngine(enginePath)
  if (classification.status === 'unsupportedSchema') {
    throw new AppError(
      'IO_ERROR',
      `引擎清单 schemaVersion ${classification.schemaVersion} 不受支持，当前最高支持主版本 ${classification.supportedMajor}，请升级宿主或使用兼容的引擎`,
      {
        details: {
          reason: 'UNSUPPORTED_MANIFEST_SCHEMA',
          schemaVersion: classification.schemaVersion,
          supportedMajor: classification.supportedMajor,
        },
      },
    )
  }
  if (classification.status === 'missing') {
    throw new AppError('IO_ERROR', '不支持导入旧版引擎，请导入包含该引擎的项目或使用受支持的引擎版本', {
      details: { reason: 'UNSUPPORTED_LEGACY_ENGINE' },
    })
  }
  if (classification.status === 'invalid') {
    throw new AppError('IO_ERROR', classification.reason, {
      details: {
        reason: 'INVALID_ENGINE_MANIFEST',
        manifestReason: classification.reason,
        manifestStatus: classification.status,
      },
    })
  }

  const snapshot = await buildEngineSnapshot(enginePath, classification.manifest)
  const duplicate = await findEngineByRef({
    id: snapshot.engineId,
    version: snapshot.version,
  })

  if (duplicate) {
    throw new AppError('IO_ERROR', '同名同版本的引擎已存在', {
      details: { reason: 'DUPLICATE_ENGINE' },
    })
  }

  return snapshot
}

async function copyAndFinalizeEngine(
  engineId: string,
  sourcePath: string,
  targetPath: string,
): Promise<void> {
  const resourceStore = useResourceStore()

  await fsCmds.copyDirectoryWithProgress(sourcePath, targetPath, (progress) => {
    resourceStore.updateProgress(engineId, progress)
  })

  resourceStore.finishProgress(engineId)
  await db.engines.update(engineId, {
    status: 'created',
    ...await getEngineSnapshot(targetPath),
  })
}

async function importEngine(enginePath: string): Promise<string> {
  const snapshot = await assertEngineImportable(enginePath)
  const targetPath = await resolveManagedEnginePath(snapshot)

  if (enginePath === targetPath) {
    logger.info(`[引擎导入] 引擎已在托管目录，直接注册: ${enginePath}`)
    return registerEngine(targetPath, snapshot)
  }

  if (await exists(targetPath)) {
    throw new AppError('IO_ERROR', '目标引擎目录已存在，请先清理后重试')
  }

  logger.info(`[引擎 ${snapshot.name}] 开始导入`)
  const engineId = await registerEngine(targetPath, {
    ...snapshot,
    status: 'creating',
  })

  try {
    await copyAndFinalizeEngine(engineId, enginePath, targetPath)
    logger.info(`[引擎 ${snapshot.name}] 导入完成`)
    return engineId
  } catch (error) {
    logger.error(`[引擎导入] 导入失败: ${error}`)
    useResourceStore().finishProgress(engineId)
    await db.engines.update(engineId, { status: 'error' }).catch((error_) => {
      logger.warn(`[引擎导入] 清理异常 - 更新状态失败: ${error_}`)
    })
    if (await exists(targetPath)) {
      await fsCmds.deleteFile(targetPath, true).catch((error_) => {
        logger.warn(`[引擎导入] 清理异常 - 删除目录失败: ${error_}`)
      })
    }
    throw error
  }
}

function assertDeletable(deleteCheck: DeleteEngineCheckResult): void {
  if (!deleteCheck.canDelete) {
    const names = deleteCheck.associatedGames?.map(game => game.metadata.name).join('、') ?? ''
    throw new AppError('IO_ERROR', `无法删除引擎，以下游戏正在使用此引擎：${names}`)
  }
}

async function uninstallEngine(engine: Engine): Promise<void> {
  assertDeletable(await canDeleteEngine(engine.id))
  logger.info(`[引擎卸载] ${engine.name}@${engine.version ?? 'unknown'}: ${engine.path}`)
  if (engine.status !== 'unavailable') {
    try {
      await fsCmds.deleteFile(engine.path)
    } catch (error) {
      logger.warn(`[引擎卸载] 删除托管目录失败，继续清理数据库记录: ${engine.path} - ${error}`)
    }
  }
  await db.engines.delete(engine.id)
}

async function uninstallEngineGroup(engineId: string): Promise<void> {
  assertDeletable(await canDeleteEngineGroup(engineId))
  const engines = await findEnginesByEngineId(engineId)
  logger.info(`[引擎组卸载] ${engineId} (${engines.length} 个版本)`)
  await Promise.all(engines.map(engine => uninstallEngine(engine)))
}

export const engineManager = {
  validateEngine,
  classifyEngine,
  getEnginePreviewAssets,
  findEngineByRef,
  canDeleteEngine,
  canDeleteEngineGroup,
  validateAllEngines,
  importEngine,
  uninstallEngine,
  uninstallEngineGroup,
}
