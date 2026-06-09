import { projectConfigCmds } from '~/commands/project-config'
import { serverCmds } from '~/commands/server'
import { vfsCmds } from '~/commands/vfs'
import { db } from '~/database/db'
import { assertEngineEditorCompatible } from '~/services/engine-manager'
import { gameManager } from '~/services/game-manager'
import { templateSwitch } from '~/services/template-switch'
import { usePreviewSessionStore } from '~/stores/preview-session'
import { AppError } from '~/types/errors'

import type { Engine, Game } from '~/database/model'
import type { EngineRef, ProjectConfig, TemplateBinding } from '~/types/project-config'

type TemplateDecision = 'keep' | 'discard'

function buildNewConfig(
  oldConfig: ProjectConfig,
  newEngine: Pick<Engine, 'engineId' | 'version'>,
  templateDecision: TemplateDecision | undefined,
  oldEngine: Pick<Engine, 'engineId' | 'version'> | undefined,
): ProjectConfig {
  const newEngineRef: EngineRef = {
    id: newEngine.engineId,
    version: newEngine.version,
  }

  let template: TemplateBinding | undefined = oldConfig.template

  if (templateDecision === 'keep' && !template && oldEngine) {
    // 将缺省模板绑定固化为旧引擎内建模板
    template = {
      kind: 'engineBuiltin',
      engine: {
        id: oldEngine.engineId,
        version: oldEngine.version,
      },
    }
  }

  return {
    ...oldConfig,
    engine: newEngineRef,
    template,
  }
}

/** 站点未注册时为非致命情形（项目尚未打开预览），吞掉错误并 warn */
async function applySiteUpdate(updater: () => Promise<void>, label: string): Promise<void> {
  try {
    await updater()
  } catch (error) {
    if (error instanceof AppError && error.code === 'SITE_NOT_REGISTERED') {
      logger.warn(`[引擎切换] ${label}: 站点未注册，跳过站点配置更新`)
      return
    }
    throw error
  }
}

interface SwitchEngineOptions {
  templateDecision?: TemplateDecision
}

