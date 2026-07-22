import { createParamDrag } from '~/features/editor/effect-editor/createParamDrag'
import {
  effectDisplayBounds,
  effectDisplayToStored,
  effectStoredToDisplay,
} from '~/features/editor/effect-editor/effect-editor-config'
import {
  effectRotationDegreeToStoredRadian,
  formatEffectRotationDegree,
} from '~/features/editor/effect-editor/transform-rotation-format'
import { usePreferenceStore } from '~/stores/preference'
import { applyScrubStepModifier, clamp, getPointerAngleDegrees, normalizeAngleDelta, normalizeDegree, roundByStep } from '~/utils/math'

import type { ImmediatePointerDragEvent } from '~/composables/useImmediatePointerDrag'
import type { EffectDialField, EffectNumberField } from '~/features/editor/effect-editor/effect-editor-config'
import type { EffectControlDeps, EmitTransformOptions } from '~/features/editor/effect-editor/types'

/** NumberField 且必定有 linkedPairKey 的子类型（用于 linked-slider 控件） */
type LinkedNumberField = EffectNumberField & { linkedPairKey: string }

// ─── 内部工具 ───

// 滑块值接近中心值时的吸附容差（占 min-max 范围的 2%）
const SLIDER_CENTER_SNAP_TOLERANCE = 0.02
// 按住 Shift 时旋钮的角度吸附步进（每 15 度）
const DIAL_DEGREE_SNAP = 15

