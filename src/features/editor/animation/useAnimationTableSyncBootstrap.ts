import { useFileSystemEvents } from '~/composables/useFileSystemEvents'
import { isAnimationTableRelatedPath, syncAnimationTable } from '~/services/animation-table-sync'
import { useWorkspaceStore } from '~/stores/workspace'

const ANIMATION_TABLE_SYNC_DELAY_MS = 80

let hasBootstrapped = false
let syncTimer: ReturnType<typeof setTimeout> | undefined

function clearScheduledSync(): void {
  if (!syncTimer) {
    return
  }

  clearTimeout(syncTimer)
  syncTimer = undefined
}

function scheduleSync(gamePath: string): void {
  clearScheduledSync()

  syncTimer = setTimeout(() => {
    syncTimer = undefined
    void syncAnimationTable(gamePath).catch((error) => {
      logger.error(`同步 animationTable.json 失败: ${error}`)
    })
  }, ANIMATION_TABLE_SYNC_DELAY_MS)
}

export function useAnimationTableSyncBootstrap() {
  if (hasBootstrapped) {
    return
  }
  hasBootstrapped = true

  const fileSystemEvents = useFileSystemEvents()
  const workspaceStore = useWorkspaceStore()

  function handlePathChange(path: string) {
    const gamePath = workspaceStore.CWD
    if (!gamePath || !isAnimationTableRelatedPath(gamePath, path)) {
      return
    }

    scheduleSync(gamePath)
  }

  const singlePathEvents = [
    'file:created',
    'file:removed',
    'directory:created',
    'directory:removed',
  ] as const

  for (const event of singlePathEvents) {
    fileSystemEvents.on(event, e => handlePathChange(e.path))
  }

  const renamedEvents = ['file:renamed', 'directory:renamed'] as const
  for (const event of renamedEvents) {
    fileSystemEvents.on(event, (e) => {
      handlePathChange(e.oldPath)
      handlePathChange(e.newPath)
    })
  }

  watch(() => workspaceStore.CWD, (gamePath) => {
    if (!gamePath) {
      return
    }

    scheduleSync(gamePath)
  }, { immediate: true })

  onScopeDispose(() => {
    clearScheduledSync()
    hasBootstrapped = false
  })
}
