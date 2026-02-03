import { join } from '@tauri-apps/api/path'
import { exists, readDir } from '@tauri-apps/plugin-fs'

interface DiscoveredResource {
  path: string
  name: string
  icon?: string
}

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

async function enrichWithIcons<T extends DiscoveredResource>(
  resources: T[],
  getMetadata: (path: string) => Promise<{ icon: string }>,
): Promise<T[]> {
  return Promise.all(
    resources.map(async (resource) => {
      try {
        const metadata = await getMetadata(resource.path)
        return { ...resource, icon: metadata.icon }
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
  return enrichWithIcons(games, gameManager.getGameMetadata)
}

async function discoverEngines(): Promise<DiscoveredResource[]> {
  const { engineSavePath } = useStorageSettingsStore()
  if (!engineSavePath) {
    return []
  }

  const engines = await discoverResourcesInDirectory(engineSavePath, engineManager.validateEngine)
  return enrichWithIcons(engines, engineManager.getEngineMetadata)
}

function filterAlreadyImported<T extends { path: string }>(
  discovered: DiscoveredResource[],
  existing: T[] | undefined,
): DiscoveredResource[] {
  if (!existing?.length) {
    return discovered
  }

  const existingPaths = new Set(existing.map(item => item.path))
  return discovered.filter(resource => !existingPaths.has(resource.path))
}

const hasChecked = {
  games: false,
  engines: false,
}

type ResourceType = 'games' | 'engines'

export function useDiscoverResources() {
  const modalStore = useModalStore()
  const resourceStore = useResourceStore()
  const workspaceStore = useWorkspaceStore()
  const { t } = useI18n()

  async function waitForResourcesLoaded(type: ResourceType) {
    const resources = type === 'games' ? resourceStore.games : resourceStore.engines

    if (resources) {
      return
    }

    await new Promise<void>((resolve) => {
      const stop = watch(
        () => (type === 'games' ? resourceStore.games : resourceStore.engines),
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
    importFn: (path: string) => Promise<void>,
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

    const discovered = type === 'games' ? await discoverGames() : await discoverEngines()
    const existing = type === 'games' ? resourceStore.games : resourceStore.engines
    const newResources = filterAlreadyImported(discovered, existing as { path: string }[] | undefined)

    if (newResources.length === 0) {
      return
    }

    const isGames = type === 'games'
    const successMsg = isGames ? t('home.games.importSuccess') : t('home.engines.importSuccess')
    const errorMsg = isGames ? t('home.games.importUnknownError') : t('home.engines.importUnknownError')

    const importFn = isGames
      ? async (path: string) => {
        await gameManager.importGame(path)
      }
      : engineManager.importEngine

    modalStore.open('DiscoveredResourcesModal', {
      type,
      resources: newResources,
      onImport: (paths: string[]) => handleImport(paths, importFn, successMsg, errorMsg),
    })
  }

  async function checkResourcesForActiveTab() {
    const type = workspaceStore.activeTab === 'recent' ? 'games' : 'engines'
    await checkAndShowDiscovered(type)
  }

  return {
    checkAndShowDiscoveredGames: () => checkAndShowDiscovered('games'),
    checkAndShowDiscoveredEngines: () => checkAndShowDiscovered('engines'),
    checkResourcesForActiveTab,
  }
}
