import { useFileSystemEvents } from '~/composables/useFileSystemEvents'
import { AbsPath } from '~/domain/path'
import { gameConfigPath, gameSceneDir } from '~/services/platform/app-paths'
import { useWorkspaceStore } from '~/stores/workspace'

import {
  addAssetPathToCatalog,
  buildAssetCatalog,
  createEmptyAssetCatalogSnapshot,
  hasAssetInCatalog,
  isPathWithinGameRoot,
  listAssetsByAssetType,
  removeAssetPathFromCatalog,
  renameAssetPathInCatalog,
  resolveAssetByAbsolutePath,
} from './catalog'
import {
  buildAssetReferenceIndex,
  createEmptyAssetReferenceIndexSnapshot,
  findMissingAssetReferences,
  getReferencesFromSource,
  getReferencesToAsset,
  rebuildReferenceSource,
  removeReferenceSource,
  renameReferenceSource,
} from './references'

import type { AssetCatalogSnapshot } from './catalog'
import type { AssetKey } from './keys'
import type { AssetReferenceIndexSnapshot, AssetReferenceRecord } from './references'

type ResourceIndexStatus = 'idle' | 'building' | 'ready' | 'degraded'

const DIRECTORY_REBUILD_DEBOUNCE_MS = 200

interface ResourceIndexState {
  status: ResourceIndexStatus
  gamePath?: AbsPath
  catalog: AssetCatalogSnapshot
  references: AssetReferenceIndexSnapshot
  dirty: boolean
}

const resourceIndexState = shallowRef<ResourceIndexState>({
  status: 'idle',
  gamePath: undefined,
  catalog: createEmptyAssetCatalogSnapshot(),
  references: createEmptyAssetReferenceIndexSnapshot(),
  dirty: false,
})

let buildVersion = 0
let bootstrapConsumerCount = 0
let bootstrapScope: ReturnType<typeof effectScope> | undefined
let pendingDirectoryRebuildTimer: ReturnType<typeof setTimeout> | undefined
let referenceSourceUpdateVersion = 0
const referenceSourceUpdateVersions = new Map<AbsPath, number>()

function setResourceIndexState(nextState: ResourceIndexState): void {
  resourceIndexState.value = nextState
}

function clearPendingDirectoryRebuild(): void {
  if (pendingDirectoryRebuildTimer) {
    clearTimeout(pendingDirectoryRebuildTimer)
    pendingDirectoryRebuildTimer = undefined
  }
}

function scheduleDirectoryRebuild(gamePath: AbsPath): void {
  clearPendingDirectoryRebuild()
  pendingDirectoryRebuildTimer = setTimeout(() => {
    pendingDirectoryRebuildTimer = undefined
    if (resourceIndexState.value.gamePath !== gamePath) {
      return
    }
    void rebuildResourceIndex(gamePath)
  }, DIRECTORY_REBUILD_DEBOUNCE_MS)
}

function clearResourceIndexState(): void {
  buildVersion += 1
  referenceSourceUpdateVersions.clear()
  clearPendingDirectoryRebuild()
  setResourceIndexState({
    status: 'idle',
    gamePath: undefined,
    catalog: createEmptyAssetCatalogSnapshot(),
    references: createEmptyAssetReferenceIndexSnapshot(),
    dirty: false,
  })
}

async function rebuildResourceIndex(gamePath: AbsPath): Promise<void> {
  const currentBuildVersion = ++buildVersion
  referenceSourceUpdateVersions.clear()

  setResourceIndexState({
    status: 'building',
    gamePath,
    catalog: createEmptyAssetCatalogSnapshot(),
    references: createEmptyAssetReferenceIndexSnapshot(),
    dirty: false,
  })

  try {
    const catalog = await buildAssetCatalog(gamePath)
    const references = await buildAssetReferenceIndex(gamePath, catalog)
    if (currentBuildVersion !== buildVersion) {
      return
    }

    const needsFollowUpRebuild = resourceIndexState.value.gamePath === gamePath && resourceIndexState.value.dirty

    setResourceIndexState({
      status: 'ready',
      gamePath,
      catalog,
      references,
      dirty: false,
    })

    if (needsFollowUpRebuild) {
      void rebuildResourceIndex(gamePath)
    }
  } catch (error) {
    logger.warn(`资源索引构建失败: ${error}`)
    if (currentBuildVersion !== buildVersion) {
      return
    }

    setResourceIndexState({
      status: 'degraded',
      gamePath,
      catalog: createEmptyAssetCatalogSnapshot(),
      references: createEmptyAssetReferenceIndexSnapshot(),
      dirty: false,
    })
  }
}

function markBuildingStateDirty(state: ResourceIndexState): void {
  if (resourceIndexState.value !== state || state.status !== 'building' || state.dirty) {
    return
  }

  setResourceIndexState({
    ...state,
    dirty: true,
  })
}

