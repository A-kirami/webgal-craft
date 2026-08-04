import { exists, readTextFile } from '@tauri-apps/plugin-fs'
import sanitize from 'sanitize-filename'

import { fsCmds } from '~/commands/fs'
import { projectConfigCmds } from '~/commands/project-config'
import { db } from '~/database/db'
import { AbsPath } from '~/domain/path'
import { templateManifestPath } from '~/services/platform/app-paths'
import { normalizeImportPath, ResourceAvailability } from '~/services/resource-health'
import { caseFoldedEquals, toLookupPathKey } from '~/services/resource-path/lookup'
import {
  createResourceValidationFailure,
  createResourceValidationSummary,
  logResourceValidationSummary,
} from '~/services/resource-validation-summary'
import { TemplateMetadata } from '~/services/types'
import { useResourceStore } from '~/stores/resource'
import { useStorageSettingsStore } from '~/stores/storage-settings'
import { AppError } from '~/types/errors'

import type { Game, Template } from '~/database/model'
import type { ResourceValidationFailure, ResourceValidationSummary } from '~/services/resource-validation-summary'
import type {
  PreparedManagedImport,
  PrepareManagedImportResult,
} from '~/types/managed-import'

interface RegisterTemplateOptions {
  metadata?: TemplateMetadata
  status?: Template['status']
}

interface DeleteTemplateCheckResult {
  canDelete: boolean
  reason?: 'TEMPLATE_HAS_ASSOCIATED_GAMES' | 'TEMPLATE_REFERENCE_CHECK_FAILED'
  associatedGames?: Game[]
  uncheckedGames?: Game[]
}

interface TemplateDeleteBlockers {
  associatedGames: Game[]
  uncheckedGames: Game[]
}

interface TemplateAssociationInspection {
  associatedGame?: Game
  uncheckedGame?: Game
}

interface TemplateAvailabilityInspection {
  availability: ResourceAvailability
  failure?: unknown
  metadata?: TemplateMetadata
}

interface ManagedTemplateImportPlan {
  metadata: TemplateMetadata
}

export type PreparedTemplateManagedImport = PreparedManagedImport<ManagedTemplateImportPlan>

async function validateTemplate(templatePath: AbsPath): Promise<boolean> {
  return fsCmds.validateDirectoryStructure(
    templatePath,
    [],
    ['template.json'],
  )
}

function normalizeTemplateMetadata(raw: unknown): TemplateMetadata {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new AppError('INVALID_STRUCTURE', '模板描述文件无效')
  }

  const record = raw as Record<string, unknown>
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  if (!name) {
    throw new AppError('INVALID_STRUCTURE', '模板名称不能为空')
  }

  // 兼容 kebab-case 与 camelCase 两种字段写法
  const rawWebgalVersion = record['webgal-version'] ?? record.webgalVersion
  const webgalVersion = typeof rawWebgalVersion === 'string'
    ? rawWebgalVersion.trim() || undefined
    : undefined

  return {
    name,
    webgalVersion,
  }
}

async function getTemplateMetadata(templatePath: AbsPath): Promise<TemplateMetadata> {
  const manifestPath = templateManifestPath(templatePath)
  const metaContent = await readTextFile(manifestPath)

  try {
    return normalizeTemplateMetadata(JSON.parse(metaContent))
  } catch (error) {
    if (error instanceof AppError) {
      throw error
    }

    throw new AppError('INVALID_STRUCTURE', '模板描述文件无效', { cause: error })
  }
}

async function registerTemplate(
  templatePath: AbsPath,
  options: RegisterTemplateOptions = {},
): Promise<string> {
  const { status = 'created' } = options
  const metadata = options.metadata ?? await getTemplateMetadata(templatePath)

  return db.templates.add({
    id: crypto.randomUUID(),
    path: templatePath,
    pathLookupKey: toLookupPathKey(templatePath),
    createdAt: Date.now(),
    status,
    availability: 'available',
    metadata,
  })
}

