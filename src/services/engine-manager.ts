import { exists } from '@tauri-apps/plugin-fs'
import sanitize from 'sanitize-filename'

import { engineCmds } from '~/commands/engine'
import { fsCmds } from '~/commands/fs'
import { db } from '~/database/db'
import { Engine, Game } from '~/database/model'
import { AbsPath, RelPath } from '~/domain/path'
import { engineIconPath } from '~/services/platform/app-paths'
import {
  classifyAvailability,
  createWarning,
  normalizeImportPath,
  ResourceAvailability,
  ResourceHealthResult,
  ResourceWarning,
} from '~/services/resource-health'
import { toLookupPathKey } from '~/services/resource-path/lookup'
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
  enginePath: AbsPath,
  metadata: EngineMetadata,
): Promise<string> {
  if (!metadata.icon || metadata.icon === 'icons/favicon.ico') {
    return engineIconPath(enginePath)
  }

  return AbsPath.join(enginePath, RelPath.from(metadata.icon))
}

async function classifyEngine(enginePath: AbsPath): Promise<EngineManifestResult> {
  return engineCmds.readEngineManifest(enginePath)
}

async function buildEngineSnapshot(enginePath: AbsPath, manifest: EngineManifest): Promise<EngineSnapshot> {
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

async function resolveEngineSnapshot(enginePath: AbsPath): Promise<EngineSnapshot> {
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

async function resolveManagedEnginePath(engine: Pick<EngineSnapshot, 'engineId' | 'name' | 'version'>): Promise<AbsPath> {
  const storageSettingsStore = useStorageSettingsStore()
  const nameSegment = sanitizeEnginePathSegment(engine.name, '引擎名称')
  const versionSegment = sanitizeEnginePathSegment(engine.version ?? engine.engineId, '引擎版本')
  return AbsPath.append(
    AbsPath.append(AbsPath.from(storageSettingsStore.engineSavePath), nameSegment),
    versionSegment,
  )
}

export function isEngineUsable(engine: Pick<Engine, 'status' | 'availability'>): boolean {
  return engine.status === 'created' && engine.availability === 'available'
}

async function validateEngine(enginePath: AbsPath): Promise<boolean> {
  return fsCmds.validateDirectoryStructure(
    enginePath,
    ['game/template'],
    ['index.html', 'game/config.txt'],
  )
}

async function getEnginePreviewAssets(enginePath: AbsPath): Promise<EnginePreviewAssets> {
  const snapshot = await resolveEngineSnapshot(enginePath)
  return snapshot.previewAssets
}

async function getEngineSnapshot(enginePath: AbsPath): Promise<Pick<Engine, 'engineId' | 'name' | 'version' | 'metadata' | 'previewAssets'>> {
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
  enginePath: AbsPath,
  options: RegisterEngineOptions,
): Promise<string> {
  const previewAssets = withEnginePreviewCacheVersion(options.previewAssets)

  return db.engines.add({
    id: crypto.randomUUID(),
    path: enginePath,
    pathLookupKey: toLookupPathKey(enginePath),
    engineId: options.engineId,
    name: options.name,
    version: options.version,
    createdAt: Date.now(),
    status: options.status ?? 'created',
    availability: 'available',
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
        const pathExists = await exists(engine.path)
        const structureValid = pathExists ? await validateEngine(engine.path) : false
        const classification = structureValid ? await classifyEngine(engine.path) : undefined
        const nextAvailability: ResourceAvailability = classifyAvailability({
          pathExists,
          structureValid,
          semanticsValid: classification?.status === 'ok',
        })
        if (engine.availability !== nextAvailability) {
          await db.engines.update(engine.id, { availability: nextAvailability })
        }
      } catch (error) {
        logger.warn(`引擎校验异常: ${error}`)
      }
    }))
}

async function assertEngineImportable(enginePath: AbsPath): Promise<EngineSnapshot> {
  if (!(await validateEngine(enginePath))) {
    logger.error(`[引擎导入] 无效的引擎文件夹: ${enginePath}`)
    throw new AppError('INVALID_STRUCTURE', '无效的引擎文件夹')
  }

  const classification = await classifyEngine(enginePath)
  if (classification.status === 'unsupportedSchema') {
    throw new AppError(
      'INVALID_MANIFEST',
      `引擎清单 schemaVersion ${classification.schemaVersion} 不受支持，当前最高支持主版本 ${classification.supportedMajor}，请升级宿主或使用兼容的引擎`,
      {
        details: {
          reason: 'UNSUPPORTED_SCHEMA',
          schemaVersion: classification.schemaVersion,
          supportedMajor: classification.supportedMajor,
        },
      },
    )
  }
  if (classification.status === 'missing') {
    throw new AppError('INVALID_MANIFEST', '不支持导入旧版引擎，请导入包含该引擎的项目或使用受支持的引擎版本', {
      details: { reason: 'LEGACY_ENGINE' },
    })
  }
  if (classification.status === 'invalid') {
    throw new AppError('INVALID_MANIFEST', classification.reason, {
      details: {
        reason: 'PARSE_FAILED',
        manifestReason: classification.reason,
      },
    })
  }

  return buildEngineSnapshot(enginePath, classification.manifest)
}

