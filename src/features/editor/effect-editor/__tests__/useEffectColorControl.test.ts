import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

import { useEffectColorControl } from '~/features/editor/effect-editor/useEffectColorControl'

import type { ImmediatePointerDragEvent } from '~/composables/useImmediatePointerDrag'
import type { ColorField } from '~/features/editor/command-registry/schema'
import type { EffectControlDeps } from '~/features/editor/effect-editor/types'

const { createParamDragModule, dragController } = vi.hoisted(() => {
  const dragController = {
    active: false,
    param: undefined as unknown,
  }

  function createParamDragModule() {
    return {
      createParamDrag<P, S>(callbacks: {
        onCancel?: (state: S & { param: P }) => void
        onStart: (event: ImmediatePointerDragEvent, param: P) => unknown
        // 这些测试只覆盖开始/结束语义；保留 onMove 是为了让 mock 签名贴近真实 API。
        onMove: (event: ImmediatePointerDragEvent, state: S & { param: P }) => unknown
        onEnd: (event: ImmediatePointerDragEvent | undefined, state: S & { param: P }) => void
      }) {
        return {
          drag: {
            get active() {
              return dragController.active
            },
            get state() {
              return dragController.active ? { param: dragController.param as P } as S & { param: P } : undefined
            },
            stop(event?: ImmediatePointerDragEvent) {
              if (!dragController.active) {
                return
              }
              callbacks.onEnd(event, { param: dragController.param as P } as S & { param: P })
              dragController.active = false
              dragController.param = undefined
            },
            cancel() {
              if (!dragController.active) {
                return
              }
              callbacks.onCancel?.({ param: dragController.param as P } as S & { param: P })
              dragController.active = false
              dragController.param = undefined
            },
          },
          start(event: ImmediatePointerDragEvent, param: P) {
            callbacks.onStart(event, param)
            dragController.active = true
            dragController.param = param
          },
        }
      },
    }
  }

  return {
    createParamDragModule,
    dragController,
  }
})

vi.mock('~/features/editor/effect-editor/createParamDrag', createParamDragModule)

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

function createPointerEvent(overrides?: Partial<PointerEvent>): PointerEvent {
  return {
    altKey: false,
    button: 0,
    buttons: 1,
    clientX: 10,
    clientY: 10,
    currentTarget: {
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 20,
        height: 20,
      }),
    },
    pointerId: 1,
    pointerType: 'mouse',
    preventDefault: vi.fn(),
    shiftKey: false,
    ...overrides,
  } as PointerEvent
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
  beforeEach(() => {
    dragController.active = false
    dragController.param = undefined
  })

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

  it('非拖拽状态下 handleColorPickerChange 会立即 flush', () => {
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
      schedule: 'color',
      flush: true,
      deferAutoApply: false,
    })
  })

  it('颜色选择器打开时回传当前默认颜色不会写入缺失字段', () => {
    const { deps, emitTransform, fields } = createDeps()
    const control = useEffectColorControl(deps)
    const field = createColorField({
      colorDefaults: [255, 255, 255],
    })

    control.handleColorPickerChange(field, { rgba: { r: 255, g: 255, b: 255 } })

    expect(fields).toEqual({})
    expect(emitTransform).not.toHaveBeenCalled()
  })

  it('颜色触发按钮仅 pointerdown/up 时不会写入缺失字段', () => {
    const { deps, emitTransform, fields } = createDeps()
    const control = useEffectColorControl(deps)
    const field = createColorField({
      colorDefaults: [255, 255, 255],
    })

    control.handleColorPickerPointerDown(createPointerEvent(), field)
    control.colorDrag.stop?.(createPointerEvent())

    expect(fields).toEqual({})
    expect(emitTransform).not.toHaveBeenCalled()
  })

  it('拖拽期间只做 deferred preview，结束时才 flush 最终颜色', () => {
    const { deps, emitTransform, fields } = createDeps()
    const control = useEffectColorControl(deps)
    const field = createColorField()

    control.handleColorPickerPointerDown(createPointerEvent(), field)
    control.handleColorPickerChange(field, { rgba: { r: 10, g: 20, b: 30 } })

    expect(emitTransform).toHaveBeenLastCalledWith(fields, {
      schedule: 'color',
      deferAutoApply: true,
    })

    control.colorDrag.stop?.(createPointerEvent())

    expect(emitTransform).toHaveBeenLastCalledWith(fields, {
      schedule: 'color',
      flush: true,
      deferAutoApply: false,
    })
    expect(fields).toMatchObject({
      r: '10',
      g: '20',
      b: '30',
    })
  })

  it('颜色拖拽取消时会取消当前预览交互并丢弃 pending flush', () => {
    const { deps, emitTransform } = createDeps()
    const cancelPreview = vi.fn()
    const depsWithCancel = deps as EffectControlDeps & { cancelPreview: () => void }
    depsWithCancel.cancelPreview = cancelPreview
    const control = useEffectColorControl(depsWithCancel)
    const field = createColorField()

    control.handleColorPickerPointerDown(createPointerEvent(), field)
    control.handleColorPickerChange(field, { rgba: { r: 10, g: 20, b: 30 } })
    control.colorDrag.cancel?.()

    expect(cancelPreview).toHaveBeenCalledOnce()
    expect(emitTransform).toHaveBeenCalledTimes(1)
    expect(emitTransform).toHaveBeenLastCalledWith(expect.any(Object), {
      schedule: 'color',
      deferAutoApply: true,
    })
  })
})
