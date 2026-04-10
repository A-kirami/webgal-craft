import { ArgField, EditorField } from '~/features/editor/command-registry/schema'
import { collectStatementFileChecks, resolveMissingFileKeysFromCatalog } from '~/features/editor/statement-editor/file-missing'
import { useResourceCatalog } from '~/services/resource-index/service'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'

export interface UseStatementFileMissingOptions {
  parsed: MaybeRefOrGetter<ISentence | undefined>
  contentField: MaybeRefOrGetter<EditorField | undefined>
  argFields: MaybeRefOrGetter<ArgField[]>
}

export function useStatementFileMissing(options: UseStatementFileMissingOptions) {
  const resourceCatalog = useResourceCatalog()

  const fileMissingKeys = computed(() => {
    const currentParsed = toValue(options.parsed)
    const currentContentField = toValue(options.contentField)
    const currentArgFields = toValue(options.argFields)

    if (!currentParsed || resourceCatalog.status.value !== 'ready') {
      return new Set<string>()
    }

    const checks = collectStatementFileChecks(
      currentParsed,
      currentContentField,
      currentArgFields,
    )

    return resolveMissingFileKeysFromCatalog(
      checks,
      (assetType, relativePath) => resourceCatalog.hasAsset(assetType, relativePath),
    )
  })

  return {
    fileMissingKeys,
  }
}
