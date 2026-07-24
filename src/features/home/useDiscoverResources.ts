import { exists, readDir } from '@tauri-apps/plugin-fs'

import { AbsPath } from '~/domain/path'
import { resolveHomeTabDefinition } from '~/features/home/home-tabs'
import { resolveHomeResourceImportNotification } from '~/features/home/shared/home-resource-import'
import { requestImportDependencyResolution } from '~/features/modals/import-dependency-resolution/request-import-dependency-resolution'
import { engineManager } from '~/services/engine-manager'
import { gameManager } from '~/services/game-manager'
import { templateManager } from '~/services/template-manager'
import { useModalStore } from '~/stores/modal'
import { useResourceStore } from '~/stores/resource'
import { useStorageSettingsStore } from '~/stores/storage-settings'
import { useWorkspaceStore } from '~/stores/workspace'

import type { DiscoveredResource } from './discovered-resource'
import type { Engine, Game, Template } from '~/database/model'
import type { HomeResourceImportOutcome } from '~/features/home/shared/home-resource-import'
import type { StaticSiteConfig } from '~/types/server'

export type { DiscoveredResource } from './discovered-resource'

async function discoverResourcesInDirectory(
  directory: string,
  validateFn: (path: AbsPath) => Promise<boolean>,
): Promise<DiscoveredResource[]> {
  try {
    if (!directory || !(await exists(directory))) {
      return []
    }

    const entries = await readDir(directory)
    const directoryPath = AbsPath.from(directory)

    const results = await Promise.all(
      entries
        .filter(entry => entry.isDirectory)
        .map(async (entry): Promise<DiscoveredResource | undefined> => {
          const fullPath = AbsPath.append(directoryPath, entry.name)
          const isValid = await validateFn(fullPath).catch(() => false)

          if (isValid) {
            return { path: fullPath, name: entry.name }
          }
        }),
    )

    return results.filter((resource): resource is DiscoveredResource => resource !== undefined)
  } catch (error) {
    logger.error(`[资源发现] 检测目录失败: ${error}`)
    return []
  }
}

async function enrichWithIcons(
  resources: DiscoveredResource[],
  resolveIconPath: (path: AbsPath) => Promise<string>,
): Promise<DiscoveredResource[]> {
  return Promise.all(
    resources.map(async (resource) => {
      try {
        const icon = await resolveIconPath(resource.path)
        return { ...resource, icon }
      } catch {
        return resource
      }
    }),
  )
}

async function discoverGames(): Promise<DiscoveredResource[]> {
  const { gameSavePath } = useStorageSettingsStore()
  if (!gameSavePath) {
    return []
  }

  const games = await discoverResourcesInDirectory(gameSavePath, gameManager.validateGame)
  return Promise.all(
    games.map(async (resource) => {
      const snapshot = await gameManager.getGameSnapshot(resource.path)
      let previewSite: StaticSiteConfig | undefined

      try {
        previewSite = await gameManager.resolvePreviewSite({ path: resource.path })
      } catch {
        previewSite = { projectPath: resource.path }
      }

      return {
        ...resource,
        name: snapshot.metadata.name,
        icon: snapshot.previewAssets.icon.path,
        previewSite,
      }
    }),
  )
}

async function discoverEngines(): Promise<DiscoveredResource[]> {
  const { engineSavePath } = useStorageSettingsStore()
  if (!engineSavePath) {
    return []
  }

  const engines = await discoverEnginesInDirectory(engineSavePath)
  return enrichWithIcons(engines, async (path) => {
    const previewAssets = await engineManager.getEnginePreviewAssets(path)
    return previewAssets.icon.path
  })
}

async function discoverTemplates(): Promise<DiscoveredResource[]> {
  const { templateSavePath } = useStorageSettingsStore()
  if (!templateSavePath) {
    return []
  }

  const templates = await discoverResourcesInDirectory(templateSavePath, templateManager.validateTemplate)
  const discoveredTemplates = await Promise.all(
    templates.map(async (template) => {
      try {
        const metadata = await templateManager.getTemplateMetadata(template.path)
        return [{
          ...template,
          name: metadata.name,
        }]
      } catch {
        return []
      }
    }),
  )
  return discoveredTemplates.flat()
}