function shouldDeferPathUpdate(state: ResourceIndexState, gamePath: AbsPath): boolean {
  if (state.gamePath !== gamePath) {
    return true
  }
  if (state.status === 'building') {
    markBuildingStateDirty(state)
    return true
  }
  return state.status !== 'ready'
}

function applyReadyResourceIndexState(
  updater: (state: ResourceIndexState) => Pick<ResourceIndexState, 'catalog' | 'references'>,
): void {
  const currentState = resourceIndexState.value
  if (!currentState.gamePath) {
    return
  }
  if (currentState.status !== 'ready') {
    if (currentState.status === 'building') {
      markBuildingStateDirty(currentState)
    }
    return
  }

  const { catalog, references } = updater(currentState)
  setResourceIndexState({
    status: currentState.status,
    gamePath: currentState.gamePath,
    catalog,
    references,
    dirty: currentState.dirty,
  })
}

async function rebuildReferenceForPath(gamePath: AbsPath, path: AbsPath): Promise<void> {
  const currentState = resourceIndexState.value
  if (shouldDeferPathUpdate(currentState, gamePath)) {
    return
  }
  if (path !== gameConfigPath(gamePath) && !(path.startsWith(`${gameSceneDir(gamePath)}/`) && path.endsWith('.txt'))) {
    return
  }

  const updateVersion = beginReferenceSourceUpdate([path])
  const references = await rebuildReferenceSource(currentState.references, gamePath, path)
  applyReferenceSourceUpdate(gamePath, [path], path, getReferencesFromSource(references, path), updateVersion)
}

function beginReferenceSourceUpdate(sourcePaths: AbsPath[]): number {
  const updateVersion = ++referenceSourceUpdateVersion
  for (const sourcePath of sourcePaths) {
    referenceSourceUpdateVersions.set(sourcePath, updateVersion)
  }
  return updateVersion
}

function isReferenceSourceUpdateCurrent(sourcePaths: AbsPath[], updateVersion: number): boolean {
  return sourcePaths.every(sourcePath => referenceSourceUpdateVersions.get(sourcePath) === updateVersion)
}

function clearReferenceSourceUpdate(sourcePaths: AbsPath[], updateVersion: number): void {
  for (const sourcePath of sourcePaths) {
    if (referenceSourceUpdateVersions.get(sourcePath) === updateVersion) {
      referenceSourceUpdateVersions.delete(sourcePath)
    }
  }
}

function cancelReferenceSourceUpdates(sourcePaths: AbsPath[]): void {
  const cancellationVersion = ++referenceSourceUpdateVersion
  for (const sourcePath of sourcePaths) {
    referenceSourceUpdateVersions.set(sourcePath, cancellationVersion)
    referenceSourceUpdateVersions.delete(sourcePath)
  }
}

function replaceReferenceRecords(
  snapshot: AssetReferenceIndexSnapshot,
  removedSourcePaths: AbsPath[],
  sourcePath: AbsPath,
  records: AssetReferenceRecord[],
): AssetReferenceIndexSnapshot {
  const removedSourcePathSet = new Set<AbsPath>(removedSourcePaths)
  return {
    records: [
      ...snapshot.records.filter(record => !removedSourcePathSet.has(record.sourcePath)),
      ...records.filter(record => record.sourcePath === sourcePath),
    ],
  }
}

function applyReferenceSourceUpdate(
  gamePath: AbsPath,
  removedSourcePaths: AbsPath[],
  sourcePath: AbsPath,
  records: AssetReferenceRecord[],
  updateVersion: number,
): void {
  const currentState = resourceIndexState.value
  if (currentState.gamePath !== gamePath || currentState.status !== 'ready') {
    return
  }
  if (!isReferenceSourceUpdateCurrent(removedSourcePaths, updateVersion)) {
    return
  }

  setResourceIndexState({
    ...currentState,
    references: replaceReferenceRecords(
      currentState.references,
      removedSourcePaths,
      sourcePath,
      records,
    ),
  })
  clearReferenceSourceUpdate(removedSourcePaths, updateVersion)
}

async function renameReferenceForPath(gamePath: AbsPath, oldPath: AbsPath, newPath: AbsPath): Promise<void> {
  const currentState = resourceIndexState.value
  if (shouldDeferPathUpdate(currentState, gamePath)) {
    return
  }

  const affectedSourcePaths = [oldPath, newPath]
  const updateVersion = beginReferenceSourceUpdate(affectedSourcePaths)
  const references = await renameReferenceSource(currentState.references, gamePath, oldPath, newPath)
  applyReferenceSourceUpdate(
    gamePath,
    affectedSourcePaths,
    newPath,
    getReferencesFromSource(references, newPath),
    updateVersion,
  )
}

