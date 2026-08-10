import { projectConfigCmds } from '~/commands/project-config'
import { serverCmds } from '~/commands/server'
import { vfsCmds } from '~/commands/vfs'
import { db } from '~/database/db'
import { AbsPath, RelPath } from '~/domain/path'
import { debugCommander } from '~/services/debug-commander'
import { engineManager, isEngineUsable } from '~/services/engine-manager'
import { useEditorStore } from '~/stores/editor'
import { useFileStore } from '~/stores/file'
import { useTabsStore } from '~/stores/tabs'
import { AppError } from '~/types/errors'

import type { Engine, Game } from '~/database/model'
import type { ProjectConfig, TemplateBinding } from '~/types/project-config'

type TemplateStrategy = 'explicit' | 'clean' | 'dirty'

function templateUpperPath(gamePath: AbsPath): AbsPath {
  return AbsPath.join(gamePath, RelPath.from('game/template'))
}

function isPathWithinDirectory(path: AbsPath, directory: AbsPath): boolean {
  try {
    AbsPath.relativize(path, directory)
    return true
  } catch {
    return false
  }
}

async function isTemplateDirty(gamePath: AbsPath): Promise<boolean> {
  if (await vfsCmds.isTemplateDirty(gamePath)) {
    return true
  }

  // 在无 Pinia 上下文（如非渲染进程逻辑）调用时降级为 false，不阻塞核心流程
  try {
    const templateRoot = templateUpperPath(gamePath)
    return useEditorStore().hasUnsavedDocumentsUnder(templateRoot)
  } catch {
    return false
  }
}

async function closeOpenedTemplateDocuments(gamePath: AbsPath): Promise<void> {
  try {
    const templateRoot = templateUpperPath(gamePath)
    const tabsStore = useTabsStore()
    const openedPaths = tabsStore.tabs
      .filter(tab => isPathWithinDirectory(tab.path, templateRoot))
      .map(tab => tab.path)

    for (const path of openedPaths) {
      const index = tabsStore.findTabIndex(path)
      if (index !== -1) {
        tabsStore.closeTab(index)
      }
    }
  } catch (error) {
    logger.warn(`[模板切换] 关闭模板文档失败: ${error}`)
  }
}

interface NotifyTemplateChangedOptions {
  nextEnginePath?: AbsPath
  nextTemplatePath?: AbsPath | null
  skipPreviewTemplateReload?: boolean
}

async function refreshTemplateOverlayAndPreview(
  gamePath: AbsPath,
  options: NotifyTemplateChangedOptions,
): Promise<void> {
  // 失效 file store 中模板子树缓存并刷新 enginePath / templatePath，
  // 同时由 store 内部 emit `directory:modified` 通知订阅者重读。
  // 引擎/模板切换不会改动磁盘文件本身（只是 lower 路径变了），
  // OS watcher 不会触发；必须主动失效，否则 listDir 仍会用旧 lower 配置返回。
  try {
    await useFileStore().refreshTemplateOverlay(gamePath, {
      nextEnginePath: options.nextEnginePath,
      nextTemplatePath: options.nextTemplatePath,
    })
  } catch (error) {
    logger.warn(`[模板切换] 失效模板 overlay 缓存失败: ${error}`)
  }

  if (!options.skipPreviewTemplateReload) {
    try {
      await debugCommander.refetchTemplates()
    } catch (error) {
      // 无运行中的预览或站点未连接时忽略
      logger.warn(`[模板切换] 通知预览刷新模板失败: ${error}`)
    }
  }
}

/**
 * 切换收尾通用清理：
 * - 关闭仍打开的模板文档（联动 editor session 清理与未保存状态丢弃）
 * - 失效 file store 中模板子树缓存并刷新 enginePath / templatePath
 * - 按调用场景通知运行中的预览拉取新模板
 *
 * @param options.nextEnginePath 引擎切换路径下的新引擎路径。必须由调用方显式
 *   传入，因为此时 `workspaceStore.currentGame.engineId` 仍是切换前的快照。
 * @param options.nextTemplatePath 模板切换后的解析路径。`null` 表示回到
 *   "跟随当前引擎默认"（缺省 binding）。
 * @param options.skipPreviewTemplateReload 引擎切换已重载预览 iframe 时跳过独立的模板重载请求。
 */
