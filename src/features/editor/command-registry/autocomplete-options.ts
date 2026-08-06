import { isExtendedFigurePositionTargetId } from '~/domain/script/types'

import { resolveI18n } from './schema'

import type { I18nT, SceneAutocompleteCollection, TextFieldAutocompleteSources } from './schema'

export interface ResolvedAutocompleteOption {
  group?: string
  label: string
  value: string
}

export type SceneAutocompleteOptionCollections = Partial<Record<
  SceneAutocompleteCollection,
  readonly { label: string, value: string }[]
>>

interface ResolveAutocompleteContext {
  content?: string
  sceneOptions?: SceneAutocompleteOptionCollections
  allowExtendedFigurePositions?: boolean
  t: I18nT
}

export function dedupeAutocompleteOptions<T extends { value: string }>(options: readonly T[]): T[] {
  const seen = new Set<string>()
  return options.filter((option) => {
    const value = option.value.trim()
    if (!value || seen.has(value)) {
      return false
    }
    seen.add(value)
    return true
  })
}

export function resolveAutocompleteOptions(
  sources: TextFieldAutocompleteSources,
  context: ResolveAutocompleteContext,
): ResolvedAutocompleteOption[] {
  const resolvedOptions: ResolvedAutocompleteOption[] = []

  for (const source of sources) {
    const group = resolveI18n(source.groupLabel, context.t, context.content)
    const options = source.type === 'static'
      ? source.options
          .filter(option => context.allowExtendedFigurePositions !== false || !isExtendedFigurePositionTargetId(option.value))
          .map(option => ({
            label: resolveI18n(option.label, context.t, context.content),
            value: option.value,
          }))
      : context.sceneOptions?.[source.collection] ?? []

    resolvedOptions.push(...options.map(option => ({
      label: option.label,
      value: option.value,
      ...(group ? { group } : {}),
    })))
  }

  return dedupeAutocompleteOptions(resolvedOptions)
}
