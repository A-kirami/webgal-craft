import { createParamDrag } from '~/composables/effect-editor/createParamDrag'
import { usePointerDrag } from '~/composables/usePointerDrag'
import { ArgField, EditorField, resolveSurfaceVariant } from '~/helper/command-registry/schema'
import { clamp, roundByStep } from '~/helper/math'
import { StatementEditorSurface } from '~/helper/statement-editor/surface-context'

interface UseStatementEditorScrubOptions {
  surface: StatementEditorSurface
  contentField: Readonly<Ref<EditorField | undefined>>
  readArgValue: (argField: ArgField) => string | boolean | number
  readContentValue: () => string
  updateArgValue: (argField: ArgField, value: string) => void
  updateContentValue: (value: string) => void
}

interface ContentScrubState {
  startX: number
  startValue: number
  lastValue: number
}

type NumericArgField = ArgField & {
  field: Extract<ArgField['field'], { type: 'number' }>
}

export function useStatementEditorScrub(options: UseStatementEditorScrubOptions) {
  function isNumericArgField(argField: ArgField): argField is NumericArgField {
    return argField.field.type === 'number'
  }

  function isSliderInputNumberField(argField: NumericArgField): boolean {
    const fallback = argField.field.unit ? 'input-with-unit' : 'input'
    return resolveSurfaceVariant(argField.field.variant, options.surface, fallback) === 'slider-input'
  }

  function canScrubArgField(argField: ArgField): argField is NumericArgField {
    if (!isNumericArgField(argField)) {
      return false
    }
    if (argField.field.scrubbable === false) {
      return false
    }
    if (isSliderInputNumberField(argField) && options.surface !== 'inline') {
      return false
    }
    return true
  }

  function getCurrentNumberValue(argField: NumericArgField): number {
    const rawValue = Number(options.readArgValue(argField))
    if (Number.isFinite(rawValue)) {
      return rawValue
    }
    if ('defaultValue' in argField.field && typeof argField.field.defaultValue === 'number') {
      return argField.field.defaultValue
    }
    return 0
  }

  function resolveScrubStep(argField: NumericArgField, event: PointerEvent): number {
    const baseStep = argField.field.scrubStep ?? 1
    if (event.altKey) {
      return argField.field.scrubStepAlt ?? baseStep / 10
    }
    if (event.shiftKey) {
      return argField.field.scrubStepShift ?? baseStep * 10
    }
    return baseStep
  }

  // ─── arg 数值拖拽 ───

  const { start: startArgScrub } = createParamDrag<NumericArgField, {
    startX: number
    startValue: number
    lastValue: number
  }>({
    onStart(event, argField) {
      if (event.button !== 0 || event.pointerType === 'touch') {
        return
      }
      const startValue = getCurrentNumberValue(argField)
      return { startX: event.clientX, startValue, lastValue: startValue }
    },
    onMove(event, state) {
      const step = resolveScrubStep(state.param, event)
      if (!Number.isFinite(step) || step <= 0) {
        return
      }
      const deltaX = event.clientX - state.startX
      const nextValue = clamp(state.startValue + (deltaX * step), state.param.field.min, state.param.field.max)
      const normalizedValue = roundByStep(nextValue, step)
      if (normalizedValue === state.lastValue) {
        return
      }
      state.lastValue = normalizedValue
      options.updateArgValue(state.param, String(normalizedValue))
    },
    onEnd() { /* noop */ },
  })

  function handleArgLabelPointerDown(event: PointerEvent, argField: ArgField) {
    if (!canScrubArgField(argField) || event.button !== 0 || event.pointerType === 'touch') {
      return
    }
    event.preventDefault()
    ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
    startArgScrub(event, argField)
  }

  // ─── content 数值拖拽 ───

  const contentScrub = usePointerDrag<ContentScrubState>({
    onStart(event) {
      if (event.button !== 0 || event.pointerType === 'touch') {
        return
      }
      const rawValue = Number(options.readContentValue())
      const startValue = Number.isFinite(rawValue) ? rawValue : 0
      return { startX: event.clientX, startValue, lastValue: startValue }
    },
    onMove(event, state) {
      const contentField = options.contentField.value?.field
      const min = contentField?.type === 'number' ? contentField.min : undefined
      const max = contentField?.type === 'number' ? contentField.max : undefined

      const step = event.altKey ? 0.1 : (event.shiftKey ? 10 : 1)
      const deltaX = event.clientX - state.startX
      const nextValue = clamp(state.startValue + (deltaX * step), min, max)
      const normalizedValue = roundByStep(nextValue, step)
      if (normalizedValue === state.lastValue) {
        return
      }
      state.lastValue = normalizedValue
      options.updateContentValue(String(normalizedValue))
    },
    onEnd() { /* noop */ },
  })

  function handleContentLabelPointerDown(event: PointerEvent) {
    const contentField = options.contentField.value?.field
    const canScrubContent = contentField?.type === 'number'
    const hasUnit = canScrubContent && !!contentField.unit
    if (!hasUnit || event.button !== 0 || event.pointerType === 'touch') {
      return
    }
    event.preventDefault()
    ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
    contentScrub.start(event)
  }

  // ─── slider input 提交 ───

  function commitSliderInput(argField: ArgField, event: Event) {
    if (!isNumericArgField(argField)) {
      return
    }
    const raw = Number((event.target as HTMLInputElement).value)
    const value = Number.isFinite(raw) ? raw : 0
    const clamped = clamp(value, argField.field.min, argField.field.max)
    options.updateArgValue(argField, String(clamped))
  }

  return {
    canScrubArgField,
    handleArgLabelPointerDown,
    handleContentLabelPointerDown,
    commitSliderInput,
  }
}