async function discoverEngineVersion(versionPath: string, fallbackVersion: string): Promise<DiscoveredResource | undefined> {
  const normalizedVersionPath = AbsPath.from(versionPath)
  const isValid = await engineManager.validateEngine(normalizedVersionPath).catch(() => false)
  if (!isValid) {
    return
  }

  const classification = await engineManager.classifyEngine(normalizedVersionPath).catch(() => undefined)
  if (classification?.status !== 'ok') {
    return
  }

  return {
    path: normalizedVersionPath,
    name: classification.manifest.name,
    engineId: classification.manifest.id,
    version: classification.manifest.version ?? fallbackVersion,
  }
}

async function discoverEnginesInDirectory(directory: string): Promise<DiscoveredResource[]> {
  try {
    if (!directory || !(await exists(directory))) {
      return []
    }

    const entries = await readDir(directory)
    const directoryPath = AbsPath.from(directory)
    const discovered = await Promise.all(entries
      .filter(entry => entry.isDirectory)
      .map(async (entry) => {
        const namePath = AbsPath.append(directoryPath, entry.name)
        const subEntries = await readDir(namePath).catch(() => [])
        const versions = await Promise.all(subEntries
          .filter(subEntry => subEntry.isDirectory)
          .map(async (subEntry) => {
            const versionPath = AbsPath.append(namePath, subEntry.name)
            return discoverEngineVersion(versionPath, subEntry.name)
          }))

        return versions.filter((resource): resource is DiscoveredResource => !!resource)
      }))

    return discovered.flat()
  } catch (error) {
    logger.error(`[资源发现] 检测引擎目录失败: ${error}`)
    return []
  }
}

type ExistingResource = Game | Engine | Template

function isExistingEngine(resource: ExistingResource): resource is Engine {
  return 'engineId' in resource
}

function isExistingTemplate(resource: ExistingResource): resource is Template {
  return 'metadata' in resource
}

function getDiscoveredResourceKey(type: ResourceType, resource: DiscoveredResource): string {
  switch (type) {
    case 'templates': {
      return resource.name || resource.path
    }
    case 'engines': {
      return engineManager.identityKeyOf(resource)
    }
    case 'games': {
      return gameManager.identityKeyOf(resource)
    }
    default: {
      throw new Error(`未知的资源类型: ${type satisfies never}`)
    }
  }
}

function getExistingResourceKey(
  type: ResourceType,
  resource: ExistingResource,
): string {
  switch (type) {
    case 'templates': {
      return isExistingTemplate(resource)
        ? resource.metadata.name || resource.path
        : resource.path
    }
    case 'engines': {
      return isExistingEngine(resource)
        ? engineManager.identityKeyOf(resource)
        : resource.path
    }
    case 'games': {
      return gameManager.identityKeyOf(resource)
    }
    default: {
      throw new Error(`未知的资源类型: ${type satisfies never}`)
    }
  }
}

function filterAlreadyImported(
  type: ResourceType,
  discovered: DiscoveredResource[],
  existing: readonly ExistingResource[] | undefined,
): DiscoveredResource[] {
  if (!existing?.length) {
    return discovered
  }

  const existingKeys = new Set(existing.map(item => getExistingResourceKey(type, item)))
  return discovered.filter(resource => !existingKeys.has(getDiscoveredResourceKey(type, resource)))
}

type ResourceType = 'games' | 'engines' | 'templates'

function discoverByType(type: ResourceType): Promise<DiscoveredResource[]> {
  switch (type) {
    case 'games': { return discoverGames() }
    case 'engines': { return discoverEngines() }
    case 'templates': { return discoverTemplates() }
    default: { throw new Error(`未知的资源类型: ${type satisfies never}`) }
  }
}

interface ImportMessages {
  alreadyRegistered?: string
  error: string
}

function isHomeResourceImportOutcome(value: unknown): value is HomeResourceImportOutcome {
  return typeof value === 'object' && value !== null && 'alreadyRegistered' in value
}

function resolveImportMessages(type: ResourceType, t: (key: string) => string): ImportMessages {
  switch (type) {
    case 'games': {
      return {
        alreadyRegistered: t('home.games.importAlreadyExists'),
        error: t('home.games.importUnknownError'),
      }
    }
    case 'engines': {
      return {
        alreadyRegistered: t('home.engines.importAlreadyExists'),
        error: t('home.engines.importUnknownError'),
      }
    }
    case 'templates': {
      return {
        error: t('home.templates.importUnknownError'),
      }
    }
    default: { throw new Error(`未知的资源类型: ${type satisfies never}`) }
  }
}

