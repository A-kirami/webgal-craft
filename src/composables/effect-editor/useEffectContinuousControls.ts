import { createParamDrag } from '~/composables/effect-editor/createParamDrag'
import { EffectControlDeps } from '~/composables/effect-editor/types'
import { DialField } from '~/helper/command-registry/schema'
import { applyScrubStepModifier, clamp, degreeToRadian, getPointerAngleDegrees, normalizeAngleDelta, normalizeDegree, radianToDegree, roundByStep, roundToPrecision } from '~/helper/math'
import { usePreferenceStore } from '~/stores/preference'

import type { NumberField } from '~/helper/command-registry/schema'

/** NumberField 且必定有 linkedPairKey 的子类型（用于 linked-slider 控件） */
type LinkedNumberField = NumberField & { linkedPairKey: string }

// ─── 内部工具 ───

// 滑块值接近中心值时的吸附容差（占 min-max 范围的 2%）
const SLIDER_CENTER_SNAP_TOLERANCE = 0.02
// 按住 Shift 时旋钮的角度吸附步进（每 15 度）
const DIAL_DEGREE_SNAP = 15
// 弧度值存储精度（4 位小数，约 0.006 度误差）
const RADIAN_STORAGE_PRECISION = 4

function getFieldValueWithDefault(
  getFieldValue: (path: string) => string,
  path: string,
  defaultValue: number,
): string {
  const raw = getFieldValue(path)
  return raw || String(defaultValue)
}

function applySliderCenterSnap(value: number, center: number, min: number, max: number): number {
  const tolerance = (max - min) * SLIDER_CENTER_SNAP_TOLERANCE
  if (Math.abs(value - center) <= tolerance) {
    return center
  }
  return value
}

/**
 * 合并 number / slider / linked-slider / dial 四种连续型控件的逻辑。
 * 它们共享 EffectControlDeps 依赖和 emitTransform 发射模式。
 */
