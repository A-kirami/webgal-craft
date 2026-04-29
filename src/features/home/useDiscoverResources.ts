import { join } from '@tauri-apps/api/path'
import { exists, readDir } from '@tauri-apps/plugin-fs'

import { resolveHomeTabDefinition } from '~/features/home/home-tabs'
import { requestEngineSelection } from '~/features/modals/engine-selection/request-engine-selection'
import { engineManager } from '~/services/engine-manager'
import { gameManager } from '~/services/game-manager'
import { templateManager } from '~/services/template-manager'
import { useModalStore } from '~/stores/modal'
import { useResourceStore } from '~/stores/resource'
import { useStorageSettingsStore } from '~/stores/storage-settings'
import { useWorkspaceStore } from '~/stores/workspace'

import type { DiscoveredResource } from './discovered-resource'
import type { StaticSiteConfig } from '~/types/server'

export type { DiscoveredResource } from './discovered-resource'

async function discoverResourcesInDirectory(
  directory: string,
  validateFn: (path: string) => Promise<boolean>,
): Promise<DiscoveredResource[]> {
  try {
    if (!directory || !(await exists(directory))) {
      return []
    }

    const entries = await readDir(directory)

    const results = await Promise.all(
      entries
        .filter(entry => entry.isDirectory)
        .map(async (entry) => {
          const fullPath = await join(directory, entry.name)
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
  resolveIconPath: (path: string) => Promise<string>,
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
      const previewAssets = await gameManager.getGamePreviewAssets(resource.path)
      let previewSite: StaticSiteConfig | undefined

      try {
        previewSite = await gameManager.resolvePreviewSite({ path: resource.path })
      } catch {
        previewSite = { projectPath: resource.path }
      }

      return {
        ...resource,
        icon: previewAssets.icon.path,
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
  return Promise.all(
    templates.map(async (template) => {
      try {
        const metadata = await templateManager.getTemplateMetadata(template.path)
        return {
          ...template,
          name: metadata.name,
        }
      } catch {
        return template
      }
    }),
  )
}

async function discoverEngineVersion(versionPath: string, fallbackVersion: string): Promise<DiscoveredResource | undefined> {
  const isValid = await engineManager.validateEngine(versionPath).catch(() => false)
  if (!isValid) {
    return
  }

  const classification = await engineManager.classifyEngine(versionPath).catch(() => undefined)
  if (classification?.status !== 'ok') {
    return
  }

  return {
    path: versionPath,
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
    const discovered = await Promise.all(entries
      .filter(entry => entry.isDirectory)
      .map(async (entry) => {
        const namePath = await join(directory, entry.name)
        const subEntries = await readDir(namePath).catch(() => [])
        const versions = await Promise.all(subEntries
          .filter(subEntry => subEntry.isDirectory)
          .map(async (subEntry) => {
            const versionPath = await join(namePath, subEntry.name)
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

function filterAlreadyImported(
  discovered: DiscoveredResource[],
  existing: readonly { path: string }[] | undefined,
): DiscoveredResource[] {
  if (!existing?.length) {
    return discovered
  }

  const existingPaths = new Set(existing.map(item => item.path))
  return discovered.filter(resource => !existingPaths.has(resource.path))
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
  success: string
  error: string
}

function resolveImportMessages(type: ResourceType, t: (key: string) => string): ImportMessages {
  switch (type) {
    case 'games': {
      return {
        success: t('home.games.importSuccess'),
        error: t('home.games.importUnknownError'),
      }
    }
    case 'engines': {
      return {
        success: t('home.engines.importSuccess'),
        error: t('home.engines.importUnknownError'),
      }
    }
    case 'templates': {
      return {
        success: t('home.templates.importSuccess'),
        error: t('home.templates.importUnknownError'),
      }
    }
    default: { throw new Error(`未知的资源类型: ${type satisfies never}`) }
  }
}

function resolveImportFn(type: ResourceType): (path: string) => Promise<unknown> {
  switch (type) {
    case 'games': { return path => gameManager.importGame(path, { selectEngine: requestEngineSelection }) }
    case 'engines': { return engineManager.importEngine }
    case 'templates': { return templateManager.importTemplate }
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
    paths: string[],
    importFn: (path: string) => Promise<unknown>,
    successMsg: string,
    errorMsg: string,
  ) {
    const results = await Promise.all(
      paths.map(async (path) => {
        try {
          await importFn(path)
          return true
        } catch (error) {
          logger.error(`[资源发现] 导入失败: ${path} - ${error}`)
          return false
        }
      }),
    )

    const successCount = results.filter(Boolean).length
    const failCount = results.length - successCount

    if (successCount > 0) {
      notify.success(`${successMsg} (${successCount}/${paths.length})`)
    }
    if (failCount > 0) {
      notify.error(`${errorMsg} (${failCount}/${paths.length})`)
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
    const newResources = filterAlreadyImported(discovered, existing)

    if (newResources.length === 0) {
      return
    }

    const messages = resolveImportMessages(type, t)
    const importFn = resolveImportFn(type)

    modalStore.open('DiscoveredResourcesModal', {
      type,
      resources: newResources,
      onImport: (paths: string[]) => handleImport(paths, importFn, messages.success, messages.error),
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
