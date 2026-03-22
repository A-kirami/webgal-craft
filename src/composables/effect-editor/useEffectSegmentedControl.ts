import { EmitTransformOptions } from '~/composables/effect-editor/types'
import { ChoiceField, EditorDynamicOptionsKey, UNSPECIFIED } from '~/helper/command-registry/schema'

export interface EffectSegmentedOption {
  iconClass: string
  label: string
  value: string
}

interface UseEffectSegmentedControlOptions {
  getFields: () => Record<string, string>
  getFieldValue: (path: string) => string
  emitTransform: (fields: Record<string, string>, options: EmitTransformOptions) => void
  resolveOptionLabel: (label: unknown) => string
  resolveDynamicOptionsFn: (key: EditorDynamicOptionsKey) => { options: { value: string, label: string }[] } | undefined
  buildControlId: (key: string) => string
}

export function useEffectSegmentedControl(options: UseEffectSegmentedControlOptions) {
  function getSegmentedOptionIconClass(value: string): string {
    if (value === '1') {
      return 'i-lucide-check'
    }
    if (value === '0') {
      return 'i-lucide-x'
    }
    return 'i-lucide-circle'
  }

  function getSegmentedOptions(param: ChoiceField): EffectSegmentedOption[] {
    const staticOptions: EffectSegmentedOption[] = param.options.map(option => ({
      value: option.value,
      label: options.resolveOptionLabel(option.label),
      iconClass: getSegmentedOptionIconClass(option.value),
    }))

    if (!param.dynamicOptionsKey) {
      return staticOptions
    }

    const dynamicResult = options.resolveDynamicOptionsFn(param.dynamicOptionsKey)
    if (!dynamicResult?.options.length) {
      return staticOptions
    }

    const merged = new Map<string, EffectSegmentedOption>()

    for (const option of dynamicResult.options) {
      merged.set(option.value, {
        value: option.value,
        label: option.label,
        iconClass: getSegmentedOptionIconClass(option.value),
      })
    }
    for (const option of staticOptions) {
      if (!merged.has(option.value)) {
        merged.set(option.value, option)
      }
    }

    return [...merged.values()]
  }

  function getSegmentedValue(param: ChoiceField): string {
    const raw = options.getFieldValue(param.key)
    if (raw && getSegmentedOptions(param).some(option => option.value === raw)) {
      return raw
    }
    return UNSPECIFIED
  }

  function updateSegmentedField(param: ChoiceField, rawValue: string) {
    const fields = options.getFields()
    if (getSegmentedOptions(param).some(option => option.value === rawValue)) {
      fields[param.key] = rawValue
    } else {
      delete fields[param.key]
    }

    options.emitTransform(fields, { schedule: 'immediate', flush: true })
  }

  function segmentedControlId(path: string): string {
    return options.buildControlId(`segmented-${path}`)
  }

  return {
    getSegmentedOptions,
    getSegmentedValue,
    updateSegmentedField,
    segmentedControlId,
  }
}
