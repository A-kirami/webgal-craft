import { ArgField, EditorField, readArgFieldStorageKey } from '~/features/editor/command-registry/schema'
import { createReferencedAssetKey, shouldIndexAssetReferenceValue } from '~/services/resource-index/values'

import type { arg, ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { AssetKey } from '~/services/resource-index/keys'

export interface StatementFileCheckItem {
  key: string
  assetType: string
  value: string
}

export function collectStatementFileChecks(
  parsed: ISentence,
  contentField: EditorField | undefined,
  argFields: ArgField[],
): StatementFileCheckItem[] {
  const checks: StatementFileCheckItem[] = []

  const contentFileConfig = contentField?.field.type === 'file'
    ? contentField.field.fileConfig
    : undefined
  if (contentFileConfig && shouldIndexAssetReferenceValue(contentFileConfig.assetType, parsed.content)) {
    checks.push({
      key: '__content__',
      assetType: contentFileConfig.assetType,
      value: parsed.content,
    })
  }

  for (const argField of argFields) {
    if (argField.jsonMeta || argField.field.type !== 'file') {
      continue
    }
    const argKey = readArgFieldStorageKey(argField)
    const item = parsed.args.find((argItem: arg) => argItem.key === argKey)
    if (
      item
      && typeof item.value === 'string'
      && shouldIndexAssetReferenceValue(argField.field.fileConfig.assetType, item.value)
    ) {
      checks.push({
        key: argKey,
        assetType: argField.field.fileConfig.assetType,
        value: item.value,
      })
    }
  }

  return checks
}

export function resolveMissingFileKeysFromCatalog(
  checks: StatementFileCheckItem[],
  hasAssetKey: (key: AssetKey) => boolean,
): Set<string> {
  if (checks.length === 0) {
    return new Set()
  }

  const missingKeys = new Set<string>()

  for (const { key, assetType, value } of checks) {
    const assetKey = createReferencedAssetKey(assetType, value)
    if (!assetKey) {
      continue
    }

    if (!hasAssetKey(assetKey)) {
      missingKeys.add(key)
    }
  }

  return missingKeys
}
