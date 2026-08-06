import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { isExtendedFigurePosition } from '~/domain/script/types'

import { dedupeAutocompleteOptions, resolveAutocompleteOptions } from './autocomplete-options'
import { commandEntries, getCommandConfig, getCommandScriptString } from './index'
import { isFlagChoiceField, readArgFields, readContentField, resolveI18n, UNSPECIFIED } from './schema'

import type { SceneAutocompleteOptionCollections } from './autocomplete-options'
import type { DynamicOptionsContext, EditorDynamicOptionsKey, FieldDef, I18nLike, I18nT } from './schema'
import type { AbsPath } from '~/domain/path'

export interface ArgumentCompletionInfo {
  key: string
  detail: string
  simplified: boolean
  hasValueCompletions: boolean
}

export interface CommandCompletionInfo {
  commandRaw: string
  detail: string
}

export interface CompletionOption {
  label: string
  value: string
}

export interface CompletionQueryContext {
  content: string
  gamePath?: AbsPath
  sceneOptions?: SceneAutocompleteOptionCollections
  listResources?: (assetType: string) => readonly CompletionOption[]
  resolveDynamicOptions?: (key: EditorDynamicOptionsKey, context: DynamicOptionsContext) => Promise<readonly CompletionOption[]> | readonly CompletionOption[]
  allowExtendedFigurePositions?: boolean
}

interface CompletionOnlyArgument {
  key: string
  label: I18nLike
  simplified?: boolean
}

const WHEN: CompletionOnlyArgument = {
  key: 'when',
  label: t => t('edit.completion.arguments.when'),
}

const completionOnlyArguments = new Map<commandType, CompletionOnlyArgument[]>([
  [commandType.say, [
    { key: 'left', label: t => t('edit.completion.arguments.left'), simplified: true },
    { key: 'left14', label: t => t('edit.completion.arguments.left14'), simplified: true },
    { key: 'left13', label: t => t('edit.completion.arguments.left13'), simplified: true },
    { key: 'center', label: t => t('edit.completion.arguments.center'), simplified: true },
    { key: 'right13', label: t => t('edit.completion.arguments.right13'), simplified: true },
    { key: 'right14', label: t => t('edit.completion.arguments.right14'), simplified: true },
    { key: 'right', label: t => t('edit.completion.arguments.right'), simplified: true },
  ]],
])

export function buildArgumentCompletionInfo(command: commandType, t: I18nT): ArgumentCompletionInfo[] {
  const entry = getCommandConfig(command)
  const result: ArgumentCompletionInfo[] = [{
    key: WHEN.key,
    detail: resolveI18n(WHEN.label, t),
    simplified: false,
    hasValueCompletions: false,
  }]

  for (const item of completionOnlyArguments.get(command) ?? []) {
    result.push({
      key: item.key,
      detail: resolveI18n(item.label, t),
      simplified: item.simplified ?? false,
      hasValueCompletions: false,
    })
  }

  for (const { storage, field } of entry.fields) {
    if (typeof storage !== 'object') {
      continue
    }

    if (field.type === 'choice' && isFlagChoiceField(field)) {
      for (const option of field.options) {
        if (option.value !== UNSPECIFIED) {
          result.push({
            key: option.value,
            detail: resolveI18n(option.label, t),
            simplified: true,
            hasValueCompletions: false,
          })
        }
      }
      continue
    }

    result.push({
      key: storage.arg,
      detail: resolveI18n(field.label, t),
      simplified: field.type === 'switch',
      hasValueCompletions: fieldHasValueCompletions(field),
    })
  }

  return result.filter((item, index, items) => items.findIndex(candidate => candidate.key === item.key) === index)
}

function fieldHasValueCompletions(field: FieldDef): boolean {
  return field.type === 'file'
    || (field.type === 'choice' && !isFlagChoiceField(field))
    || (field.type === 'text' && field.variant === 'autocomplete')
}

/** 从统一命令注册表生成文本编辑器使用的命令候选。 */
export function buildCommandCompletionInfo(t: I18nT): CommandCompletionInfo[] {
  return commandEntries.flatMap((entry) => {
    const commandRaw = getCommandScriptString(entry.type)
    if (!commandRaw) {
      return []
    }
    return [{
      commandRaw,
      detail: resolveI18n(entry.description, t),
    }]
  })
}

function getFieldForCompletion(command: commandType, key: string): FieldDef | undefined {
  const entry = getCommandConfig(command)
  if (key === 'content') {
    return readContentField(entry)
  }

  return readArgFields(entry).find(item => item.field.key === key)?.field
}

function resolveStaticOptions(field: FieldDef, t: I18nT, content: string, sceneOptions: SceneAutocompleteOptionCollections | undefined, allowExtendedFigurePositions: boolean): CompletionOption[] {
  if (field.type === 'choice') {
    return field.options
      .filter(option => option.value !== UNSPECIFIED)
      .filter(option => allowExtendedFigurePositions || !isExtendedFigurePosition(option.value))
      .map(option => ({
        label: resolveI18n(option.label, t, content),
        value: option.value,
      }))
  }
  if (field.type === 'text' && field.variant === 'autocomplete') {
    return resolveAutocompleteOptions(field.autocomplete, { content, sceneOptions, t, allowExtendedFigurePositions })
      .map(option => ({ label: option.label, value: option.value }))
  }
  return []
}

/** 查询参数值候选，所有动态和资源来源均由调用方注入。 */
export async function queryArgumentValueCompletions(
  command: commandType,
  key: string,
  context: CompletionQueryContext,
  t: I18nT,
): Promise<CompletionOption[]> {
  const field = getFieldForCompletion(command, key)
  if (!field) {
    return []
  }

  let options: readonly CompletionOption[] = []
  if (field.type === 'file') {
    options = context.listResources?.(field.fileConfig.assetType) ?? []
    options = options.filter(option => field.fileConfig.extensions.length === 0
      || field.fileConfig.extensions.some(extension => option.value.toLowerCase().endsWith(extension.toLowerCase())))
  } else if (field.type === 'choice' && field.dynamicOptionsKey && context.gamePath && context.resolveDynamicOptions) {
    options = await context.resolveDynamicOptions(field.dynamicOptionsKey, {
      content: context.content,
      gamePath: context.gamePath,
    })
  } else {
    options = resolveStaticOptions(field, t, context.content, context.sceneOptions, context.allowExtendedFigurePositions !== false)
  }

  return dedupeAutocompleteOptions(options)
}

export function filterCompletionOptions(options: readonly CompletionOption[], query: string): CompletionOption[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) {
    return [...options]
  }
  return options.filter(option => option.value.toLowerCase().startsWith(normalizedQuery) || option.label.toLowerCase().startsWith(normalizedQuery))
}