async function notifyTemplateChanged(
  gamePath: AbsPath,
  options: NotifyTemplateChangedOptions = {},
): Promise<void> {
  await closeOpenedTemplateDocuments(gamePath)
  await refreshTemplateOverlayAndPreview(gamePath, options)
}

/**
 * 重置项目当前模板的所有覆盖内容，恢复到当前模板的初始状态。
 * 清理前关闭模板文档，避免打开的文档继续指向已移除的 upper 路径。
 */
async function resetTemplate(gamePath: AbsPath): Promise<void> {
  await closeOpenedTemplateDocuments(gamePath)
  await vfsCmds.cleanTemplateUpper(gamePath)
  await refreshTemplateOverlayAndPreview(gamePath, {})
}

/** 站点未注册时为非致命情形（项目尚未打开预览），吞掉错误并 warn */
async function applySiteUpdate(updater: () => Promise<void>, label: string): Promise<void> {
  try {
    await updater()
  } catch (error) {
    if (error instanceof AppError && error.code === 'SITE_NOT_REGISTERED') {
      logger.warn(`[模板切换] ${label}: 站点未注册，跳过站点配置更新`)
      return
    }
    throw error
  }
}

async function resolveTemplatePath(
  binding: TemplateBinding | undefined,
  currentEngine?: Pick<Engine, 'path'>,
): Promise<AbsPath | undefined> {
  if (!binding) {
    return currentEngine
      ? AbsPath.join(currentEngine.path, RelPath.from('game/template'))
      : undefined
  }

  switch (binding.kind) {
    case 'standalone': {
      const template = await db.templates
        .filter(t => t.metadata.name === binding.name && t.status === 'created')
        .first()
      return template?.path
    }
    case 'engineBuiltin': {
      const engine = await engineManager.findEngineByRef(binding.engine)
      return engine && isEngineUsable(engine)
        ? AbsPath.join(engine.path, RelPath.from('game/template'))
        : undefined
    }
    default: {
      return undefined
    }
  }
}

async function evaluateTemplateStrategy(
  gamePath: AbsPath,
  config: ProjectConfig,
): Promise<TemplateStrategy> {
  if (config.template) {
    return 'explicit'
  }

  const dirty = await isTemplateDirty(gamePath)
  return dirty ? 'dirty' : 'clean'
}

interface SwitchTemplateOptions {
  skipDirtyCheck?: boolean
}

async function switchTemplate(
  game: Game,
  newBinding: TemplateBinding | undefined,
  options: SwitchTemplateOptions = {},
): Promise<void> {
  if (!game.engineId) {
    throw new AppError('IO_ERROR', '自带引擎项目不支持模板切换')
  }

  const engine = await db.engines.get(game.engineId)
  if (!engine || !isEngineUsable(engine)) {
    throw new AppError('IO_ERROR', '引擎不可用，无法切换模板', {
      details: { reason: 'ENGINE_UNAVAILABLE' },
    })
  }

  if (!options.skipDirtyCheck && await isTemplateDirty(game.path)) {
    throw new AppError('IO_ERROR', '模板已修改，需要用户确认', {
      details: { reason: 'TEMPLATE_DIRTY' },
    })
  }

  logger.info(`[模板切换] ${game.path}: 开始切换模板`)

  const config = await projectConfigCmds.readProjectConfig(game.path)
  const newConfig: ProjectConfig = {
    ...config,
    template: newBinding,
  }

  // 切换前先关闭模板下打开的文档，避免它们的未保存内容因 cleanTemplateUpper 而残留为「指向已删除路径」
  await closeOpenedTemplateDocuments(game.path)

  await projectConfigCmds.writeProjectConfig(game.path, newConfig)
  await vfsCmds.cleanTemplateUpper(game.path)

  const newTemplatePath = await resolveTemplatePath(newBinding, engine)
  await applySiteUpdate(
    () => serverCmds.updateSiteTemplate(game.path, newTemplatePath),
    'updateSiteTemplate',
  )

  await notifyTemplateChanged(game.path, {
    // eslint-disable-next-line unicorn/no-null
    nextTemplatePath: newTemplatePath ?? null,
  })

  logger.info(`[模板切换] ${game.path}: 切换完成`)
}

export const templateSwitch = {
  resolveTemplatePath,
  evaluateTemplateStrategy,
  isTemplateDirty,
  resetTemplate,
  switchTemplate,
  notifyTemplateChanged,
}
