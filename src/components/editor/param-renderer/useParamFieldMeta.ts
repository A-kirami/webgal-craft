import { EditorField, JsonObjectField, resolveI18n, resolveSurfaceVariant } from '~/features/editor/command-registry/schema'

import type { StatementEditorSurface } from '~/features/editor/statement-editor/surface-context'

export type StatementSchemaParamMode = 'all' | 'basic' | 'advanced'
export type StatementParamFieldMode =
  | 'switch'
  | 'sliderInput'
  | 'numberWithUnit'
  | 'number'
  | 'select'
  | 'combobox'
  | 'color'
  | 'textareaAuto'
  | 'textareaGrow'
  | 'file'
  | 'text'

type TranslateFn = (key: string, ...args: unknown[]) => string

interface UseParamFieldMetaOptions {
  i18nContent: () => string
  mode: () => StatementSchemaParamMode
  surface: () => StatementEditorSurface
  t: TranslateFn
}

const NUMBER_MODES = new Set<StatementParamFieldMode>(['sliderInput', 'numberWithUnit', 'number'])

function resolveFieldMode(
  field: Exclude<EditorField['field'], JsonObjectField>,
  surface: StatementEditorSurface,
): StatementParamFieldMode {
  if (field.type === 'switch') {
    return 'switch'
  }
  if (field.type === 'text') {
    const variant = resolveSurfaceVariant(field.variant, surface, 'input')
    if (variant === 'textarea-auto') {
      return 'textareaAuto'
    }
    if (variant === 'textarea-grow') {
      return 'textareaGrow'
    }
    return 'text'
  }
  if (field.type === 'number') {
    const fallback = field.unit ? 'input-with-unit' : 'input'
    const variant = resolveSurfaceVariant(field.variant, surface, fallback)
    if (variant === 'slider-input') {
      return 'sliderInput'
    }
    if (variant === 'input-with-unit') {
      return 'numberWithUnit'
    }
    return 'number'
  }
  if (field.type === 'choice') {
    const variant = resolveSurfaceVariant(field.variant, surface, 'select')
    if (variant === 'combobox') {
      return 'combobox'
    }
    return 'select'
  }
  if (field.type === 'color') {
    return 'color'
  }
  if (field.type === 'file') {
    return 'file'
  }
  return 'text'
}

export function useParamFieldMeta(options: UseParamFieldMetaOptions) {
  function filterVisibleFields(fields: EditorField[], isFieldVisible: (field: EditorField) => boolean): EditorField[] {
    return fields.filter((field) => {
      if (!isFieldVisible(field)) {
        return false
      }

      if (options.mode() === 'advanced') {
        return !!field.field.advanced
      }
      if (options.mode() === 'basic') {
        return !field.field.advanced
      }
      return true
    })
  }

  function fieldMode(field: EditorField): StatementParamFieldMode {
    return resolveFieldMode(field.field, options.surface())
  }

  function isNumberMode(field: EditorField): boolean {
    return NUMBER_MODES.has(fieldMode(field))
  }

  function isTextareaMode(field: EditorField): boolean {
    const mode = fieldMode(field)
    return mode === 'textareaAuto' || mode === 'textareaGrow'
  }

  function fieldLayout(field: EditorField, isInline: boolean): 'row' | 'column' {
    if (isInline) {
      return 'row'
    }
    const mode = fieldMode(field)
    return mode === 'switch' || mode === 'color'
      ? 'row'
      : 'column'
  }

  function placeholder(field: EditorField): string {
    if ('placeholder' in field.field) {
      return resolveI18n(field.field.placeholder, options.t, options.i18nContent()) || resolveI18n(field.field.label, options.t, options.i18nContent())
    }
    return resolveI18n(field.field.label, options.t, options.i18nContent())
  }

  function customLabel(field: EditorField): string {
    if ('customLabel' in field.field) {
      return resolveI18n(field.field.customLabel, options.t, options.i18nContent())
    }
    return ''
  }

  function unitLabel(field: EditorField): string {
    if ('unit' in field.field) {
      return resolveI18n(field.field.unit, options.t, options.i18nContent())
    }
    return ''
  }

  function fileTitle(field: EditorField): string {
    if ('fileConfig' in field.field) {
      return resolveI18n(field.field.fileConfig?.title, options.t, options.i18nContent())
    }
    return ''
  }

  function switchModelValue(field: EditorField, value: string | number | boolean): boolean {
    if (field.storage === 'content' && field.field.type === 'switch') {
      return String(value) === (field.field.onValue ?? '')
    }
    return value === true
  }

  function resolveNumberControlVariant(field: EditorField): 'input' | 'input-with-unit' | 'slider-input' {
    if (field.field.type === 'number') {
      const fallback = field.field.unit ? 'input-with-unit' : 'input'
      return resolveSurfaceVariant(field.field.variant, options.surface(), fallback)
    }
    return 'input'
  }

  function shouldUseInputAutoWidth(field: EditorField): boolean {
    if (field.field.type === 'text') {
      return field.field.inputAutoWidth === true && fieldMode(field) === 'text'
    }

    if (field.field.type === 'number') {
      return field.field.inputAutoWidth === true && resolveNumberControlVariant(field) === 'input'
    }

    return false
  }

  function isFileField(field: EditorField): boolean {
    return field.field.type === 'file'
  }

  return {
    customLabel,
    fieldLayout,
    fieldMode,
    fileTitle,
    filterVisibleFields,
    isFileField,
    isNumberMode,
    isTextareaMode,
    placeholder,
    resolveNumberControlVariant,
    shouldUseInputAutoWidth,
    switchModelValue,
    unitLabel,
  }
}
