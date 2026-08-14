import { describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

import { useEffectColorControl } from '~/features/editor/effect-editor/useEffectColorControl'

import type { ColorField } from '~/features/editor/command-registry/schema'
import type { EffectControlDeps } from '~/features/editor/effect-editor/types'

function createDeps(initialFields: Record<string, string> = {}) {
  const fields = reactive({ ...initialFields }) as Record<string, string>
  const emitTransform = vi.fn()

  const deps: EffectControlDeps = {
    getFields: () => fields,
    getFieldValue: path => fields[path] ?? '',
    getStoredFieldValue: path => fields[path],
    getNumberValue: (path, fallback) => {
      const value = Number(fields[path])
      return Number.isFinite(value) ? value : fallback
    },
    setNumericField: (targetFields, path, value) => {
      targetFields[path] = String(value)
    },
    emitTransform,
  }

  return { deps, emitTransform, fields }
}

function createColorField(
  overrides: Partial<ColorField & {
    colorPaths: [string, string, string]
    colorDefaults: [number, number, number]
  }> = {},
) {
  return {
    key: 'tint',
    type: 'color',
    label: '',
    colorPaths: ['r', 'g', 'b'] as [string, string, string],
    colorDefaults: [0, 0, 0] as [number, number, number],
    ...overrides,
  } satisfies ColorField & {
    colorPaths: [string, string, string]
    colorDefaults: [number, number, number]
  }
}

describe('useEffectColorControl', () => {
  it('读取颜色值时会归一化通道并生成 picker payload', () => {
    const { deps } = createDeps({
      r: '300',
      g: '-5',
      b: '127.6',
    })
    const control = useEffectColorControl(deps)
    const field = createColorField({
      colorDefaults: [10, 20, 30],
    })

    expect(control.getColorValue(field)).toEqual([255, 0, 128])
    expect(control.getColorPickerValue(field)).toEqual({ r: 255, g: 0, b: 128 })
  })

  it('选择器未打开时变更颜色会立即 flush', () => {
    const { deps, emitTransform, fields } = createDeps()
    const control = useEffectColorControl(deps)
    const field = createColorField()

    control.handleColorPickerChange(field, { rgba: { r: 12, g: 34, b: 56 } })

    expect(fields).toMatchObject({
      r: '12',
      g: '34',
      b: '56',
    })
    expect(emitTransform).toHaveBeenLastCalledWith(fields, {
      flush: true,
      deferAutoApply: false,
    })
  })

  it('颜色选择器打开期间回传当前默认颜色不会写入缺失字段', () => {
    const { deps, emitTransform, fields } = createDeps()
    const control = useEffectColorControl(deps)
    const field = createColorField({
      colorDefaults: [255, 255, 255],
    })

    control.handleColorPickerOpenChange(field, true)
    control.handleColorPickerChange(field, { rgba: { r: 255, g: 255, b: 255 } })
    control.handleColorPickerOpenChange(field, false)

    expect(fields).toEqual({})
    expect(emitTransform).not.toHaveBeenCalled()
  })

  it('选择器打开期间只做 deferred preview，关闭时才 flush 最终颜色', () => {
    const { deps, emitTransform, fields } = createDeps()
    const control = useEffectColorControl(deps)
    const field = createColorField()

    control.handleColorPickerOpenChange(field, true)
    control.handleColorPickerChange(field, { rgba: { r: 10, g: 20, b: 30 } })

    expect(emitTransform).toHaveBeenLastCalledWith(fields, {
      deferAutoApply: true,
    })

    control.handleColorPickerOpenChange(field, false)

    expect(emitTransform).toHaveBeenCalledTimes(2)
    expect(emitTransform).toHaveBeenLastCalledWith(fields, {
      flush: true,
      deferAutoApply: false,
    })
    expect(fields).toMatchObject({
      r: '10',
      g: '20',
      b: '30',
    })
  })

  it('颜色交互取消时会取消当前预览并丢弃 pending flush', () => {
    const { deps, emitTransform } = createDeps()
    const cancelPreview = vi.fn()
    deps.cancelPreview = cancelPreview
    const control = useEffectColorControl(deps)
    const field = createColorField()

    control.handleColorPickerOpenChange(field, true)
    control.handleColorPickerChange(field, { rgba: { r: 10, g: 20, b: 30 } })
    control.cancelColorInteraction()

    expect(cancelPreview).toHaveBeenCalledOnce()
    expect(emitTransform).toHaveBeenCalledTimes(1)
    expect(emitTransform).toHaveBeenLastCalledWith(expect.any(Object), {
      deferAutoApply: true,
    })
  })
})
