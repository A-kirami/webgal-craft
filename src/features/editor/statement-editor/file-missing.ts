import { ArgField, EditorField, readArgFieldStorageKey } from '~/features/editor/command-registry/schema'

import type { arg, ISentence } from 'webgal-parser/src/interface/sceneInterface'

export interface StatementFileCheckItem {
  key: string
  assetType: string
  value: string
}

// WebGAL 支持 {varName} 语法引用变量作为文件路径，
// 变量占位符无法在编辑时检查文件是否存在，跳过检查避免误报
function isVariablePlaceholder(value: string): boolean {
  const trimmed = value.trim()
  return /^\{[^{}]+\}$/.test(trimmed)
}

function shouldCheckStatementFileValue(assetType: string, value: string): boolean {
  // scene 中不带 .txt 的值可能是 label，而不是文件路径
  if (assetType === 'scene' && !value.endsWith('.txt')) {
    return false
  }

  return true
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
  if (parsed.content && contentFileConfig && !isVariablePlaceholder(parsed.content)) {
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
    if (item && typeof item.value === 'string' && item.value && !isVariablePlaceholder(item.value)) {
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
  hasAsset: (assetType: string, relativePath: string) => boolean,
): Set<string> {
  if (checks.length === 0) {
    return new Set()
  }

  const missingKeys = new Set<string>()

  for (const { key, assetType, value } of checks) {
    if (!shouldCheckStatementFileValue(assetType, value)) {
      continue
    }

    if (!hasAsset(assetType, value)) {
      missingKeys.add(key)
    }
  }

  return missingKeys
}
