import { exists } from '@tauri-apps/plugin-fs'

import { ArgField, EditorField, readArgFieldStorageKey } from '~/features/editor/command-registry/schema'

import type { arg, ISentence } from 'webgal-parser/src/interface/sceneInterface'

export interface StatementFileCheckItem {
  key: string
  assetType: string
  value: string
}

export interface StatementFileCheckContext {
  parsed?: ISentence
  contentField?: EditorField
  argFields: ArgField[]
  cwd?: string
}

export interface StatementFileCheckDeps {
  gameAssetDir: (cwd: string, assetType: string) => Promise<string>
  gameSceneDir: (cwd: string) => Promise<string>
  joinPath: (left: string, right: string) => Promise<string>
}

// WebGAL 支持 {varName} 语法引用变量作为文件路径，
// 变量占位符无法在编辑时检查文件是否存在，跳过检查避免误报
function isVariablePlaceholder(value: string): boolean {
  const trimmed = value.trim()
  return /^\{[^{}]+\}$/.test(trimmed)
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

export async function resolveMissingFileKeys(
  cwd: string,
  checks: StatementFileCheckItem[],
  deps: StatementFileCheckDeps,
): Promise<Set<string>> {
  if (checks.length === 0) {
    return new Set()
  }

  const results = await Promise.all(
    checks.map(async ({ key, assetType, value }) => {
      try {
        const assetDir = assetType === 'scene'
          ? await deps.gameSceneDir(cwd)
          : await deps.gameAssetDir(cwd, assetType)
        // 不以 .txt 结尾的场景值可能是标签名（如 label），无法确定是否为文件引用，跳过检查
        if (assetType === 'scene' && !value.endsWith('.txt')) {
          return { key, missing: false }
        }
        const filePath = await deps.joinPath(assetDir, value)
        return { key, missing: !(await exists(filePath)) }
      } catch {
        return { key, missing: false }
      }
    }),
  )

  return new Set(results.filter(item => item.missing).map(item => item.key))
}

export function createStatementMissingFileLoader(deps: StatementFileCheckDeps) {
  // 乐观并发控制：每次调用递增 version，异步完成后检查 version 是否仍匹配。
  // 若不匹配说明有更新的调用已发起，当前结果已过时，丢弃以避免竞态覆盖
  let version = 0

  return async function load(context: StatementFileCheckContext): Promise<Set<string> | undefined> {
    const currentVersion = ++version

    if (!context.parsed || !context.cwd) {
      return new Set()
    }

    const checks = collectStatementFileChecks(
      context.parsed,
      context.contentField,
      context.argFields,
    )

    const missingKeys = await resolveMissingFileKeys(context.cwd, checks, deps)
    if (currentVersion !== version) {
      return
    }
    return missingKeys
  }
}