function bindResourceIndexBootstrap(): void {
  bootstrapConsumerCount += 1
  if (bootstrapScope) {
    return
  }

  bootstrapScope = effectScope()
  bootstrapScope.run(() => {
    const workspaceStore = useWorkspaceStore()
    const fileSystemEvents = useFileSystemEvents()

    watch(
      () => workspaceStore.CWD,
      (gamePath) => {
        if (!gamePath) {
          clearResourceIndexState()
          return
        }
        void rebuildResourceIndex(AbsPath.from(gamePath))
      },
      { immediate: true },
    )

    fileSystemEvents.on('file:created', (event) => {
      const gamePath = resourceIndexState.value.gamePath
      if (!gamePath || !isPathWithinGameRoot(gamePath, event.path)) {
        return
      }

      applyReadyResourceIndexState(state => ({
        catalog: addAssetPathToCatalog(state.catalog, gamePath, event.path),
        references: state.references,
      }))
      void rebuildReferenceForPath(gamePath, event.path)
    })

    fileSystemEvents.on('file:removed', (event) => {
      const gamePath = resourceIndexState.value.gamePath
      if (!gamePath || !isPathWithinGameRoot(gamePath, event.path)) {
        return
      }

      applyReadyResourceIndexState(state => ({
        catalog: removeAssetPathFromCatalog(state.catalog, gamePath, event.path),
        references: removeReferenceSource(state.references, event.path),
      }))
      cancelReferenceSourceUpdates([event.path])
    })

    fileSystemEvents.on('file:renamed', (event) => {
      const gamePath = resourceIndexState.value.gamePath
      if (!gamePath) {
        return
      }

      if (!isPathWithinGameRoot(gamePath, event.oldPath) && !isPathWithinGameRoot(gamePath, event.newPath)) {
        return
      }

      applyReadyResourceIndexState(state => ({
        catalog: renameAssetPathInCatalog(
          state.catalog,
          gamePath,
          event.oldPath,
          event.newPath,
        ),
        references: state.references,
      }))
      void renameReferenceForPath(gamePath, event.oldPath, event.newPath)
    })

    const rebuildReferenceOnFileChange = (path: AbsPath) => {
      const gamePath = resourceIndexState.value.gamePath
      if (!gamePath || !isPathWithinGameRoot(gamePath, path)) {
        return
      }

      void rebuildReferenceForPath(gamePath, path)
    }

    fileSystemEvents.on('file:modified', event => rebuildReferenceOnFileChange(event.path))
    fileSystemEvents.on('file:written', event => rebuildReferenceOnFileChange(event.path))

    const rebuildOnDirectoryChange = (path: AbsPath) => {
      const gamePath = resourceIndexState.value.gamePath
      if (!gamePath) {
        return
      }

      if (!isPathWithinGameRoot(gamePath, path)) {
        return
      }
      scheduleDirectoryRebuild(gamePath)
    }

    fileSystemEvents.on('directory:created', event => rebuildOnDirectoryChange(event.path))
    fileSystemEvents.on('directory:removed', event => rebuildOnDirectoryChange(event.path))
    fileSystemEvents.on('directory:renamed', (event) => {
      const { gamePath } = resourceIndexState.value
      if (!gamePath) {
        return
      }

      if (!isPathWithinGameRoot(gamePath, event.oldPath) && !isPathWithinGameRoot(gamePath, event.newPath)) {
        return
      }
      scheduleDirectoryRebuild(gamePath)
    })
  })
}

function releaseResourceIndexBootstrap(): void {
  bootstrapConsumerCount = Math.max(0, bootstrapConsumerCount - 1)
  if (bootstrapConsumerCount > 0) {
    return
  }

  clearPendingDirectoryRebuild()
  bootstrapScope?.stop()
  bootstrapScope = undefined
}

export function useResourceIndexBootstrap() {
  bindResourceIndexBootstrap()

  onScopeDispose(() => {
    releaseResourceIndexBootstrap()
  })
}

export function useResourceIndex() {
  return {
    status: computed(() => resourceIndexState.value.status),
    hasAssetKey(key: AssetKey): boolean {
      return hasAssetInCatalog(resourceIndexState.value.catalog, key)
    },
    resolveByAbsolutePath(path: AbsPath) {
      return resolveAssetByAbsolutePath(resourceIndexState.value.catalog, path)
    },
    listByAssetType(assetType: string) {
      return listAssetsByAssetType(resourceIndexState.value.catalog, assetType)
    },
    getReferencesTo(key: AssetKey) {
      return getReferencesToAsset(resourceIndexState.value.references, key)
    },
    getReferencesFrom(sourcePath: AbsPath) {
      return getReferencesFromSource(resourceIndexState.value.references, sourcePath)
    },
    findMissingReferences() {
      return findMissingAssetReferences(
        resourceIndexState.value.references,
        resourceIndexState.value.catalog,
      )
    },
  }
}
