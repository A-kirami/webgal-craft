import { buildCascadingComboboxData } from '~/components/primitives/combobox/cascading-combobox-data'
import { isFlagChoiceField, resolveI18n } from '~/features/editor/command-registry/schema'

import type { ParamSelectOptionItem } from './controls/types'
import type { CascadingComboboxData } from '~/components/primitives/combobox/cascading-combobox-data'
import type { EditorField } from '~/features/editor/command-registry/schema'

type ChoiceFieldMode = 'select' | 'combobox'
type TranslateFn = (key: string, ...args: unknown[]) => string

interface UseParamChoiceFieldViewModelOptions {
  getChoiceFieldMode: (field: EditorField) => ChoiceFieldMode | undefined
  getComboboxPathDelimiter: () => string
  getCustomLabel: (field: EditorField) => string
  getDynamicOptions: (field: EditorField) => ParamSelectOptionItem[]
  getPlaceholder: (field: EditorField) => string
  getSelectValue: (field: EditorField) => string
  isCustomField: (field: EditorField) => boolean
  i18nContent: () => string
  shouldRenderSegmented: (field: EditorField) => boolean
  t: TranslateFn
  visibleFields: () => EditorField[]
}

export interface ParamChoiceFieldViewModel {
  comboboxData?: CascadingComboboxData
  customLabel: string
  isCustomField: boolean
  mode: ChoiceFieldMode
  options: ParamSelectOptionItem[]
  placeholder: string
  renderSegmented: boolean
  selectValue: string
}

function resolveStaticOptions(
  field: EditorField,
  t: TranslateFn,
  i18nContent: string,
): ParamSelectOptionItem[] {
  if (field.field.type !== 'choice') {
    return []
  }

  return field.field.options.map(option => ({
    value: option.value,
    label: resolveI18n(option.label, t, i18nContent),
  }))
}

function mergeOptions(
  dynamicOptions: ParamSelectOptionItem[],
  staticOptions: ParamSelectOptionItem[],
): ParamSelectOptionItem[] {
  const merged: ParamSelectOptionItem[] = []
  const seen = new Set<string>()

  for (const option of [...dynamicOptions, ...staticOptions]) {
    if (seen.has(option.value)) {
      continue
    }

    seen.add(option.value)
    merged.push(option)
  }

  return merged
}

function resolveComboboxData(
  field: EditorField,
  mode: ChoiceFieldMode,
  mergedOptions: ParamSelectOptionItem[],
  options: UseParamChoiceFieldViewModelOptions,
): CascadingComboboxData | undefined {
  if (field.field.type !== 'choice' || isFlagChoiceField(field.field) || mode !== 'combobox') {
    return
  }

  if (field.field.grouping?.mode !== 'path') {
    return
  }

  const delimiter = options.getComboboxPathDelimiter()?.trim() ?? ''
  if (delimiter === '') {
    return
  }

  return buildCascadingComboboxData(mergedOptions, {
    grouping: field.field.grouping,
    resolvedDelimiter: delimiter,
  })
}

function createViewModel(
  field: EditorField,
  options: UseParamChoiceFieldViewModelOptions,
): ParamChoiceFieldViewModel | undefined {
  const mode = options.getChoiceFieldMode(field)
  if (field.field.type !== 'choice' || !mode) {
    return
  }

  const mergedOptions = mergeOptions(
    options.getDynamicOptions(field),
    resolveStaticOptions(field, options.t, options.i18nContent()),
  )

  return {
    comboboxData: resolveComboboxData(field, mode, mergedOptions, options),
    customLabel: options.getCustomLabel(field),
    isCustomField: options.isCustomField(field),
    mode,
    options: mergedOptions,
    placeholder: options.getPlaceholder(field),
    renderSegmented: options.shouldRenderSegmented(field),
    selectValue: options.getSelectValue(field),
  }
}

export function useParamChoiceFieldViewModel(
  options: UseParamChoiceFieldViewModelOptions,
) {
  const viewModels = computed(() => {
    const result = new Map<string, ParamChoiceFieldViewModel>()

    for (const field of options.visibleFields()) {
      const viewModel = createViewModel(field, options)
      if (viewModel) {
        result.set(field.key, viewModel)
      }
    }

    return result
  })

  return {
    viewModels,
  }
}
