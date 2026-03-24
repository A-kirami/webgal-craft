import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

import { useEffectContinuousControls } from '~/composables/effect-editor/useEffectContinuousControls'

import type { EffectControlDeps } from '~/composables/effect-editor/types'
import type { DialField, NumberField } from '~/helper/command-registry/schema'

const { setupPreferenceStoreMock, usePreferenceStoreMock } = vi.hoisted(() => {
  const usePreferenceStoreMock = vi.fn()

  function setupPreferenceStoreMock() {
    return {
      usePreferenceStore: usePreferenceStoreMock,
    }
  }

  return {
    setupPreferenceStoreMock,
    usePreferenceStoreMock,
  }
})

const preferenceStoreState = reactive({
  effectEditorLinkedSliderLocks: {} as Record<string, boolean>,
})

vi.mock('~/stores/preference', setupPreferenceStoreMock)

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

function createNumberField(overrides: Partial<NumberField> = {}): NumberField {
  return {
    key: 'x',
    type: 'number',
    label: '',
    ...overrides,
  }
}

function createLinkedNumberField(
  overrides: Partial<NumberField & { linkedPairKey: string }> = {},
): NumberField & { linkedPairKey: string } {
  return {
    key: 'scaleX',
    type: 'number',
    label: '',
    linkedPairKey: 'scaleY',
    ...overrides,
  }
}

function createDialField(overrides: Partial<DialField> = {}): DialField {
  return {
    key: 'rotate',
    type: 'dial',
    label: '',
    dialUnit: 'rad',
    ...overrides,
  }
}

describe('useEffectContinuousControls', () => {
  beforeEach(() => {
    usePreferenceStoreMock.mockReset()
    preferenceStoreState.effectEditorLinkedSliderLocks = {}
    usePreferenceStoreMock.mockReturnValue(preferenceStoreState)
  })

  it('updateNumberField 支持裁剪并按 continuous 模式 flush', () => {
    const { deps, emitTransform, fields } = createDeps()
    const controls = useEffectContinuousControls(deps)

    controls.updateNumberField(createNumberField({
      min: 0,
      max: 10,
    }), '12', { flush: true, clampValue: true })

    expect(fields.x).toBe('10')
    expect(emitTransform).toHaveBeenCalledWith(fields, {
      schedule: 'continuous',
      flush: true,
      deferAutoApply: false,
    })
  })

  it('slider 与 linked-slider 会应用中心吸附与锁定比例', () => {
    const { deps, fields } = createDeps({
      scaleX: '2',
      scaleY: '4',
      offset: '0.01',
    })
    const controls = useEffectContinuousControls(deps)
    const linkedField = createLinkedNumberField({
      min: 0,
      max: 100,
    })

    controls.updateSliderField(createNumberField({
      key: 'offset',
      min: -1,
      max: 1,
      center: 0,
    }), 0.01, { fromSlider: true })
    expect(fields.offset).toBe('0')

    controls.toggleLinkedSliderLock(linkedField)
    controls.toggleLinkedSliderLock(linkedField)
    controls.updateLinkedSliderField(linkedField, 0, 6)
    expect(fields.scaleX).toBe('6')
    expect(fields.scaleY).toBe('12')
  })

  it('锁定快照主轴为 0 时，linked-slider 会回退为双轴同步', () => {
    const { deps, fields } = createDeps({
      scaleX: '0',
      scaleY: '5',
    })
    const controls = useEffectContinuousControls(deps)
    const linkedField = createLinkedNumberField({
      min: 0,
      max: 100,
    })

    controls.toggleLinkedSliderLock(linkedField)
    controls.toggleLinkedSliderLock(linkedField)
    controls.updateLinkedSliderField(linkedField, 0, 3)

    expect(fields.scaleX).toBe('3')
    expect(fields.scaleY).toBe('3')
  })

  it('dial 会在 deg/rad 之间双向转换，并保留四位弧度精度', () => {
    const { deps, fields } = createDeps({
      rotate: String(Math.PI),
    })
    const controls = useEffectContinuousControls(deps)

    const dialField = createDialField()

    expect(controls.getDialDegree(dialField)).toBeCloseTo(180)
    controls.updateDialField(dialField, 90, { flush: true })
    expect(Number(fields.rotate)).toBeCloseTo(1.5708)
    expect(controls.getDialInputValue(dialField)).toBe('90')
  })
})