async function switchEngine(
  game: Game,
  newEngine: Engine,
  options: SwitchEngineOptions = {},
): Promise<void> {
  if (!game.engineId) {
    throw new AppError('IO_ERROR', '自带引擎项目不支持引擎切换')
  }

  assertEngineEditorCompatible(newEngine)

  const oldEngine = await db.engines.get(game.engineId)
  if (!oldEngine) {
    throw new AppError('IO_ERROR', '当前引擎记录缺失，无法安全切换')
  }

  const oldConfig = await projectConfigCmds.readProjectConfig(game.path)
  const strategy = await templateSwitch.evaluateTemplateStrategy(game.path, oldConfig)

  if (strategy === 'dirty' && !options.templateDecision) {
    throw new AppError('IO_ERROR', '模板已修改，需要用户选择处理方式', {
      details: { reason: 'TEMPLATE_DIRTY_NEEDS_DECISION' },
    })
  }

  logger.info(`[引擎切换] ${game.path}: 开始切换到引擎 ${newEngine.name}`)

  // 仅在模板脏状态时才需要用户决策
  const templateDecision = strategy === 'dirty' ? options.templateDecision : undefined
  const newConfig = buildNewConfig(oldConfig, newEngine, templateDecision, oldEngine)

  // 缓存切换前的有效模板路径，用于回滚 site template_path
  const oldTemplatePath = await templateSwitch.resolveTemplatePath(oldConfig.template, oldEngine)
  // 计算切换后期望的模板路径：
  // - 显式绑定（explicit）：保持原绑定解析结果
  // - keep 分支：newConfig.template 已固化为旧引擎 engineBuiltin
  // - discard 默认：使用新引擎内建模板
  const newTemplatePath = await templateSwitch.resolveTemplatePath(newConfig.template, newEngine)

  let step = 0
  let noRollbackAfterDiscard = false

  try {
    // 步骤 1：更新 project.wgcp（atomic_write，失败旧文件不受影响）
    await projectConfigCmds.writeProjectConfig(game.path, newConfig)
    step = 1

    // 步骤 2：更新 DB
    await db.games.update(game.id, { engineId: newEngine.id })
    step = 2

    // 步骤 3：更新 VFS 站点引擎路径
    await applySiteUpdate(
      () => serverCmds.updateSiteEngine(game.path, newEngine.path),
      'updateSiteEngine',
    )
    step = 3

    // 步骤 4：更新 VFS 站点模板路径，让运行中的预览立即看到新的 template lower
    await applySiteUpdate(
      () => serverCmds.updateSiteTemplate(game.path, newTemplatePath),
      'updateSiteTemplate',
    )
    step = 4

    // 步骤 5：模板清理（仅 discard 分支）。
    // 该步骤不可逆，必须排在所有可回滚步骤之后；前面任何步骤失败都不应触及用户的模板上层。
    if (templateDecision === 'discard') {
      noRollbackAfterDiscard = true
      await vfsCmds.cleanTemplateUpper(game.path)
    }
    step = 5

    // 收尾：刷新 DB 与 workspace 快照，更新 previewAssets.cacheVersion，
    // 让首页卡片与编辑器头部都能拉到新引擎图标，避免浏览器命中旧缓存
    await runFinalizer(() => gameManager.refreshRegisteredGameSnapshot(game.path, { invalidate: 'all' }), '刷新游戏快照失败')

    // 收尾：关闭打开的模板文档、刷新文件树、通知预览拉取新模板
    // 显式传入 newEngine.path 与 newTemplatePath：此时 workspaceStore.currentGame
    // 仍是切换前快照，file store 单靠它反查会拿到旧引擎/模板路径，
    // 导致首次切换不刷新模板内容。
    // 该步骤仅做前端通知，且发生在 cleanTemplateUpper 之后，必须吞掉异常以免触发回滚。
    await runFinalizer(() => templateSwitch.notifyTemplateChanged(game.path, {
      nextEnginePath: newEngine.path,
      // eslint-disable-next-line unicorn/no-null
      nextTemplatePath: newTemplatePath ?? null,
    }), '通知模板变更失败')

    // 引擎换的是 runtime 本身（webgal.js、index.html、内置资源等），
    // 必须重新解析 serve URL（依赖 engineId+path）并重载 iframe，
    // 才能让运行时跑在新引擎上。
    await runFinalizer(() => usePreviewSessionStore().syncIfCurrentGame({
      engineId: newEngine.id,
      path: game.path,
    }), '重载预览 iframe 失败')

    logger.info(`[引擎切换] ${game.path}: 切换完成`)
  } catch (error) {
    if (noRollbackAfterDiscard) {
      logger.warn(`[引擎切换] ${game.path}: 步骤 ${step} 失败，跳过回滚`)
      throw error
    }
    logger.warn(`[引擎切换] ${game.path}: 步骤 ${step} 失败，开始回滚`)
    await rollback(game, oldConfig, oldEngine, { step, oldTemplatePath })
    throw error
  }
}

async function runFinalizer(action: () => Promise<unknown>, label: string): Promise<void> {
  try {
    await action()
  } catch (error) {
    logger.warn(`[引擎切换] ${label}: ${error}`)
  }
}

interface RollbackContext {
  step: number
  oldTemplatePath: string | undefined
}

async function rollback(
  game: Game,
  oldConfig: ProjectConfig,
  oldEngine: Engine,
  context: RollbackContext,
): Promise<void> {
  if (context.step >= 4) {
    await applySiteUpdate(
      () => serverCmds.updateSiteTemplate(game.path, context.oldTemplatePath),
      'rollback updateSiteTemplate',
    ).catch(logRollbackError)
  }

  if (context.step >= 3) {
    await applySiteUpdate(
      () => serverCmds.updateSiteEngine(game.path, oldEngine.path),
      'rollback updateSiteEngine',
    ).catch(logRollbackError)
  }

  if (context.step >= 2) {
    await db.games.update(game.id, { engineId: game.engineId }).catch(logRollbackError)
  }

  if (context.step >= 1) {
    await projectConfigCmds.writeProjectConfig(game.path, oldConfig).catch(logRollbackError)
  }
}

function logRollbackError(error: unknown): void {
  logger.error(`引擎切换回滚异常: ${error}`)
}

export const engineSwitch = {
  switchEngine,
}