function sanitizeTemplateDirectoryName(templateName: string): string {
  const sanitizedName = sanitize(templateName ?? '', { replacement: '_' }).trim()
  if (!sanitizedName) {
    throw new AppError('IO_ERROR', '模板名称无效')
  }

  return sanitizedName
}

async function resolveInstalledTemplatePath(templateSavePath: string, templateName: string): Promise<AbsPath> {
  return AbsPath.append(AbsPath.from(templateSavePath), sanitizeTemplateDirectoryName(templateName))
}

async function findTemplateByName(templateName: string): Promise<Template | undefined> {
  return db.templates
    .where('metadata.name')
    .equals(templateName)
    .first()
}

async function findTemplateByPath(templatePath: AbsPath): Promise<Template | undefined> {
  return db.templates
    .where('pathLookupKey')
    .equals(toLookupPathKey(templatePath))
    .first()
}

async function inspectTemplateAssociation(
  templateName: string,
  game: Game,
): Promise<TemplateAssociationInspection> {
  try {
    const config = await projectConfigCmds.readProjectConfig(game.path)
    if (config.template?.kind === 'standalone' && config.template.name === templateName) {
      return { associatedGame: game }
    }
  } catch (error) {
    logger.warn(`[模板删除] 读取游戏项目配置失败，阻止删除以避免误删引用: ${game.path} - ${error}`)
    return { uncheckedGame: game }
  }

  return {}
}

async function findTemplateDeleteBlockers(templateName: string): Promise<TemplateDeleteBlockers> {
  const games = await db.games.toArray()
  const inspections = await Promise.all(games.map(game => inspectTemplateAssociation(templateName, game)))

  return {
    associatedGames: inspections
      .map(inspection => inspection.associatedGame)
      .filter(game => game !== undefined),
    uncheckedGames: inspections
      .map(inspection => inspection.uncheckedGame)
      .filter(game => game !== undefined),
  }
}

async function canDeleteTemplate(templateName: string): Promise<DeleteTemplateCheckResult> {
  let blockers: TemplateDeleteBlockers
  try {
    blockers = await findTemplateDeleteBlockers(templateName)
  } catch (error) {
    logger.warn(`[模板删除] 模板引用检查失败，阻止删除以避免误删引用: ${templateName} - ${error}`)
    return { canDelete: false, reason: 'TEMPLATE_REFERENCE_CHECK_FAILED', uncheckedGames: [] }
  }

  const { associatedGames, uncheckedGames } = blockers
  if (associatedGames.length > 0) {
    return { canDelete: false, reason: 'TEMPLATE_HAS_ASSOCIATED_GAMES', associatedGames }
  }
  if (uncheckedGames.length > 0) {
    return { canDelete: false, reason: 'TEMPLATE_REFERENCE_CHECK_FAILED', uncheckedGames }
  }

  return { canDelete: true }
}

async function deleteTemplateDirectoryIfExists(path: AbsPath): Promise<unknown | undefined> {
  try {
    if (await exists(path)) {
      await fsCmds.deleteFile(path, true)
    }
  } catch (error) {
    return error
  }
}

async function inspectTemplateImport(templatePath: AbsPath): Promise<{
  existing?: Template
  metadata: TemplateMetadata
}> {
  if (!(await validateTemplate(templatePath))) {
    logger.warn(`[模板导入] 无效的模板文件夹: ${templatePath}`)
    throw new AppError('INVALID_STRUCTURE', '无效的模板文件夹')
  }

  const metadata = await getTemplateMetadata(templatePath)
  const existing = await findTemplateByName(metadata.name)
  return { existing, metadata }
}

async function assertTemplateImportable(templatePath: AbsPath): Promise<TemplateMetadata> {
  const { existing, metadata } = await inspectTemplateImport(templatePath)
  if (existing) {
    throw new AppError('DUPLICATE_RESOURCE', '同名模板已存在')
  }

  return metadata
}

