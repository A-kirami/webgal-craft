import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

import { useEffectColorControl } from '~/composables/effect-editor/useEffectColorControl'

import type { EffectControlDeps } from '~/composables/effect-editor/types'
import type { ColorField } from '~/helper/command-registry/schema'

const { createParamDragModule, dragController } = vi.hoisted(() => {
  const dragController = {
    active: false,
    param: undefined as unknown,
  }

  function createParamDragModule() {
    return {
      createParamDrag<P, S>(callbacks: {
        onStart: (event: PointerEvent, param: P) => unknown
        // useEffectColorControl tests only exercise start/end semantics, so onMove is part of
        // the mock signature for API parity but is intentionally not simulated here.
        onMove: (event: PointerEvent, state: S & { param: P }) => unknown
        onEnd: (event: PointerEvent | undefined, state: S & { param: P }) => void
      }) {
        return {
          drag: {
            get active() {
              return dragController.active
            },
            get state() {
              return dragController.active ? { param: dragController.param as P } as S & { param: P } : undefined
            },
            stop(event?: PointerEvent) {
              if (!dragController.active) {
                return
              }
              callbacks.onEnd(event, { param: dragController.param as P } as S & { param: P })
              dragController.active = false
              dragController.param = undefined
            },
          },
          start(event: PointerEvent, param: P) {
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

vi.mock('~/composables/effect-editor/createParamDrag', createParamDragModule)

function createDeps(initialFields: Record<string, string> = {}) {
  const fields = reactive({ ...initialFields }) as Record<string, string>
  const emitTransform = vi.fn()

  const deps: EffectControlDeps = {
    getFields: () => fields,
    getFieldValue: path => fields[path] ?? '',
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
    button: 0,
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
})