export function useEffectContinuousControls(deps: EffectControlDeps) {
  // ─── 共享更新辅助 ───

  interface FieldUpdateResult {
    fields: Record<string, string>
    value: number
  }

  function applyFieldUpdate(
    path: string,
    rawValue: string | number,
    options?: { flush?: boolean },
  ): FieldUpdateResult | undefined {
    const fields = deps.getFields()
    if (!rawValue && rawValue !== 0) {
      delete fields[path]
      deps.emitTransform(fields, { schedule: 'continuous', flush: options?.flush, deferAutoApply: !options?.flush })
      return undefined
    }
    const num = Number(rawValue)
    if (!Number.isFinite(num)) {
      return undefined
    }
    return { fields, value: num }
  }

  // ═══════════════════════════════════════
  // Number 控件
  // ═══════════════════════════════════════

  function updateNumberField(
    param: NumberField,
    rawValue: string,
    options: { flush?: boolean, clampValue?: boolean } = {},
  ) {
    const result = applyFieldUpdate(param.key, rawValue, options)
    if (!result) {
      return
    }
    const finalValue = options.clampValue ? clamp(result.value, param.min, param.max) : result.value
    deps.setNumericField(result.fields, param.key, finalValue)
    deps.emitTransform(result.fields, { schedule: 'continuous', flush: options.flush, deferAutoApply: !options.flush })
  }

  function canScrubNumber(param: NumberField): boolean {
    return param.scrubbable !== false
  }

  function resolveNumberScrubStep(param: NumberField, event: PointerEvent): number {
    const baseStep = param.scrubStep ?? 1
    return applyScrubStepModifier(baseStep, event, {
      altFactor: param.scrubStepAlt === undefined ? undefined : param.scrubStepAlt / baseStep,
      shiftFactor: param.scrubStepShift === undefined ? undefined : param.scrubStepShift / baseStep,
    })
  }

  const { drag: numberScrub, start: startNumberScrub } = createParamDrag<
    NumberField,
    { lastValue: number, startValue: number, startX: number }
  >({
    onStart(event, param) {
      if (!canScrubNumber(param) || event.button !== 0 || event.pointerType === 'touch') {
        return
      }
      const currentValue = deps.getNumberValue(param.key, param.defaultValue ?? 0)
      return { startX: event.clientX, startValue: currentValue, lastValue: currentValue }
    },
    onMove(event, state) {
      const step = resolveNumberScrubStep(state.param, event)
      if (!Number.isFinite(step) || step <= 0) {
        return
      }

      const deltaX = event.clientX - state.startX
      const nextValue = clamp(state.startValue + (deltaX * step), state.param.min, state.param.max)
      const normalized = roundByStep(nextValue, step)
      if (normalized === state.lastValue) {
        return
      }

      state.lastValue = normalized
      updateNumberField(state.param, String(normalized), { flush: false, clampValue: true })
    },
    onEnd(_event, state) {
      updateNumberField(state.param, String(state.lastValue), { flush: true, clampValue: true })
    },
  })

  function handleNumberLabelPointerDown(event: PointerEvent, param: NumberField) {
    event.preventDefault()
    startNumberScrub(event, param)
  }

  // ═══════════════════════════════════════
  // Slider 控件
  // ═══════════════════════════════════════

  function getSliderInputValue(param: NumberField): string {
    return getFieldValueWithDefault(deps.getFieldValue, param.key, param.defaultValue ?? 0)
  }

  function getSliderTrackValue(param: NumberField): number[] {
    const raw = deps.getNumberValue(param.key, param.defaultValue ?? 0)
    return [clamp(raw, param.min, param.max)]
  }

  function updateSliderField(
    param: NumberField,
    rawValue: string | number,
    options: { fromSlider?: boolean, flush?: boolean } = {},
  ) {
    const result = applyFieldUpdate(param.key, rawValue, options)
    if (!result) {
      return
    }
    const normalized = options.fromSlider
      ? applySliderCenterSnap(clamp(result.value, param.min ?? 0, param.max ?? 0), param.center ?? 0, param.min ?? 0, param.max ?? 0)
      : result.value
    deps.setNumericField(result.fields, param.key, normalized)
    deps.emitTransform(result.fields, { schedule: 'continuous', flush: options.flush, deferAutoApply: !options.flush })
  }

  function flushSliderField(param: NumberField) {
    updateSliderField(param, getSliderInputValue(param), { flush: true })
  }

  // ═══════════════════════════════════════
  // Linked Slider 控件
  // ═══════════════════════════════════════

  interface LinkedSliderLockSnapshot {
    value0: number
    value1: number
  }

  let linkedSliderLockSnapshots = $ref<Record<string, LinkedSliderLockSnapshot>>({})

  const preferenceStore = usePreferenceStore()

  function getLinkedSliderKey(param: LinkedNumberField): string {
    return `${param.key}|${param.linkedPairKey}`
  }

  function getLinkedSliderInputValue(param: LinkedNumberField, index: 0 | 1): string {
    const path = index === 0 ? param.key : param.linkedPairKey
    return getFieldValueWithDefault(deps.getFieldValue, path, param.defaultValue ?? 0)
  }

  function createLinkedSliderLockSnapshot(param: LinkedNumberField): LinkedSliderLockSnapshot {
    return {
      value0: deps.getNumberValue(param.key, param.defaultValue ?? 0),
      value1: deps.getNumberValue(param.linkedPairKey, param.defaultValue ?? 0),
    }
  }

  function getLinkedSliderLockSnapshot(param: LinkedNumberField): LinkedSliderLockSnapshot {
    const key = getLinkedSliderKey(param)
    const snapshot = linkedSliderLockSnapshots[key]
    if (snapshot) {
      return snapshot
    }

    const nextSnapshot = createLinkedSliderLockSnapshot(param)
    linkedSliderLockSnapshots[key] = nextSnapshot
    return nextSnapshot
  }

  function isLinkedSliderLocked(param: LinkedNumberField): boolean {
    const key = getLinkedSliderKey(param)
    return preferenceStore.effectEditorLinkedSliderLocks[key] ?? true
  }

  function toggleLinkedSliderLock(param: LinkedNumberField) {
    const key = getLinkedSliderKey(param)
    const nextLocked = !isLinkedSliderLocked(param)

    if (nextLocked) {
      linkedSliderLockSnapshots[key] = createLinkedSliderLockSnapshot(param)
    } else {
      delete linkedSliderLockSnapshots[key]
    }

    preferenceStore.effectEditorLinkedSliderLocks[key] = nextLocked
  }

  function updateLinkedSliderField(
    param: LinkedNumberField,
    index: 0 | 1,
    rawValue: string | number,
    options: { fromSlider?: boolean, flush?: boolean } = {},
  ) {
    const activePath = index === 0 ? param.key : param.linkedPairKey
    const passivePath = index === 0 ? param.linkedPairKey : param.key

    const result = applyFieldUpdate(activePath, rawValue, options)
    if (!result) {
      // 空值清除场景：同步清除被动字段
      if (!rawValue && rawValue !== 0 && isLinkedSliderLocked(param)) {
        const fields = deps.getFields()
        delete fields[activePath]
        delete fields[passivePath]
        deps.emitTransform(fields, { schedule: 'continuous', flush: options.flush, deferAutoApply: !options.flush })
      }
      return
    }

    const normalizedActive = options.fromSlider
      ? applySliderCenterSnap(clamp(result.value, param.min ?? 0, param.max ?? 0), param.center ?? 0, param.min ?? 0, param.max ?? 0)
      : result.value

    deps.setNumericField(result.fields, activePath, normalizedActive)

    if (isLinkedSliderLocked(param)) {
      const snapshot = getLinkedSliderLockSnapshot(param)
      // 联动滑块保持锁定时的比例关系：被动轴 = 主动轴 * (锁定时被动值 / 锁定时主动值)。
      // 当锁定时主动值为 0 时无法计算比例，回退为直接同步（两轴相等）
      let nextPassive = index === 0
        ? (snapshot.value0 === 0 ? normalizedActive : normalizedActive * (snapshot.value1 / snapshot.value0))
        : (snapshot.value1 === 0 ? normalizedActive : normalizedActive * (snapshot.value0 / snapshot.value1))
      if (options.fromSlider) {
        nextPassive = applySliderCenterSnap(clamp(nextPassive, param.min ?? 0, param.max ?? 0), param.center ?? 0, param.min ?? 0, param.max ?? 0)
      }
      deps.setNumericField(result.fields, passivePath, nextPassive)
    }

    deps.emitTransform(result.fields, { schedule: 'continuous', flush: options.flush, deferAutoApply: !options.flush })
  }

  function flushLinkedSliderField(param: LinkedNumberField, index: 0 | 1) {
    updateLinkedSliderField(param, index, getLinkedSliderInputValue(param, index), { flush: true })
  }

  // ═══════════════════════════════════════
  // Dial 控件
  // ═══════════════════════════════════════

  function dialStoreValueToDegree(param: DialField, value: number): number {
    if (param.dialUnit === 'deg') {
      return value
    }
    return radianToDegree(value)
  }

  function dialDegreeToStoreValue(param: DialField, degree: number): number {
    if (param.dialUnit === 'deg') {
      return degree
    }
    return roundToPrecision(degreeToRadian(degree), RADIAN_STORAGE_PRECISION)
  }

  function getDialDegree(param: DialField): number {
    const rawValue = deps.getNumberValue(param.key, param.defaultValue ?? 0)
    return dialStoreValueToDegree(param, rawValue)
  }

  function getDialIndicatorDegree(degree: number): number {
    return normalizeDegree(degree)
  }

  function getDialInputValue(param: DialField): string {
    return String(roundByStep(getDialDegree(param), 0.01))
  }

  function applyDialSnap(value: number, shiftKey: boolean): number {
    if (shiftKey) {
      return Math.round(value / DIAL_DEGREE_SNAP) * DIAL_DEGREE_SNAP
    }
    return value
  }

  function updateDialField(param: DialField, rawDegree: string | number, options: { flush?: boolean } = {}) {
    const result = applyFieldUpdate(param.key, rawDegree, options)
    if (!result) {
      return
    }
    const storeValue = dialDegreeToStoreValue(param, result.value)
    deps.setNumericField(result.fields, param.key, storeValue)
    deps.emitTransform(result.fields, { schedule: 'continuous', flush: options.flush, deferAutoApply: !options.flush })
  }

  function flushDialField(param: DialField) {
    updateDialField(param, getDialInputValue(param), { flush: true })
  }

  const { drag: dialDrag, start: startDialDrag } = createParamDrag<
    DialField,
    { centerX: number, centerY: number, lastDegree: number, lastPointerAngle: number, rawDegree: number }
  >({
    onStart(event, param) {
      if (event.button !== 0 || event.pointerType === 'touch') {
        return
      }

      const target = event.currentTarget as HTMLElement | null
      const rect = target?.getBoundingClientRect()
      if (!rect) {
        return
      }

      const degree = getDialDegree(param)
      const centerX = rect.left + (rect.width / 2)
      const centerY = rect.top + (rect.height / 2)
      const pointerAngle = getPointerAngleDegrees(event, centerX, centerY)
      return {
        centerX,
        centerY,
        lastPointerAngle: pointerAngle,
        rawDegree: degree,
        lastDegree: degree,
      }
    },
    onMove(event, state) {
      const pointerAngle = getPointerAngleDegrees(event, state.centerX, state.centerY)
      const deltaAngle = normalizeAngleDelta(pointerAngle - state.lastPointerAngle)
      const rawDegree = state.rawDegree + deltaAngle
      const snappedDegree = roundByStep(applyDialSnap(rawDegree, event.shiftKey), 0.01)

      state.lastPointerAngle = pointerAngle
      state.rawDegree = rawDegree
      if (snappedDegree === state.lastDegree) {
        return
      }

      state.lastDegree = snappedDegree
      updateDialField(state.param, snappedDegree, { flush: false })
    },
    onEnd(_event, state) {
      updateDialField(state.param, String(state.lastDegree), { flush: true })
    },
  })

  function handleDialPointerDown(event: PointerEvent, param: DialField) {
    event.preventDefault()
    startDialDrag(event, param)
  }

  // ═══════════════════════════════════════
  // 导出
  // ═══════════════════════════════════════

  function resetLinkedSliderState() {
    linkedSliderLockSnapshots = {}
  }

  return {
    // number
    updateNumberField,
    canScrubNumber,
    handleNumberLabelPointerDown,
    numberScrub,
    // slider
    getSliderTrackValue,
    getSliderInputValue,
    updateSliderField,
    flushSliderField,
    // linked slider
    isLinkedSliderLocked,
    toggleLinkedSliderLock,
    getLinkedSliderInputValue,
    updateLinkedSliderField,
    flushLinkedSliderField,
    resetLinkedSliderState,
    // dial
    getDialDegree,
    getDialIndicatorDegree,
    getDialInputValue,
    updateDialField,
    flushDialField,
    handleDialPointerDown,
    dialDrag,
  }
}