function createContinuousTransformOptions(flush?: boolean): EmitTransformOptions {
  return { schedule: 'continuous', flush, deferAutoApply: !flush }
}

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

  interface PendingContinuousTransformEmit {
    fields: Record<string, string>
    options: EmitTransformOptions
    touchedPaths: Set<string>
  }

  type ContinuousTransformEmitTiming = 'immediate' | 'nextFrame'

  interface ContinuousTransformEmitConfig {
    timing?: ContinuousTransformEmitTiming
    touchedPaths?: readonly string[]
  }

  let pendingContinuousTransformEmit: PendingContinuousTransformEmit | undefined
  let pendingContinuousTransformFrameId: number | undefined

  function cancelScheduledContinuousTransformEmit() {
    if (pendingContinuousTransformFrameId !== undefined) {
      cancelAnimationFrame(pendingContinuousTransformFrameId)
      pendingContinuousTransformFrameId = undefined
    }
    pendingContinuousTransformEmit = undefined
  }

  function cancelCurrentPreviewInteraction() {
    cancelScheduledContinuousTransformEmit()
    void deps.cancelPreview?.()
  }

  function emitContinuousTransform(
    fields: Record<string, string>,
    options: EmitTransformOptions,
    config: ContinuousTransformEmitConfig = {},
  ) {
    const { timing = 'immediate', touchedPaths = [] } = config

    if (options.flush) {
      cancelScheduledContinuousTransformEmit()
      deps.emitTransform(fields, options)
      return
    }

    if (timing === 'immediate') {
      deps.emitTransform(fields, options)
      return
    }

    const nextTouchedPaths = new Set(touchedPaths)
    if (pendingContinuousTransformEmit) {
      for (const path of pendingContinuousTransformEmit.touchedPaths) {
        if (!nextTouchedPaths.has(path)) {
          if (path in pendingContinuousTransformEmit.fields) {
            fields[path] = pendingContinuousTransformEmit.fields[path]
          } else {
            delete fields[path]
          }
        }
        nextTouchedPaths.add(path)
      }
    }

    pendingContinuousTransformEmit = {
      fields,
      options,
      touchedPaths: nextTouchedPaths,
    }
    if (pendingContinuousTransformFrameId !== undefined) {
      return
    }

    pendingContinuousTransformFrameId = requestAnimationFrame(() => {
      pendingContinuousTransformFrameId = undefined
      const pending = pendingContinuousTransformEmit
      pendingContinuousTransformEmit = undefined
      if (!pending) {
        return
      }
      deps.emitTransform(pending.fields, pending.options)
    })
  }

  function clearPendingContinuousTransformField(path: string): boolean {
    return clearPendingContinuousTransformFields([path])
  }

  function clearPendingContinuousTransformFields(paths: readonly string[]): boolean {
    const pending = pendingContinuousTransformEmit
    if (!pending) {
      return false
    }

    let hasTouchedPath = false
    for (const path of paths) {
      delete pending.fields[path]
      if (pending.touchedPaths.delete(path)) {
        hasTouchedPath = true
      }
    }

    if (!hasTouchedPath) {
      return false
    }
    if (pending.touchedPaths.size === 0) {
      cancelScheduledContinuousTransformEmit()
    }
    return true
  }

  function parseFieldUpdate(
    path: string,
    rawValue: string | number,
    options?: { flush?: boolean },
  ): FieldUpdateResult | undefined {
    const fields = deps.getFields()
    if (!rawValue && rawValue !== 0) {
      delete fields[path]
      emitContinuousTransform(fields, createContinuousTransformOptions(options?.flush), {
        touchedPaths: [path],
      })
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

  function updateNumberFieldValue(
    param: EffectNumberField,
    rawValue: string,
    options: { flush?: boolean, clampValue?: boolean } = {},
    emitTiming: ContinuousTransformEmitTiming = 'immediate',
  ) {
    const result = parseFieldUpdate(param.key, rawValue, options)
    if (!result) {
      return
    }
    const storedValue = effectDisplayToStored(param, result.value)
    const finalValue = options.clampValue ? clamp(storedValue, param.min, param.max) : storedValue
    deps.setNumericField(result.fields, param.key, finalValue)
    emitContinuousTransform(
      result.fields,
      createContinuousTransformOptions(options.flush),
      { timing: emitTiming, touchedPaths: [param.key] },
    )
  }

  function updateNumberField(
    param: EffectNumberField,
    rawValue: string,
    options: { flush?: boolean, clampValue?: boolean } = {},
  ) {
    updateNumberFieldValue(param, rawValue, options)
  }

  function canScrubNumber(param: EffectNumberField): boolean {
    return param.scrubbable !== false
  }

  function resolveNumberScrubStep(param: EffectNumberField, event: ImmediatePointerDragEvent): number {
    const baseStep = param.scrubStep ?? 1
    return applyScrubStepModifier(baseStep, event, {
      altFactor: param.scrubStepAlt === undefined ? undefined : param.scrubStepAlt / baseStep,
      shiftFactor: param.scrubStepShift === undefined ? undefined : param.scrubStepShift / baseStep,
    })
  }

  const { drag: numberScrub, start: startNumberScrub } = createParamDrag<
    EffectNumberField,
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
      updateNumberFieldValue(state.param, String(effectStoredToDisplay(state.param, normalized)), { flush: false, clampValue: true }, 'nextFrame')
    },
    onEnd(_event, state) {
      updateNumberFieldValue(state.param, String(effectStoredToDisplay(state.param, state.lastValue)), { flush: true, clampValue: true })
    },
    onCancel() {
      cancelCurrentPreviewInteraction()
    },
  })

  function handleNumberLabelPointerDown(event: PointerEvent, param: EffectNumberField) {
    event.preventDefault()
    startNumberScrub(event, param)
  }

  // ═══════════════════════════════════════
  // Slider 控件
  // ═══════════════════════════════════════

  function getSliderInputValue(param: EffectNumberField): string {
    return getFieldValueWithDefault(deps.getFieldValue, param.key, effectStoredToDisplay(param, param.defaultValue ?? 0))
  }

  function getSliderTrackValue(param: EffectNumberField): number[] {
    const raw = deps.getNumberValue(param.key, param.defaultValue ?? 0)
    const displayValue = effectStoredToDisplay(param, raw)
    const bounds = effectDisplayBounds(param)
    return [clamp(displayValue, bounds.min, bounds.max)]
  }

  function getSliderMin(param: EffectNumberField): number | undefined {
    return effectDisplayBounds(param).min
  }

  function getSliderMax(param: EffectNumberField): number | undefined {
    return effectDisplayBounds(param).max
  }

  function getSliderStep(param: EffectNumberField): number | undefined {
    return effectDisplayBounds(param).step
  }

  function getFieldUnit(param: EffectNumberField | EffectDialField) {
    return param.display?.unit
  }

  function getStoredFieldValue(path: string): string | undefined {
    const value = deps.getStoredFieldValue(path)
    return value === '' ? undefined : value
  }

  function isImplicitDefaultWrite(path: string, value: number, defaultValue?: number): boolean {
    return defaultValue !== undefined && value === defaultValue && getStoredFieldValue(path) === undefined
  }

  function updateSliderField(
    param: EffectNumberField,
    rawValue: string | number,
    options: { fromSlider?: boolean, flush?: boolean } = {},
  ) {
    const result = parseFieldUpdate(param.key, rawValue, options)
    if (!result) {
      return
    }
    const storedValue = effectDisplayToStored(param, result.value)
    const normalized = options.fromSlider
      ? applySliderCenterSnap(clamp(storedValue, param.min ?? 0, param.max ?? 0), param.center ?? 0, param.min ?? 0, param.max ?? 0)
      : storedValue
    if (options.fromSlider && isImplicitDefaultWrite(param.key, normalized, param.defaultValue)) {
      clearPendingContinuousTransformField(param.key)
      return
    }
    deps.setNumericField(result.fields, param.key, normalized)
    emitContinuousTransform(
      result.fields,
      createContinuousTransformOptions(options.flush),
      {
        timing: options.fromSlider ? 'nextFrame' : 'immediate',
        touchedPaths: [param.key],
      },
    )
  }

  function flushSliderField(param: EffectNumberField) {
    const storedValue = getStoredFieldValue(param.key)
    if (storedValue === undefined) {
      clearPendingContinuousTransformField(param.key)
      return
    }
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
    return getFieldValueWithDefault(deps.getFieldValue, path, effectStoredToDisplay(param, param.defaultValue ?? 0))
  }

  function getLinkedSliderTrackValue(param: LinkedNumberField, index: 0 | 1): number[] {
    const path = index === 0 ? param.key : param.linkedPairKey
    const raw = deps.getNumberValue(path, param.defaultValue ?? 0)
    const bounds = effectDisplayBounds(param)
    return [clamp(effectStoredToDisplay(param, raw), bounds.min, bounds.max)]
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

    const result = parseFieldUpdate(activePath, rawValue, options)
    if (!result) {
      // 空值清除场景：同步清除被动字段
      if (!rawValue && rawValue !== 0 && isLinkedSliderLocked(param)) {
        const fields = deps.getFields()
        delete fields[activePath]
        delete fields[passivePath]
        emitContinuousTransform(
          fields,
          createContinuousTransformOptions(options.flush),
          {
            timing: options.fromSlider ? 'nextFrame' : 'immediate',
            touchedPaths: [activePath, passivePath],
          },
        )
      }
      return
    }

    const storedValue = effectDisplayToStored(param, result.value)
    const normalizedActive = options.fromSlider
      ? applySliderCenterSnap(clamp(storedValue, param.min ?? 0, param.max ?? 0), param.center ?? 0, param.min ?? 0, param.max ?? 0)
      : storedValue

    if (
      options.fromSlider
      && isImplicitDefaultWrite(activePath, normalizedActive, param.defaultValue)
      && (!isLinkedSliderLocked(param) || getStoredFieldValue(passivePath) === undefined)
    ) {
      clearPendingContinuousTransformFields([activePath, passivePath])
      return
    }

    deps.setNumericField(result.fields, activePath, normalizedActive)
    const touchedPaths = [activePath]

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
      touchedPaths.push(passivePath)
    }

    emitContinuousTransform(
      result.fields,
      createContinuousTransformOptions(options.flush),
      {
        timing: options.fromSlider ? 'nextFrame' : 'immediate',
        touchedPaths,
      },
    )
  }

  function flushLinkedSliderField(param: LinkedNumberField, index: 0 | 1) {
    const path = index === 0 ? param.key : param.linkedPairKey
    const storedValue = getStoredFieldValue(path)
    if (storedValue === undefined) {
      return
    }
    updateLinkedSliderField(param, index, getLinkedSliderInputValue(param, index), { flush: true })
  }

  // ═══════════════════════════════════════
  // Dial 控件
  // ═══════════════════════════════════════

  function dialDegreeToStoreValue(param: EffectDialField, degree: number): number {
    if (param.dialUnit === 'deg') {
      return formatEffectRotationDegree(degree)
    }
    return effectRotationDegreeToStoredRadian(degree)
  }

  function getDialDegree(param: EffectDialField): number {
    const rawValue = deps.getNumberValue(param.key, param.defaultValue ?? 0)
    return effectStoredToDisplay(param, rawValue)
  }

  function getDialIndicatorDegree(degree: number): number {
    return normalizeDegree(degree)
  }

  function getDialInputValue(param: EffectDialField): string {
    return String(formatEffectRotationDegree(getDialDegree(param)))
  }

  function applyDialSnap(value: number, shiftKey: boolean): number {
    if (shiftKey) {
      return Math.round(value / DIAL_DEGREE_SNAP) * DIAL_DEGREE_SNAP
    }
    return value
  }

  function updateDialField(
    param: EffectDialField,
    rawDegree: string | number,
    options: { flush?: boolean } = {},
    emitTiming: ContinuousTransformEmitTiming = 'immediate',
  ) {
    const result = parseFieldUpdate(param.key, rawDegree, options)
    if (!result) {
      return
    }
    const storeValue = dialDegreeToStoreValue(param, result.value)
    deps.setNumericField(result.fields, param.key, storeValue)
    emitContinuousTransform(
      result.fields,
      createContinuousTransformOptions(options.flush),
      { timing: emitTiming, touchedPaths: [param.key] },
    )
  }

  function flushDialField(param: EffectDialField) {
    if (getStoredFieldValue(param.key) === undefined) {
      return
    }
    updateDialField(param, getDialInputValue(param), { flush: true })
  }

  const { drag: dialDrag, start: startDialDrag } = createParamDrag<
    EffectDialField,
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
      const snappedDegree = formatEffectRotationDegree(applyDialSnap(rawDegree, event.shiftKey))

      state.lastPointerAngle = pointerAngle
      state.rawDegree = rawDegree
      if (snappedDegree === state.lastDegree) {
        return
      }

      state.lastDegree = snappedDegree
      updateDialField(state.param, snappedDegree, { flush: false }, 'nextFrame')
    },
    onEnd(_event, state) {
      updateDialField(state.param, String(state.lastDegree), { flush: true })
    },
    onCancel() {
      cancelCurrentPreviewInteraction()
    },
  })

  function handleDialPointerDown(event: PointerEvent, param: EffectDialField) {
    event.preventDefault()
    startDialDrag(event, param)
  }

  // ═══════════════════════════════════════
  // 导出
  // ═══════════════════════════════════════

  function resetLinkedSliderState() {
    linkedSliderLockSnapshots = {}
  }

  tryOnUnmounted(cancelScheduledContinuousTransformEmit)

  return {
    // number
    updateNumberField,
    canScrubNumber,
    handleNumberLabelPointerDown,
    numberScrub,
    // slider
    getSliderTrackValue,
    getSliderMin,
    getSliderMax,
    getSliderStep,
    getFieldUnit,
    getSliderInputValue,
    updateSliderField,
    flushSliderField,
    // linked slider
    isLinkedSliderLocked,
    toggleLinkedSliderLock,
    getLinkedSliderInputValue,
    getLinkedSliderTrackValue,
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
