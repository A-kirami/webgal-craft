import { effectScope } from 'vue'

import { useFileSystemEvents } from '~/composables/useFileSystemEvents'
import { useWorkspaceStore } from '~/stores/workspace'

import {
  addAssetPathToCatalog,
  buildAssetCatalog,
  createEmptyAssetCatalogSnapshot,
  hasAssetInCatalog,
  isPathWithinGameRoot,
  removeAssetPathFromCatalog,
  renameAssetPathInCatalog,
} from './catalog'

type ResourceCatalogStatus = 'idle' | 'building' | 'ready' | 'degraded'

const DIRECTORY_REBUILD_DEBOUNCE_MS = 200

interface ResourceCatalogState {
  status: ResourceCatalogStatus
  gamePath?: string
  snapshot: ReturnType<typeof createEmptyAssetCatalogSnapshot>
  dirty: boolean
}

const resourceCatalogState = shallowRef<ResourceCatalogState>({
  status: 'idle',
  gamePath: undefined,
  snapshot: createEmptyAssetCatalogSnapshot(),
  dirty: false,
})

let buildVersion = 0
let bootstrapConsumerCount = 0
let bootstrapScope: ReturnType<typeof effectScope> | undefined
let pendingDirectoryRebuildTimer: ReturnType<typeof setTimeout> | undefined

function setCatalogState(nextState: ResourceCatalogState): void {
  resourceCatalogState.value = nextState
}

function clearPendingDirectoryRebuild(): void {
  if (pendingDirectoryRebuildTimer) {
    clearTimeout(pendingDirectoryRebuildTimer)
    pendingDirectoryRebuildTimer = undefined
  }
}

function scheduleDirectoryRebuild(gamePath: string): void {
  clearPendingDirectoryRebuild()
  pendingDirectoryRebuildTimer = setTimeout(() => {
    pendingDirectoryRebuildTimer = undefined
    if (resourceCatalogState.value.gamePath !== gamePath) {
      return
    }
    void rebuildCatalog(gamePath)
  }, DIRECTORY_REBUILD_DEBOUNCE_MS)
}

function clearCatalogState(): void {
  buildVersion += 1
  clearPendingDirectoryRebuild()
  setCatalogState({
    status: 'idle',
    gamePath: undefined,
    snapshot: createEmptyAssetCatalogSnapshot(),
    dirty: false,
  })
}

async function rebuildCatalog(gamePath: string): Promise<void> {
  const currentBuildVersion = ++buildVersion

  setCatalogState({
    status: 'building',
    gamePath,
    snapshot: createEmptyAssetCatalogSnapshot(),
    dirty: false,
  })

  try {
    const snapshot = await buildAssetCatalog(gamePath)
    if (currentBuildVersion !== buildVersion) {
      return
    }

    const needsFollowUpRebuild = resourceCatalogState.value.gamePath === gamePath && resourceCatalogState.value.dirty

    setCatalogState({
      status: 'ready',
      gamePath,
      snapshot,
      dirty: false,
    })

    if (needsFollowUpRebuild) {
      void rebuildCatalog(gamePath)
    }
  } catch {
    if (currentBuildVersion !== buildVersion) {
      return
    }

    setCatalogState({
      status: 'degraded',
      gamePath,
      snapshot: createEmptyAssetCatalogSnapshot(),
      dirty: false,
    })
  }
}

function applyCatalogSnapshot(
  updater: (state: ResourceCatalogState) => ReturnType<typeof createEmptyAssetCatalogSnapshot>,
): void {
  const currentState = resourceCatalogState.value
  if (!currentState.gamePath) {
    return
  }
  if (currentState.status !== 'ready') {
    if (currentState.status === 'building') {
      currentState.dirty = true
    }
    return
  }

  setCatalogState({
    status: currentState.status,
    gamePath: currentState.gamePath,
    snapshot: updater(currentState),
    dirty: currentState.dirty,
  })
}

function bindResourceCatalogBootstrap(): void {
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
          clearCatalogState()
          return
        }
        void rebuildCatalog(gamePath)
      },
      { immediate: true },
    )

    fileSystemEvents.on('file:created', (event) => {
      const gamePath = resourceCatalogState.value.gamePath
      if (!gamePath || !isPathWithinGameRoot(gamePath, event.path)) {
        return
      }

      applyCatalogSnapshot(state => addAssetPathToCatalog(state.snapshot, gamePath, event.path))
    })

    fileSystemEvents.on('file:removed', (event) => {
      const gamePath = resourceCatalogState.value.gamePath
      if (!gamePath || !isPathWithinGameRoot(gamePath, event.path)) {
        return
      }

      applyCatalogSnapshot(state => removeAssetPathFromCatalog(state.snapshot, gamePath, event.path))
    })

    fileSystemEvents.on('file:renamed', (event) => {
      const gamePath = resourceCatalogState.value.gamePath
      if (!gamePath) {
        return
      }
      if (!isPathWithinGameRoot(gamePath, event.oldPath) && !isPathWithinGameRoot(gamePath, event.newPath)) {
        return
      }

      applyCatalogSnapshot(state => renameAssetPathInCatalog(
        state.snapshot,
        gamePath,
        event.oldPath,
        event.newPath,
      ))
    })

    const rebuildOnDirectoryChange = (path: string) => {
      const gamePath = resourceCatalogState.value.gamePath
      if (!gamePath || !isPathWithinGameRoot(gamePath, path)) {
        return
      }
      scheduleDirectoryRebuild(gamePath)
    }

    fileSystemEvents.on('directory:created', event => rebuildOnDirectoryChange(event.path))
    fileSystemEvents.on('directory:removed', event => rebuildOnDirectoryChange(event.path))
    fileSystemEvents.on('directory:renamed', (event) => {
      const { gamePath } = resourceCatalogState.value
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

function releaseResourceCatalogBootstrap(): void {
  bootstrapConsumerCount = Math.max(0, bootstrapConsumerCount - 1)
  if (bootstrapConsumerCount > 0) {
    return
  }

  clearPendingDirectoryRebuild()
  bootstrapScope?.stop()
  bootstrapScope = undefined
}

export function useResourceCatalogBootstrap() {
  bindResourceCatalogBootstrap()

  onScopeDispose(() => {
    releaseResourceCatalogBootstrap()
  })
}

export function useResourceCatalog() {
  return {
    status: computed(() => resourceCatalogState.value.status),
    hasAsset(assetType: string, relativePath: string): boolean {
      return hasAssetInCatalog(resourceCatalogState.value.snapshot, assetType, relativePath)
    },
  }
}
