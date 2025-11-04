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
    immediateFields = [],
    debounceOptions = { debounce: 300, maxWait: 600 },
  } = options

  const form = useForm({
    validationSchema,
    initialValues: store.$state,
  })

  const onSubmit = form.handleSubmit((values) => {
    store.$patch(values)
  })

  // 如果没有立即同步字段，全部防抖处理
  if (immediateFields.length === 0) {
    watchDebounced(form.values, () => void onSubmit(), debounceOptions)
    return form as FormContext<z.infer<T>>
  }

  // 如果有立即同步字段，分别处理立即同步和防抖
  const immediateSyncFields = new Set(immediateFields)
  const values = form.values as z.infer<T>

  // 获取初始的所有字段列表（用于计算需要防抖的字段）
  const initialKeys = Object.keys(values)
  const debouncedFields = initialKeys.filter(key => !immediateSyncFields.has(key))

  // 计算立即同步字段的值数组（只访问 immediateFields 中的字段）
  const immediateValuesArray = $computed(() =>
    immediateFields.map(field => values[field]),
  )

  // 计算需要防抖的字段值数组（只访问 debouncedFields 中的字段）
  const debouncedValuesArray = $computed(() =>
    debouncedFields.map(field => values[field]),
  )

  // 监听立即同步字段的变化
  watch(
    () => immediateValuesArray,
    () => {
      void onSubmit()
    },
  )

  // 监听需要防抖的字段变化
  watchDebounced(
    () => debouncedValuesArray,
    () => {
      void onSubmit()
    },
    debounceOptions,
  )

  return form as FormContext<z.infer<T>>
}