async function copyAndFinalizeEngine(
  engineId: string,
  sourcePath: AbsPath,
  targetPath: AbsPath,
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

async function findEngineByLookupPath(path: AbsPath): Promise<Engine | undefined> {
  return db.engines.where('pathLookupKey').equals(toLookupPathKey(path)).first()
}

function identityKeyOf(
  input: { path: AbsPath, engineId?: string, version?: string },
): string {
  if (input.engineId && input.version) {
    return `${input.engineId}:${input.version}`
  }

  return toLookupPathKey(input.path)
}

async function collectEngineWarnings(
  enginePath: AbsPath,
  metadata: EngineMetadata,
): Promise<ResourceWarning[]> {
  const warnings: ResourceWarning[] = []
  const iconPath = await resolveEngineIconPreviewPath(enginePath, metadata)
  if (!(await exists(iconPath))) {
    warnings.push(createWarning('missing-favicon', '引擎 favicon 不存在'))
  }
  return warnings
}

async function inspectEngine(
  rawPath: AbsPath,
): Promise<ResourceHealthResult<EngineSnapshot>> {
  const { normalizedPath, lookupKey } = normalizeImportPath(rawPath)

  if (!(await exists(normalizedPath))) {
    return {
      availability: 'missing',
      warnings: [],
      blockingIssue: { code: 'DIR_NOT_FOUND', message: '引擎目录不存在' },
      normalizedPath,
      lookupKey,
    }
  }

  if (!(await validateEngine(normalizedPath))) {
    return {
      availability: 'broken',
      warnings: [],
      blockingIssue: { code: 'INVALID_STRUCTURE', message: '无效的引擎文件夹' },
      normalizedPath,
      lookupKey,
    }
  }

  const classification = await classifyEngine(normalizedPath)
  if (classification.status !== 'ok') {
    return {
      availability: 'broken',
      warnings: [],
      blockingIssue: classifyEngineToBlockingIssue(classification),
      normalizedPath,
      lookupKey,
    }
  }

  const snapshot = await buildEngineSnapshot(normalizedPath, classification.manifest)
  const warnings = await collectEngineWarnings(normalizedPath, snapshot.metadata)

  return {
    availability: 'available',
    warnings,
    payload: snapshot,
    normalizedPath,
    lookupKey,
  }
}

function classifyEngineToBlockingIssue(classification: EngineManifestResult) {
  if (classification.status === 'unsupportedSchema') {
    return {
      code: 'INVALID_MANIFEST' as const,
      message: `引擎清单 schemaVersion ${classification.schemaVersion} 不受支持`,
      details: {
        reason: 'UNSUPPORTED_SCHEMA',
        schemaVersion: classification.schemaVersion,
        supportedMajor: classification.supportedMajor,
      },
    }
  }
  if (classification.status === 'missing') {
    return {
      code: 'INVALID_MANIFEST' as const,
      message: '不支持导入旧版引擎',
      details: { reason: 'LEGACY_ENGINE' },
    }
  }
  if (classification.status === 'invalid') {
    return {
      code: 'INVALID_MANIFEST' as const,
      message: classification.reason,
      details: { reason: 'PARSE_FAILED', manifestReason: classification.reason },
    }
  }
  return { code: 'INVALID_MANIFEST' as const, message: '引擎清单无效' }
}

export interface ImportEngineResult {
  id: string
  alreadyRegistered: boolean
}

async function importEngine(enginePath: AbsPath): Promise<ImportEngineResult> {
  const { normalizedPath, lookupKey: sourceLookupKey } = normalizeImportPath(enginePath)

  // 幂等：源路径已注册直接返回既有 ID
  const existingBySource = await findEngineByLookupPath(normalizedPath)
  if (existingBySource) {
    return { id: existingBySource.id, alreadyRegistered: true }
  }

  const snapshot = await assertEngineImportable(normalizedPath)

  // 幂等：同 engineId+version 的引擎已注册（首选场景：用户拖入源目录但 DB 里只有托管目标路径）
  const existingByRef = await findEngineByRef({
    id: snapshot.engineId,
    version: snapshot.version,
  })
  if (existingByRef) {
    return { id: existingByRef.id, alreadyRegistered: true }
  }

  const { normalizedPath: targetPath, lookupKey: targetLookupKey } = normalizeImportPath(
    await resolveManagedEnginePath(snapshot),
  )

  if (sourceLookupKey === targetLookupKey) {
    logger.info(`[引擎导入] 引擎已在托管目录，直接注册: ${normalizedPath}`)
    return { id: await registerEngine(targetPath, snapshot), alreadyRegistered: false }
  }

  // 目标路径在文件系统中已存在但 DB 里无对应记录 → 冲突
  if (await exists(targetPath)) {
    throw new AppError('TARGET_CONFLICT', '目标引擎目录已存在，请先清理后重试')
  }

  logger.info(`[引擎 ${snapshot.name}] 开始导入`)
  const engineId = await registerEngine(targetPath, {
    ...snapshot,
    status: 'creating',
  })
  useResourceStore().updateProgress(engineId, 0)

  try {
    await copyAndFinalizeEngine(engineId, normalizedPath, targetPath)
    logger.info(`[引擎 ${snapshot.name}] 导入完成`)
    return { id: engineId, alreadyRegistered: false }
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
  if (engine.availability === 'available') {
    try {
      await fsCmds.deleteFile(engine.path, true)
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
  inspectEngine,
  getEnginePreviewAssets,
  findEngineByRef,
  canDeleteEngine,
  canDeleteEngineGroup,
  validateAllEngines,
  importEngine,
  uninstallEngine,
  uninstallEngineGroup,
  identityKeyOf,
}
