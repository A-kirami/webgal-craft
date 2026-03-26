import { join } from '@tauri-apps/api/path'

import { ArgField, EditorField } from '~/features/editor/command-registry/schema'
import { createStatementMissingFileLoader } from '~/features/editor/statement-editor/file-missing'
import { gameAssetDir, gameSceneDir } from '~/services/platform/app-paths'
import { useWorkspaceStore } from '~/stores/workspace'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'

export interface UseStatementFileMissingOptions {
  parsed: MaybeRefOrGetter<ISentence | undefined>
  contentField: MaybeRefOrGetter<EditorField | undefined>
  argFields: MaybeRefOrGetter<ArgField[]>
}

export function useStatementFileMissing(options: UseStatementFileMissingOptions) {
  const workspaceStore = useWorkspaceStore()

  const fileMissingKeys = ref(new Set<string>())
  const loadMissingFileKeys = createStatementMissingFileLoader({
    gameAssetDir,
    gameSceneDir,
    joinPath: join,
  })

  watchDebounced(
    () => [toValue(options.parsed), toValue(options.contentField), toValue(options.argFields), workspaceStore.CWD] as const,
    async ([currentParsed, currentContentField, currentArgFields, cwd], _, onCleanup) => {
      let cancelled = false
      onCleanup(() => {
        cancelled = true
      })

      const nextMissingKeys = await loadMissingFileKeys({
        parsed: currentParsed,
        contentField: currentContentField,
        argFields: currentArgFields,
        cwd,
      })
      if (cancelled || !nextMissingKeys) {
        return
      }
      fileMissingKeys.value = nextMissingKeys
    },
    { immediate: true, debounce: 150 },
  )

  return {
    fileMissingKeys,
  }
}
