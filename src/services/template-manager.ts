import { exists, readTextFile } from '@tauri-apps/plugin-fs'
import sanitize from 'sanitize-filename'

import { fsCmds } from '~/commands/fs'
import { db } from '~/database/db'
import { Template } from '~/database/model'
import { AbsPath } from '~/domain/path'
import { templateManifestPath } from '~/services/platform/app-paths'
import { ResourceAvailability } from '~/services/resource-health'
import { caseFoldedEquals } from '~/services/resource-path/lookup'
import { TemplateMetadata } from '~/services/types'
import { useResourceStore } from '~/stores/resource'
import { useStorageSettingsStore } from '~/stores/storage-settings'
import { AppError } from '~/types/errors'

interface RegisterTemplateOptions {
  metadata?: TemplateMetadata
  status?: Template['status']
}

async function validateTemplate(templatePath: string): Promise<boolean> {
  return fsCmds.validateDirectoryStructure(
    AbsPath.from(templatePath),
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

async function getTemplateMetadata(templatePath: string): Promise<TemplateMetadata> {
  const manifestPath = templateManifestPath(AbsPath.from(templatePath))
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
  templatePath: string,
  options: RegisterTemplateOptions = {},
): Promise<string> {
  const { status = 'created' } = options
  const metadata = options.metadata ?? await getTemplateMetadata(templatePath)

  return db.templates.add({
    id: crypto.randomUUID(),
    path: templatePath,
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

async function resolveInstalledTemplatePath(templateSavePath: string, templateName: string): Promise<string> {
  return AbsPath.append(AbsPath.from(templateSavePath), sanitizeTemplateDirectoryName(templateName))
}

async function findTemplateByName(templateName: string): Promise<Template | undefined> {
  return db.templates
    .where('metadata.name')
    .equals(templateName)
    .first()
}

async function findTemplateByPath(templatePath: string): Promise<Template | undefined> {
  const normalizedPath = AbsPath.from(templatePath)
  const templates = await db.templates.toArray()
  return templates.find(template => caseFoldedEquals(AbsPath.from(template.path), normalizedPath))
}

async function deleteTemplateDirectoryIfExists(path: string): Promise<void> {
  try {
    if (await exists(path)) {
      await fsCmds.deleteFile(AbsPath.from(path), true)
    }
  } catch (error) {
    logger.warn(`[模板清理] 删除目录失败 (${path}): ${error}`)
  }
}

async function assertTemplateImportable(templatePath: string): Promise<TemplateMetadata> {
  if (!(await validateTemplate(templatePath))) {
    logger.error(`[模板导入] 无效的模板文件夹: ${templatePath}`)
    throw new AppError('INVALID_STRUCTURE', '无效的模板文件夹')
  }

  const metadata = await getTemplateMetadata(templatePath)
  const existing = await findTemplateByName(metadata.name)
  if (existing) {
    throw new AppError('DUPLICATE_RESOURCE', '同名模板已存在')
  }

  return metadata
}

async function installTemplate(templatePath: string, metadata: TemplateMetadata): Promise<void> {
  const resourceStore = useResourceStore()
  const storageSettingsStore = useStorageSettingsStore()

  if (!storageSettingsStore.templateSavePath) {
    throw new AppError('DIR_NOT_FOUND', '模板保存位置未设置')
  }

  const targetPath = await resolveInstalledTemplatePath(storageSettingsStore.templateSavePath, metadata.name)
  if (await exists(targetPath)) {
    throw new AppError('IO_ERROR', '目标模板目录已存在，请先清理后重试')
  }

  logger.info(`[模板 ${metadata.name}] 开始安装`)
  const id = await registerTemplate(targetPath, {
    metadata,
    status: 'creating',
  })

  try {
    await fsCmds.copyDirectoryWithProgress(AbsPath.from(templatePath), AbsPath.from(targetPath), (progress) => {
      resourceStore.updateProgress(id, progress)
    })

    await db.templates.update(id, { status: 'created' })
    resourceStore.finishProgress(id)
    logger.info(`[模板 ${metadata.name}] 安装完成`)
  } catch (error) {
    resourceStore.finishProgress(id)
    await db.templates.delete(id).catch((error_) => {
      logger.warn(`[模板清理] 删除记录失败 (${id}): ${error_}`)
    })
    await deleteTemplateDirectoryIfExists(targetPath)
    throw error
  }
}

async function importTemplate(templatePath: string): Promise<void> {
  const storageSettingsStore = useStorageSettingsStore()
  const metadata = await assertTemplateImportable(templatePath)

  if (!storageSettingsStore.templateSavePath) {
    throw new AppError('DIR_NOT_FOUND', '模板保存位置未设置')
  }

  const targetPath = await resolveInstalledTemplatePath(storageSettingsStore.templateSavePath, metadata.name)
  if (caseFoldedEquals(AbsPath.from(templatePath), AbsPath.from(targetPath))) {
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

async function deleteTemplate(template: Template): Promise<void> {
  if (template.availability === 'available') {
    try {
      await fsCmds.deleteFile(AbsPath.from(template.path), true)
    } catch (error) {
      logger.warn(`[模板删除] 删除模板目录失败，继续清理数据库记录: ${template.path} - ${error}`)
    }
  }
  await db.templates.delete(template.id)
}

async function inspectTemplateAvailability(templatePath: string): Promise<{
  availability: ResourceAvailability
  metadata?: TemplateMetadata
}> {
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
    logger.warn(`[模板校验] 读取元数据失败 (${templatePath}): ${error}`)
    return { availability: 'broken' }
  }
}

async function validateAllTemplates(): Promise<void> {
  const templates = await db.templates.toArray()

  await Promise.allSettled(templates.map(async (template) => {
    if (template.status === 'creating') {
      // creating 是上次未完成的导入残留，仍按既有逻辑清理
      await deleteTemplateDirectoryIfExists(template.path)
      await db.templates.delete(template.id)
      return
    }

    if (template.status !== 'created') {
      return
    }

    const inspection = await inspectTemplateAvailability(template.path).catch((error) => {
      logger.warn(`[模板校验] 校验异常 (${template.path}): ${error}`)
      return { availability: 'broken' as ResourceAvailability, metadata: undefined }
    })

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
  }))
}

export const templateManager = {
  validateTemplate,
  validateAllTemplates,
  inspectTemplateAvailability,
  getTemplateMetadata,
  importTemplate,
  deleteTemplate,
}