async function installTemplate(templatePath: AbsPath, metadata: TemplateMetadata): Promise<void> {
  const resourceStore = useResourceStore()
  const storageSettingsStore = useStorageSettingsStore()

  if (!storageSettingsStore.templateSavePath) {
    throw new AppError('DIR_NOT_FOUND', '模板保存位置未设置')
  }

  const targetPath = await resolveInstalledTemplatePath(storageSettingsStore.templateSavePath, metadata.name)
  if (await exists(targetPath)) {
    throw new AppError('IO_ERROR', '目标模板目录已存在，请先清理后重试')
  }

  logger.info(`[模板安装] 开始: 名称=${metadata.name}, 源=${templatePath}, 目标=${targetPath}`)
  const id = await registerTemplate(targetPath, {
    metadata,
    status: 'creating',
  })

  try {
    await fsCmds.copyDirectoryWithProgress(templatePath, targetPath, (progress) => {
      resourceStore.updateProgress(id, progress)
    })

    await db.templates.update(id, { status: 'created' })
    resourceStore.finishProgress(id)
    logger.info(`[模板安装] 完成: ID=${id}, 名称=${metadata.name}, 源=${templatePath}, 目标=${targetPath}`)
  } catch (error) {
    logger.error(`[模板安装] 失败: ID=${id}, 名称=${metadata.name}, 源=${templatePath}, 目标=${targetPath} - ${error}`)
    resourceStore.finishProgress(id)
    await db.templates.delete(id).catch((error_) => {
      logger.warn(`[模板清理] 删除记录失败: ID=${id}, 目标=${targetPath} - ${error_}`)
    })
    const directoryCleanupError = await deleteTemplateDirectoryIfExists(targetPath)
    if (directoryCleanupError) {
      logger.warn(`[模板清理] 删除目录失败 (${targetPath}): ${directoryCleanupError}`)
    }
    throw error
  }
}

async function importTemplate(templatePath: AbsPath): Promise<void> {
  const storageSettingsStore = useStorageSettingsStore()
  const metadata = await assertTemplateImportable(templatePath)

  if (!storageSettingsStore.templateSavePath) {
    throw new AppError('DIR_NOT_FOUND', '模板保存位置未设置')
  }

  const targetPath = await resolveInstalledTemplatePath(storageSettingsStore.templateSavePath, metadata.name)
  if (caseFoldedEquals(templatePath, targetPath)) {
    const existingByPath = await findTemplateByPath(templatePath)
    if (existingByPath) {
      throw new AppError('DUPLICATE_RESOURCE', '同名模板已存在')
    }

    logger.info(`[模板导入] 模板已在目标位置，直接注册: ${templatePath}`)
    await registerTemplate(templatePath, { metadata })
    return
  }

  await installTemplate(templatePath, metadata)
}

async function prepareManagedImport(
  stagingPath: AbsPath,
): Promise<PrepareManagedImportResult<ManagedTemplateImportPlan>> {
  const { existing, metadata } = await inspectTemplateImport(stagingPath)
  if (existing) {
    return { kind: 'duplicate', existingId: existing.id }
  }

  return {
    kind: 'ready',
    prepared: {
      finalRelativePath: sanitizeTemplateDirectoryName(metadata.name),
      plan: { metadata },
    },
  }
}

async function registerManagedImport(
  finalPath: AbsPath,
  prepared: PreparedTemplateManagedImport,
): Promise<{ id: string }> {
  const { normalizedPath } = normalizeImportPath(finalPath)
  return { id: await registerTemplate(normalizedPath, { metadata: prepared.plan.metadata }) }
}

