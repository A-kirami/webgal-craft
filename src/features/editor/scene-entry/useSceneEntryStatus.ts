import { createGlobalState } from '@vueuse/core'

import { useFileSystemEvents } from '~/composables/useFileSystemEvents'
import { AbsPath } from '~/domain/path'
import { resolveSceneEntryStatus } from '~/domain/scene/entry-point'
import { gameSceneDir } from '~/services/platform/app-paths'
import { toLookupPathKey } from '~/services/resource-path/lookup'
import { useFileStore } from '~/stores/file'
import { useWorkspaceStore } from '~/stores/workspace'

import type { SceneEntryStatus } from '~/domain/scene/entry-point'

function isPathWithin(path: AbsPath, root: AbsPath): boolean {
  const pathKey = toLookupPathKey(path)
  const rootKey = toLookupPathKey(root)
  return pathKey === rootKey || pathKey.startsWith(`${rootKey}/`)
}

export const useSceneEntryStatus = createGlobalState(() => {
  const fileStore = useFileStore()
  const workspaceStore = useWorkspaceStore()
  const fileSystemEvents = useFileSystemEvents()

  const sceneRoot = computed(() => {
    const gamePath = workspaceStore.currentGame?.path
    return gamePath ? gameSceneDir(AbsPath.from(gamePath)) : undefined
  })
  const status = ref<SceneEntryStatus>('checking')
  let refreshToken = 0

  async function refresh(): Promise<void> {
    const currentRoot = sceneRoot.value
    const token = ++refreshToken
    if (!currentRoot) {
      status.value = 'checking'
      return
    }

    status.value = 'checking'

    try {
      await fileStore.initialized
      const entries = await fileStore.getFolderContents(currentRoot)
      if (token !== refreshToken || sceneRoot.value !== currentRoot) {
        return
      }

      status.value = resolveSceneEntryStatus(
        entries.filter(entry => !entry.isDir).map(entry => entry.name),
      )
    } catch (error) {
      if (token !== refreshToken) {
        return
      }
      logger.warn(`[SceneEntry] 检查入口文件失败: ${error}`)
      status.value = 'checking'
    }
  }

  watch(sceneRoot, () => {
    void refresh()
  }, { immediate: true })

  const eventTypes = [
    'file:created',
    'file:removed',
    'file:renamed',
    'directory:created',
    'directory:removed',
    'directory:renamed',
  ] as const

  const stops = eventTypes.map(type => fileSystemEvents.on(type, (event) => {
    const root = sceneRoot.value
    if (!root) {
      return
    }

    const paths = 'oldPath' in event
      ? [event.oldPath, event.newPath]
      : [event.path]
    if (paths.some(path => isPathWithin(path, root))) {
      void refresh()
    }
  }))

  tryOnScopeDispose(() => {
    for (const stop of stops) {
      stop()
    }
  })

  return {
    status: readonly(status),
  }
})