function resolveImportFn(type: ResourceType): (path: AbsPath) => Promise<unknown> {
  switch (type) {
    case 'games': { return path => gameManager.importGame(path, { resolveDependencies: requestImportDependencyResolution }) }
    case 'engines': { return path => engineManager.importEngine(path) }
    case 'templates': { return path => templateManager.importTemplate(path) }
    default: { throw new Error(`未知的资源类型: ${type satisfies never}`) }
  }
}

// 全局状态：确保每种资源类型只检测一次
const hasChecked = {
  games: false,
  engines: false,
  templates: false,
}

export function useDiscoverResources() {
  const modalStore = useModalStore()
  const resourceStore = useResourceStore()
  const workspaceStore = useWorkspaceStore()
  const { t } = useI18n()

  function getResourcesByType(type: ResourceType) {
    switch (type) {
      case 'games': { return resourceStore.games }
      case 'engines': { return resourceStore.engines }
      case 'templates': { return resourceStore.templates }
      default: { throw new Error(`未知的资源类型: ${type satisfies never}`) }
    }
  }

  async function waitForResourcesLoaded(type: ResourceType) {
    if (getResourcesByType(type)) {
      return
    }

    await new Promise<void>((resolve) => {
      const stop = watch(
        () => getResourcesByType(type),
        (data) => {
          if (data) {
            stop()
            resolve()
          }
        },
      )
    })
  }

  async function handleImport(
    paths: AbsPath[],
    importFn: (path: AbsPath) => Promise<unknown>,
    messages: ImportMessages,
  ) {
    const results = await Promise.all(
      paths.map(async (path) => {
        try {
          const result = await importFn(path)
          const outcome = isHomeResourceImportOutcome(result) ? result : undefined
          return {
            notification: resolveHomeResourceImportNotification(undefined, outcome),
          }
        } catch (error) {
          const notification = resolveHomeResourceImportNotification(error)
          return {
            notification,
            failure: notification.kind === 'import-cancelled'
              ? undefined
              : { path, error },
          }
        }
      }),
    )
    const notifications = results.map(result => result.notification)
    const failedImports = results
      .map(result => result.failure)
      .filter((failure): failure is { path: AbsPath, error: unknown } => failure !== undefined)

    const alreadyRegisteredCount = notifications.filter(result => result.kind === 'already-registered').length
    const failCount = notifications.filter(result => result.level === 'error').length

    if (failedImports.length > 0) {
      const samplePaths = failedImports
        .slice(0, 3)
        .map(({ error, path }) => `${path} -> ${error}`)
        .join('; ')
      const remaining = Math.max(0, failedImports.length - 3)
      const suffix = failedImports.length > 3 ? ` 等 ${remaining} 个` : ''
      logger.error(
        `[资源发现] 批量导入失败: 失败 ${failedImports.length}/${paths.length}, `
        + `样例 ${samplePaths}${suffix}`,
      )
    }

    if (alreadyRegisteredCount > 0 && messages.alreadyRegistered) {
      toast.info(`${messages.alreadyRegistered} (${alreadyRegisteredCount}/${paths.length})`)
    }
    if (failCount > 0) {
      toast.error(`${messages.error} (${failCount}/${paths.length})`)
    }
  }

  async function checkAndShowDiscovered(type: ResourceType) {
    if (hasChecked[type]) {
      return
    }
    hasChecked[type] = true

    await waitForResourcesLoaded(type)

    const discovered = await discoverByType(type)
    const existing = getResourcesByType(type)
    const newResources = filterAlreadyImported(type, discovered, existing)

    if (newResources.length === 0) {
      return
    }

    const messages = resolveImportMessages(type, t)
    const importFn = resolveImportFn(type)

    modalStore.open('DiscoveredResourcesModal', {
      type,
      resources: newResources,
      onImport: paths => handleImport(paths, importFn, messages),
    })
  }

  async function checkResourcesForActiveTab() {
    const { discoveryType } = resolveHomeTabDefinition(workspaceStore.activeTab)
    await checkAndShowDiscovered(discoveryType)
  }

  return {
    checkResourcesForActiveTab,
  }
}
