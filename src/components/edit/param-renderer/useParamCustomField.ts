import { CUSTOM_CONTENT, EditorField } from '~/helper/command-registry/schema'

interface UseParamCustomFieldOptions {
  visibleFields: () => EditorField[]
  getFieldSelectValue: (field: EditorField) => string
  isFieldCustom: (field: EditorField) => boolean
}

export function useParamCustomField(options: UseParamCustomFieldOptions) {
  const forcedKeys = $ref(new Set<string>())

  function isCustomizableArgChoiceField(field: EditorField): boolean {
    return field.storage === 'arg'
      && field.field.type === 'choice'
      && field.field.customizable === true
  }

  function isForcedCustom(field: EditorField): boolean {
    return isCustomizableArgChoiceField(field) && forcedKeys.has(field.key)
  }

  function isCustomField(field: EditorField): boolean {
    if (field.storage === 'content' && field.field.type === 'choice') {
      return field.field.customizable === true
        && options.getFieldSelectValue(field) === CUSTOM_CONTENT
    }
    if (isForcedCustom(field)) {
      return true
    }
    return options.isFieldCustom(field)
  }

  function selectModelValue(field: EditorField): string {
    if (isForcedCustom(field)) {
      return CUSTOM_CONTENT
    }
    return options.getFieldSelectValue(field)
  }

  /**
   * 当 select 值变化时调用。返回 true 表示进入了自定义模式，调用方应清空字段值。
   */
  function onSelectChange(field: EditorField, value: string): boolean {
    if (!isCustomizableArgChoiceField(field)) {
      return false
    }
    if (value === CUSTOM_CONTENT) {
      forcedKeys.add(field.key)
      return true
    }
    forcedKeys.delete(field.key)
    return false
  }

  // 自动清理不再可见的 forced keys
  watchEffect(() => {
    if (forcedKeys.size === 0) {
      return
    }
    const visibleKeys = new Set(
      options.visibleFields()
        .filter(field => isCustomizableArgChoiceField(field))
        .map(field => field.key),
    )
    for (const key of forcedKeys) {
      if (!visibleKeys.has(key)) {
        forcedKeys.delete(key)
      }
    }
  })

  return {
    isCustomField,
    selectModelValue,
    onSelectChange,
  }
}
