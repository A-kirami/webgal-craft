import { resolveI18n } from '~/features/editor/command-registry/schema'

import type { I18nT, TextFieldAutocompleteSources } from '~/features/editor/command-registry/schema'
import type { SceneAutocompleteOptions } from '~/features/editor/statement-editor/scene-autocomplete'

export interface ResolvedAutocompleteOption {
  group?: string
  label: string
  value: string
}

interface ResolveAutocompleteContext {
  content?: string
  sceneOptions: SceneAutocompleteOptions
  t: I18nT
}

export function resolveAutocompleteOptions(
  sources: TextFieldAutocompleteSources,
  context: ResolveAutocompleteContext,
): ResolvedAutocompleteOption[] {
  const resolvedOptions: ResolvedAutocompleteOption[] = []
  const seen = new Set<string>()

  function addOption(label: string, value: string, group: string) {
    if (!value || seen.has(value)) {
      return
    }

    seen.add(value)
    resolvedOptions.push({
      label,
      value,
      ...(group ? { group } : {}),
    })
  }

  for (const source of sources) {
    const group = resolveI18n(source.groupLabel, context.t, context.content)
    if (source.type === 'static') {
      for (const option of source.options) {
        addOption(resolveI18n(option.label, context.t, context.content), option.value, group)
      }
      continue
    }

    for (const option of context.sceneOptions[source.collection]) {
      addOption(option.label, option.value, group)
    }
  }

  return resolvedOptions
}
