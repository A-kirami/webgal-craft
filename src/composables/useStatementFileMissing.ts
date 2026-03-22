import { join } from '@tauri-apps/api/path'

import { gameAssetDir, gameSceneDir } from '~/helper/app-paths'
import { ArgField, EditorField } from '~/helper/command-registry/schema'
import { createStatementMissingFileLoader } from '~/helper/statement-editor/file-missing'
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
