import { db } from '~/database/db'

import type { Game } from '~/database/model'
import type { StorageSavePathState } from '~/services/platform/storage-defaults'
import type { ResourceValidationSummary } from '~/services/resource-validation-summary'

interface AppStartupUpdateController {
  checkForUpdate(reason: 'startup'): unknown
}

interface AppStartupEngineManager {
  validateAllEngines(): Promise<ResourceValidationSummary>
}

interface AppStartupResourceReconcile {
  reconcileAllGames(): Promise<ResourceValidationSummary>
}

interface AppStartupTemplateManager {
  validateAllTemplates(): Promise<ResourceValidationSummary>
}

interface AppStartupRoute {
  path: string
}

interface AppStartupRouter {
  currentRoute: {
    value: AppStartupRoute
  }
  push(path: string): Promise<unknown>
}

interface AppStartupGeneralSettingsStore {
  openLastProject: boolean
}

interface AppStartupStorageSettingsStore extends StorageSavePathState {
  $patch(patch: Partial<StorageSavePathState>): void
}

export interface RunAppStartupOptions {
  appUpdateController: AppStartupUpdateController
  engineManager: AppStartupEngineManager
  generalSettingsStore: AppStartupGeneralSettingsStore
  resourceReconcile: AppStartupResourceReconcile
  resolveMissingStorageSavePaths(storageSettings: StorageSavePathState): Promise<Partial<StorageSavePathState>>
  router: AppStartupRouter
  storageSettingsStore: AppStartupStorageSettingsStore
  templateManager: AppStartupTemplateManager
  t(key: string, values?: Record<string, unknown>): string
}

async function initializeStoragePaths(options: RunAppStartupOptions): Promise<void> {
  const missingStoragePaths = await options.resolveMissingStorageSavePaths(options.storageSettingsStore)

  if (Object.keys(missingStoragePaths).length > 0) {
    options.storageSettingsStore.$patch(missingStoragePaths)
    logger.info(`初始化默认存储路径: ${Object.keys(missingStoragePaths).join(', ')}`)
  }
}

async function openLastProjectIfNeeded(options: RunAppStartupOptions): Promise<void> {
  if (!options.generalSettingsStore.openLastProject || options.router.currentRoute.value.path !== '/') {
    return
  }

  try {
    const lastGame = await db.games.orderBy('lastModified').last() as Game | undefined
    if (!lastGame || lastGame.status !== 'created') {
      return
    }

    if (lastGame.availability !== 'available') {
      logger.warn(`最近项目当前不可用，跳过自动打开: ${lastGame.path}`)
      toast.warning(options.t('home.games.openLastProjectUnavailable', { name: lastGame.metadata.name }))
      return
    }

    await options.router.push(`/edit/${lastGame.id}`)
    logger.info(`自动打开最近项目: ${lastGame.metadata.name} (${lastGame.path})`)
  } catch (error) {
    logger.error(`自动打开最近项目失败: ${error}`)
  }
}

interface StartupValidationIssue {
  count: number
  label: string
}

async function runValidation(label: string, validate: () => Promise<ResourceValidationSummary>): Promise<StartupValidationIssue | undefined> {
  try {
    const summary = await validate()
    if (summary.failed > 0) {
      return {
        count: summary.failed,
        label,
      }
    }
    return
  } catch (error) {
    logger.error(`${label}失败: ${error}`)
    return {
      count: 1,
      label,
    }
  }
}

export async function runAppStartup(options: RunAppStartupOptions): Promise<void> {
  logger.info('应用启动初始化开始')

  try {
    await initializeStoragePaths(options)
    const validationResults = await Promise.all([
      runValidation('引擎校验', () => options.engineManager.validateAllEngines()),
      runValidation('游戏校验', () => options.resourceReconcile.reconcileAllGames()),
      runValidation('模板校验', () => options.templateManager.validateAllTemplates()),
    ])
    const failedValidations = validationResults.filter((issue): issue is StartupValidationIssue => issue !== undefined)
    await openLastProjectIfNeeded(options)
    void options.appUpdateController.checkForUpdate('startup')
    if (failedValidations.length > 0) {
      const validationIssueSummary = failedValidations
        .map(({ count, label }) => `${label} ${count} 个`)
        .join('、')
      logger.info(`应用启动初始化完成，校验异常 ${failedValidations.length} 类: ${validationIssueSummary}`)
    } else {
      logger.info('应用启动初始化完成')
    }
  } catch (error) {
    logger.error(`应用启动初始化失败: ${error}`)
    throw error
  }
}
