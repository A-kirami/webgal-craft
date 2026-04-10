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

interface ResourceCatalogState {
  status: ResourceCatalogStatus
  gamePath?: string
  snapshot: ReturnType<typeof createEmptyAssetCatalogSnapshot>
}

const resourceCatalogState = shallowRef<ResourceCatalogState>({
  status: 'idle',
  gamePath: undefined,
  snapshot: createEmptyAssetCatalogSnapshot(),
})

let buildVersion = 0
let bootstrapConsumerCount = 0
let bootstrapScope: ReturnType<typeof effectScope> | undefined

function setCatalogState(nextState: Omit<ResourceCatalogState, 'version'>): void {
  resourceCatalogState.value = nextState
}

function clearCatalogState(): void {
  buildVersion += 1
  setCatalogState({
    status: 'idle',
    gamePath: undefined,
    snapshot: createEmptyAssetCatalogSnapshot(),
  })
}

async function rebuildCatalog(gamePath: string): Promise<void> {
  const currentBuildVersion = ++buildVersion

  setCatalogState({
    status: 'building',
    gamePath,
    snapshot: createEmptyAssetCatalogSnapshot(),
  })

  try {
    const snapshot = await buildAssetCatalog(gamePath)
    if (currentBuildVersion !== buildVersion) {
      return
    }

    setCatalogState({
      status: 'ready',
      gamePath,
      snapshot,
    })
  } catch {
    if (currentBuildVersion !== buildVersion) {
      return
    }

    setCatalogState({
      status: 'degraded',
      gamePath,
      snapshot: createEmptyAssetCatalogSnapshot(),
    })
  }
}

function applyCatalogSnapshot(
  updater: (state: ResourceCatalogState) => ReturnType<typeof createEmptyAssetCatalogSnapshot>,
): void {
  const currentState = resourceCatalogState.value
  if (!currentState.gamePath || currentState.status === 'building') {
    return
  }

  setCatalogState({
    status: currentState.status,
    gamePath: currentState.gamePath,
    snapshot: updater(currentState),
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
      void rebuildCatalog(gamePath)
    }

    fileSystemEvents.on('directory:created', event => rebuildOnDirectoryChange(event.path))
    fileSystemEvents.on('directory:removed', event => rebuildOnDirectoryChange(event.path))
    fileSystemEvents.on('directory:renamed', (event) => {
      rebuildOnDirectoryChange(event.oldPath)
      rebuildOnDirectoryChange(event.newPath)
    })
  })
}

function releaseResourceCatalogBootstrap(): void {
  bootstrapConsumerCount = Math.max(0, bootstrapConsumerCount - 1)
  if (bootstrapConsumerCount > 0) {
    return
  }

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
