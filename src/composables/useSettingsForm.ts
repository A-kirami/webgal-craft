import { useForm } from 'vee-validate'

import type { WatchDebouncedOptions } from '@vueuse/core'
import type { Store } from 'pinia'
import type { FormContext } from 'vee-validate'
import type { z } from 'zod'

interface UseSettingsFormOptions<T extends z.ZodType> {
  /**
   * Pinia store 实例
   */
  store: Store
  /**
   * Zod 验证模式
   */
  validationSchema: T | (() => T)
  /**
   * 由表单管理并允许回写到 store 的字段列表
   */
  fieldNames?: string[]
  /**
   * 需要立即同步的字段列表（不防抖）
   */
  immediateFields?: string[]
  /**
   * 防抖配置
   */
  debounceOptions?: WatchDebouncedOptions<false>
}

/**
 * 设置表单组合函数
 * 统一处理设置表单的验证、防抖和提交逻辑
 */
export function useSettingsForm<
  T extends z.ZodObject<z.ZodRawShape>,
>(
  options: UseSettingsFormOptions<T>,
): FormContext<z.infer<T>> {
  const {
    store,
    validationSchema,
    fieldNames,
    immediateFields = [],
    debounceOptions = { debounce: 300, maxWait: 600 },
  } = options

  const storeState = store.$state as Record<string, unknown>
  const managedFieldNames = fieldNames?.length ? [...fieldNames] : Object.keys(store.$state)

  function pickManagedValues(source: Record<string, unknown>) {
    return Object.fromEntries(
      managedFieldNames.map(fieldName => [fieldName, source[fieldName]]),
    )
  }

  function hasSameManagedValues(
    source: Record<string, unknown>,
    target: Record<string, unknown>,
  ) {
    return managedFieldNames.every(fieldName => Object.is(source[fieldName], target[fieldName]))
  }

  const form = useForm({
    validationSchema,
    initialValues: pickManagedValues(storeState),
  })

  const onSubmit = form.handleSubmit((values) => {
    store.$patch(pickManagedValues(values as Record<string, unknown>))
  })

  watch(
    () => managedFieldNames.map(fieldName => storeState[fieldName]),
    () => {
      const managedStoreValues = pickManagedValues(store.$state as Record<string, unknown>)

      if (hasSameManagedValues(managedStoreValues, form.values as Record<string, unknown>)) {
        return
      }

      form.resetForm({ values: managedStoreValues })
    },
  )

  // 如果没有立即同步字段，全部防抖处理
  if (immediateFields.length === 0) {
    watchDebounced(form.values, () => void onSubmit(), debounceOptions)
    return form as FormContext<z.infer<T>>
  }

  const immediateSyncFields = new Set(immediateFields)
  const values = form.values as z.infer<T>
  const debouncedFields = managedFieldNames.filter(key => !immediateSyncFields.has(key))

  const immediateValuesArray = $computed(() =>
    immediateFields.map(field => values[field]),
  )

  const debouncedValuesArray = $computed(() =>
    debouncedFields.map(field => values[field]),
  )

  watch(
    () => immediateValuesArray,
    () => void onSubmit(),
  )

  watchDebounced(
    () => debouncedValuesArray,
    () => void onSubmit(),
    debounceOptions,
  )

  return form as FormContext<z.infer<T>>
}
