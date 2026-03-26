import { EditorField } from '~/features/editor/command-registry/schema'
import { gameAssetDir } from '~/services/platform/app-paths'
import { useWorkspaceStore } from '~/stores/workspace'

export interface UseStatementFileRootsOptions {
  editorFields: MaybeRefOrGetter<EditorField[]>
}

export function useStatementFileRoots(options: UseStatementFileRootsOptions) {
  const workspaceStore = useWorkspaceStore()

  const fileRootPaths = ref<Record<string, string>>({})

  watch(
    () => [workspaceStore.CWD, toValue(options.editorFields)] as const,
    async ([cwd, fields], _, onCleanup) => {
      let cancelled = false
      onCleanup(() => {
        cancelled = true
      })

      if (!cwd) {
        fileRootPaths.value = {}
        return
      }

      const types = new Set<string>()
      for (const editorField of fields) {
        if (editorField.field.type === 'file') {
          types.add(editorField.field.fileConfig.assetType)
        }
      }

      if (types.size === 0) {
        fileRootPaths.value = {}
        return
      }

      const entries = await Promise.all(
        [...types].map(async (assetType) => {
          return [assetType, await gameAssetDir(cwd, assetType)] as const
        }),
      )

      if (cancelled) {
        return
      }
      fileRootPaths.value = Object.fromEntries(entries)
    },
    { immediate: true },
  )

  return {
    fileRootPaths,
  }
}