async function deleteTemplate(template: Template): Promise<void> {
  const deleteCheck = await canDeleteTemplate(template.metadata.name)
  if (!deleteCheck.canDelete) {
    const message = deleteCheck.reason === 'TEMPLATE_REFERENCE_CHECK_FAILED'
      ? '模板引用关系无法确认，无法删除'
      : '模板仍被游戏使用，无法删除'
    throw new AppError('RESOURCE_IN_USE', message, {
      details: { reason: deleteCheck.reason },
    })
  }

  if (template.availability === 'available') {
    try {
      await fsCmds.deleteFile(template.path, true)
    } catch (error) {
      logger.warn(`[模板删除] 删除模板目录失败，继续清理数据库记录: ${template.path} - ${error}`)
    }
  }
  await db.templates.delete(template.id)
}

async function inspectTemplateAvailabilityInternal(templatePath: AbsPath): Promise<TemplateAvailabilityInspection> {
  if (!(await exists(templatePath))) {
    return { availability: 'missing' }
  }
  if (!(await validateTemplate(templatePath))) {
    return { availability: 'broken' }
  }
  try {
    const metadata = await getTemplateMetadata(templatePath)
    return { availability: 'available', metadata }
  } catch (error) {
    return { availability: 'broken', failure: error }
  }
}

async function inspectTemplateAvailability(templatePath: AbsPath): Promise<{
  availability: ResourceAvailability
  metadata?: TemplateMetadata
}> {
  const { availability, failure, metadata } = await inspectTemplateAvailabilityInternal(templatePath)
  if (failure) {
    logger.warn(`[模板校验] 读取元数据失败 (${templatePath}): ${failure}`)
  }
  return { availability, metadata }
}

async function validateTemplateRecordForBatch(template: Template): Promise<ResourceValidationFailure | undefined> {
  if (template.status === 'creating') {
    // creating 是上次未完成的导入残留，仍按既有逻辑清理
    const directoryCleanupError = await deleteTemplateDirectoryIfExists(template.path)
    try {
      await db.templates.delete(template.id)
    } catch (error) {
      return createResourceValidationFailure(template.path, error)
    }
    return directoryCleanupError
      ? createResourceValidationFailure(template.path, directoryCleanupError)
      : undefined
  }

  if (template.status !== 'created') {
    return
  }

  try {
    const inspection = await inspectTemplateAvailabilityInternal(template.path)
    const patch: Partial<Template> = {}
    if (template.availability !== inspection.availability) {
      patch.availability = inspection.availability
    }
    if (inspection.metadata
      && (template.metadata.name !== inspection.metadata.name
        || template.metadata.webgalVersion !== inspection.metadata.webgalVersion)) {
      patch.metadata = inspection.metadata
    }
    if (Object.keys(patch).length > 0) {
      await db.templates.update(template.id, patch)
    }
    return inspection.failure
      ? createResourceValidationFailure(template.path, inspection.failure)
      : undefined
  } catch (error) {
    if (template.availability !== 'broken') {
      try {
        await db.templates.update(template.id, { availability: 'broken' })
      } catch (updateError) {
        logger.warn(`[模板校验] 标记模板为 broken 失败 (${template.path}): ${updateError}`)
      }
    }
    return createResourceValidationFailure(template.path, error)
  }
}

async function validateAllTemplates(): Promise<ResourceValidationSummary> {
  const templates = await db.templates.toArray()

  const targets = templates.filter(template => template.status === 'created' || template.status === 'creating')
  const validationResults = await Promise.all(targets.map(template => validateTemplateRecordForBatch(template)))
  const failures = validationResults
    .filter((failure): failure is ResourceValidationFailure => failure !== undefined)
  const summary = createResourceValidationSummary(targets.length, failures)
  logResourceValidationSummary('模板校验', summary)
  return summary
}

export const templateManager = {
  validateTemplate,
  validateAllTemplates,
  inspectTemplateAvailability,
  getTemplateMetadata,
  canDeleteTemplate,
  importTemplate,
  prepareManagedImport,
  registerManagedImport,
  deleteTemplate,
}
